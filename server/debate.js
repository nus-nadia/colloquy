// DebateSession — state machine + turn loop + SSE fanout.

import { randomUUID } from 'node:crypto';
import { getProvider } from './providers/index.js';
import { getVisualProvider } from './visuals/index.js';
import { getScenario } from './prompts/index.js';
import {
  buildVisualDirectorPrompt,
  composeVisualPrompt,
  VISUAL_ARCHETYPES,
  DEFAULT_VISUAL_ARCHETYPE,
  VISUAL_PROMPT_MAX_CHARS,
  VISUAL_ALT_MAX_CHARS,
} from './prompts/visuals.js';

const AUTO_ADVANCE_PAUSE_MS = 1500;

// Turn-visual pipeline tuning.
// Call 1 returns a small JSON object — a few dozen tokens of visible output.
// The budget is far larger than that because on a reasoning model this cap
// covers reasoning tokens too (OpenAI's `max_completion_tokens` is the whole
// completion, thinking included), and the director's default model is one.
// At 700 the model would spend the budget thinking, emit the opening of a
// perfectly well-formed object, and get cut off mid-string — which parses as
// nothing and silently lands on the fallback archetype. Sized for the worst
// case: truncation here is invisible in the UI, and the visible output this
// caps is tiny, so there is nothing to be won by trimming it.
const VISUAL_DIRECTOR_MAX_TOKENS = 4000;
const VISUAL_STATEMENT_MAX_CHARS = 6000; // the director only needs the argument
const VISUAL_IMAGE_SIZE = '1536x1024'; // 3:2 landscape, matches the style preamble
// Sessions are never evicted (see CLAUDE.md), and image bytes are by far the
// largest thing a session can accumulate. Past this budget the pipeline
// short-circuits to 'skipped' rather than growing the process without bound.
const VISUAL_SESSION_BYTE_BUDGET = 40 * 1024 * 1024;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Join consecutive same-role messages with a blank line between them.
// A moderator entry sitting between two agent turns reconstructs as a
// `user` message next to the opponent's `user` message; Anthropic's API
// requires strict user/assistant alternation, so merge before sending.
function mergeConsecutiveRoles(messages) {
  const merged = [];
  for (const message of messages) {
    const last = merged[merged.length - 1];
    if (last && last.role === message.role) {
      last.content = `${last.content}\n\n${message.content}`;
    } else {
      merged.push({ ...message });
    }
  }
  return merged;
}

// Rough words-per-statement -> max_tokens budget. Generous enough that
// a ~150-word target doesn't get truncated mid-sentence, capped so a
// runaway response can't stall a classroom demo.
function wordTargetToMaxTokens(wordTarget) {
  const words = wordTarget ?? 160;
  return Math.min(4096, Math.max(512, Math.round(words * 8)));
}

// Parse the visual director's reply into { archetype, prompt, alt, requested }.
// Deliberately forgiving: a model that wraps its JSON in a code fence or adds
// a sentence of preamble has still done the useful part of the job, and an
// unusable reply degrades to the default archetype rather than failing the
// whole visual. Returns null only when there is no object to be found at all.
//
// `requested` carries the archetype the model actually asked for, before the
// coercion on the line below. Both degradations are silent to the user — the
// image still renders, just under an archetype nothing chose — so the caller
// compares the two and logs the difference. Without it, a director that never
// returns a valid archetype looks exactly like one that keeps picking
// `comparison`, and every visual quietly inherits that archetype's mandated
// struck-through row.
function parseDirectorReply(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  // Strip a stray ```json … ``` fence, then take the outermost braces.
  const unfenced = text.replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/, '');
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  let parsed;
  try {
    parsed = JSON.parse(unfenced.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const archetype = typeof parsed.archetype === 'string' ? parsed.archetype.trim().toLowerCase() : '';
  return {
    archetype: Object.hasOwn(VISUAL_ARCHETYPES, archetype) ? archetype : DEFAULT_VISUAL_ARCHETYPE,
    prompt: String(parsed.prompt ?? '').trim().slice(0, VISUAL_PROMPT_MAX_CHARS),
    alt: String(parsed.alt ?? '').trim().slice(0, VISUAL_ALT_MAX_CHARS),
    requested: archetype,
  };
}

export class DebateSession {
  constructor(config) {
    this.id = randomUUID();
    this.config = config; // { paper, agents: [a,b], maxTurns, autoAdvance, wordTarget, scenarioId }
    // Resolved once per session, not per turn: the scenario cannot change
    // mid-debate, and re-resolving inside runTurn() would let a config edit
    // swap the prompt shape out from under a transcript already built on it.
    this.scenario = getScenario(config.scenarioId);
    this.state = 'configured'; // configured | running | paused | finished
    this.transcript = []; // completed turns
    this.turn = 0; // index of the next turn to play
    this.liveTurn = null; // { turn, agentIndex, text } while a turn is streaming
    this.lastError = null; // { message, turn } | null
    this.turnInFlight = false;
    this._looping = false;
    this.subscribers = new Set();
    // Generated turn visuals, keyed by turn index: { bytes: Buffer, mime }.
    // Bytes live here and ONLY here — never on a transcript entry and never in
    // getSnapshot(), which is re-sent to every reconnecting tab and which
    // EventSource re-requests on its own after a dropped connection. Base64 in
    // the snapshot would push megabytes per reconnect. The entry carries the
    // metadata; the bytes are fetched once over GET /api/debates/:id/visuals/:turn.
    this.visualBytes = new Map();
    this.visualBytesTotal = 0;
  }

  // ---------- SSE plumbing ----------

  subscribe(res) {
    this.subscribers.add(res);
    res.on('close', () => this.subscribers.delete(res));
    this._sendEvent(res, 'snapshot', this.getSnapshot());
  }

  broadcast(type, data) {
    for (const res of this.subscribers) this._sendEvent(res, type, data);
  }

  _sendEvent(res, type, data) {
    res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  broadcastState() {
    this.broadcast('state', { state: this.state, lastError: this.lastError, turn: this.turn });
  }

  getSnapshot() {
    return {
      id: this.id,
      config: this.config,
      state: this.state,
      lastError: this.lastError,
      turn: this.turn,
      transcript: this.transcript,
      liveTurn: this.liveTurn,
    };
  }

  setState(state) {
    this.state = state;
    this.broadcastState();
  }

  // ---------- message construction ----------

  messagesForSpeaker(turnIndex, speakerIndex) {
    const opponentIndex = 1 - speakerIndex;
    const opponentName = this.config.agents[opponentIndex].name;
    const messages = [];
    // Agent 0 always opens the debate; the synthetic opening moderator
    // instruction is the "seed" user message that keeps agent 0's
    // reconstructed history starting (and, trivially, ending) with a
    // user role even once its own prior turns appear as `assistant`.
    if (speakerIndex === 0) {
      messages.push({ role: 'user', content: this.scenario.openingModeratorMessage({ opponentName }) });
    }
    for (const entry of this.transcript) {
      if (entry.type === 'moderator') {
        messages.push({ role: 'user', content: this.scenario.moderatorInterjection(entry.text) });
      } else {
        messages.push({
          role: entry.agentIndex === speakerIndex ? 'assistant' : 'user',
          content: entry.text,
        });
      }
    }
    // Merge first so a moderator note between two agent turns doesn't
    // leave two consecutive user messages, then append the final-round
    // note to the last message of the merged (alternating) array.
    const merged = mergeConsecutiveRoles(messages);
    const isFinalRound = turnIndex >= 1 && turnIndex >= this.config.maxTurns - 2;
    if (isFinalRound) {
      const last = merged[merged.length - 1];
      last.content = `${last.content}\n\n${this.scenario.finalRoundModeratorNote()}`;
    }
    return merged;
  }

  // ---------- turn loop ----------

  async runTurn() {
    if (this.turnInFlight) return;
    if (this.turn >= this.config.maxTurns) {
      this._finish();
      return;
    }
    this.turnInFlight = true;
    const turnIndex = this.turn;
    const speakerIndex = turnIndex % 2;
    const opponentIndex = 1 - speakerIndex;
    const agent = this.config.agents[speakerIndex];
    const opponent = this.config.agents[opponentIndex];
    const provider = getProvider(agent.provider);
    const startedAt = Date.now();

    this.lastError = null;
    this.liveTurn = { turn: turnIndex, agentIndex: speakerIndex, text: '' };
    this.broadcast('turn_start', {
      turn: turnIndex,
      agentIndex: speakerIndex,
      provider: agent.provider,
      model: agent.model,
      startedAt,
    });

    try {
      const system = this.scenario.buildSystemPrompt({
        name: agent.name,
        opponentName: opponent.name,
        stance: agent.stance,
        paper: this.config.paper,
        wordTarget: this.config.wordTarget,
      });
      const messages = this.messagesForSpeaker(turnIndex, speakerIndex);
      const maxTokens = wordTargetToMaxTokens(this.config.wordTarget);

      for await (const chunk of provider.stream({ model: agent.model, system, messages, maxTokens })) {
        if (!chunk) continue;
        this.liveTurn.text += chunk;
        this.broadcast('delta', { turn: turnIndex, text: chunk });
      }

      const finishedAt = Date.now();
      const entry = {
        turn: turnIndex,
        agentIndex: speakerIndex,
        text: this.liveTurn.text,
        provider: agent.provider,
        model: agent.model,
        startedAt,
        finishedAt,
      };
      this.transcript.push(entry);
      this.liveTurn = null;
      this.turn += 1;
      this.broadcast('turn_end', entry);

      // Fire-and-forget, and awaited by nobody: the visual pipeline is off the
      // text-streaming critical path, so the next turn starts (and the closing
      // ceremony runs) without waiting on an image API. _generateVisual traps
      // everything itself — see the error-policy note on it.
      if (this.config.visuals?.enabled) {
        this._generateVisual(entry).catch(() => {});
      }

      if (this.turn >= this.config.maxTurns) {
        this._finish();
      }
    } catch (err) {
      this.liveTurn = null;
      this.lastError = { message: err?.message || String(err), turn: turnIndex };
      this.state = 'paused';
      this.broadcast('error', { message: this.lastError.message, turn: turnIndex });
      this.broadcastState();
    } finally {
      this.turnInFlight = false;
    }
  }

  // ---------- turn visuals ----------

  _broadcastVisual(entry) {
    this.broadcast('visual_status', { turn: entry.turn, visual: entry.visual });
  }

  /**
   * Two-call pipeline that illustrates a completed statement: a text model
   * picks an archetype and writes the subject, then an image model draws it.
   *
   * ERROR POLICY — deliberately different from runTurn(). Everywhere else a
   * provider failure sets `lastError` and forces `state = 'paused'`. A
   * rate-limited or slow image API must never halt a live classroom, so this
   * method traps its own errors and touches NONE of `lastError`, `state`, or
   * `turnInFlight`. A failed visual is a failed visual and nothing more.
   */
  async _generateVisual(entry) {
    const visuals = this.config.visuals;
    entry.visual = { status: 'pending', archetype: null, alt: null, mime: null, error: null };

    // Budget guard before doing any work — see VISUAL_SESSION_BYTE_BUDGET.
    if (this.visualBytesTotal >= VISUAL_SESSION_BYTE_BUDGET) {
      entry.visual.status = 'skipped';
      this._broadcastVisual(entry);
      return;
    }
    this._broadcastVisual(entry);

    try {
      // Call 1 — the director, over the ordinary text-provider contract, using
      // the SAME provider as the speaking agent: no extra key to configure,
      // and the Mock provider covers it offline. A lone user message satisfies
      // the contract's "first and last entries are role 'user'" rule.
      const textProvider = getProvider(this.config.agents[entry.agentIndex].provider);
      if (!textProvider) throw new Error('Unknown text provider for the visual director.');
      const imageProvider = getVisualProvider(visuals.provider);
      if (!imageProvider) throw new Error(`Unknown visual provider "${visuals.provider}".`);

      const directorSystem = buildVisualDirectorPrompt({ paperTitle: this.config.paper.title });
      let raw = '';
      for await (const chunk of textProvider.stream({
        model: visuals.directorModel,
        system: directorSystem,
        messages: [{ role: 'user', content: entry.text.slice(0, VISUAL_STATEMENT_MAX_CHARS) }],
        maxTokens: VISUAL_DIRECTOR_MAX_TOKENS,
      })) {
        if (chunk) raw += chunk;
      }

      // Both fallbacks below still produce an image, so neither surfaces in the
      // UI. Log them to the npm start terminal instead: an unparseable reply in
      // particular sends the raw statement into the prompt as its own "subject"
      // under an archetype the director never picked.
      const parsedSpec = parseDirectorReply(raw);
      if (!parsedSpec) {
        console.warn(
          `[visual turn ${entry.turn + 1}] director reply did not parse as JSON — falling back to ` +
            `the "${DEFAULT_VISUAL_ARCHETYPE}" archetype with the raw statement as its subject. ` +
            `Reply was: ${JSON.stringify(raw.slice(0, 300))}`,
        );
      } else if (parsedSpec.requested !== parsedSpec.archetype) {
        const asked = parsedSpec.requested ? JSON.stringify(parsedSpec.requested) : '(no archetype field)';
        console.warn(
          `[visual turn ${entry.turn + 1}] director asked for archetype ${asked}, which is not in the ` +
            `archetype list — falling back to "${parsedSpec.archetype}".`,
        );
      }

      const spec = parsedSpec ?? {
        archetype: DEFAULT_VISUAL_ARCHETYPE,
        prompt: entry.text.slice(0, VISUAL_PROMPT_MAX_CHARS),
        alt: '',
      };

      // The archetype the figure will actually be drawn under, logged for every
      // visual and not just the degraded ones. The two warnings above only fire
      // when something is broken, so a director that keeps *validly* choosing
      // one archetype — and inheriting its mandated emphasis, e.g. the struck
      // through bottom row that `comparison` always draws — is otherwise
      // indistinguishable from a healthy spread.
      console.log(`[visual turn ${entry.turn + 1}] archetype: ${spec.archetype}`);

      // Step 2 — the server composes the final prompt. Art direction and
      // composition are server-owned; the model only supplied the subject.
      const prompt = composeVisualPrompt({
        agentIndex: entry.agentIndex,
        archetype: spec.archetype,
        prompt: spec.prompt,
      });

      // Step 3 — the image model.
      const { bytes, mime } = await imageProvider.render({
        model: visuals.imageModel,
        prompt,
        size: VISUAL_IMAGE_SIZE,
        // Debate context, ignored by the network-backed adapters; the mock
        // adapter draws from it. See server/visuals/index.js.
        archetype: spec.archetype,
        turn: entry.turn,
        agentIndex: entry.agentIndex,
      });
      if (!bytes?.length) throw new Error('Visual provider returned no bytes.');

      this.visualBytes.set(entry.turn, { bytes, mime });
      this.visualBytesTotal += bytes.length;

      entry.visual = {
        status: 'ready',
        archetype: spec.archetype,
        alt: spec.alt || null,
        mime,
        error: null,
      };
      this._broadcastVisual(entry);
    } catch (err) {
      entry.visual.status = 'failed';
      entry.visual.error = err?.message ? String(err.message).slice(0, 200) : 'Visual generation failed.';
      console.warn(`[visual turn ${entry.turn + 1}] generation failed: ${entry.visual.error}`);
      this._broadcastVisual(entry);
    }
  }

  _finish() {
    this.state = 'finished';
    this.broadcastState();
    // Count agent statements only — moderator notes must not inflate it.
    this.broadcast('done', { turns: this.turn });
  }

  _runAutoLoop() {
    if (this._looping) return;
    this._looping = true;
    (async () => {
      try {
        while (this.state === 'running' && this.config.autoAdvance && this.turn < this.config.maxTurns) {
          await this.runTurn();
          if (this.state !== 'running') break;
          if (this.turn >= this.config.maxTurns) break;
          await sleep(AUTO_ADVANCE_PAUSE_MS);
        }
      } finally {
        this._looping = false;
      }
    })();
  }

  // ---------- controls ----------

  start() {
    if (this.state === 'finished') return;
    const isOpening = this.state === 'configured';
    this.setState('running');
    if (this.config.autoAdvance) {
      this._runAutoLoop();
    } else if (isOpening) {
      // Manual mode: "Begin debate" plays the opening statement itself, so the
      // stage never opens on an empty transcript waiting for a Next click.
      // Later /start calls are the Resume button and must not consume a turn.
      // Fire-and-forget like _runAutoLoop — runTurn() traps its own errors, the
      // route replies immediately, and progress reaches clients over SSE.
      this.next();
    }
  }

  pause() {
    if (this.state === 'finished') return;
    this.setState('paused');
  }

  async next() {
    if (this.turnInFlight) return { ok: false, reason: 'turn-in-flight' };
    if (this.state === 'finished') return { ok: false, reason: 'finished' };
    if (this.turn >= this.config.maxTurns) {
      this._finish();
      return { ok: false, reason: 'finished' };
    }
    this.setState('running');
    await this.runTurn();
    if (this.state === 'running') {
      if (this.turn >= this.config.maxTurns) {
        this._finish();
      } else {
        this.setState('paused');
      }
    }
    return { ok: true };
  }

  stop() {
    if (this.state === 'finished') return;
    this._finish();
  }

  // ---------- moderation ----------

  // Server twin of the frontend's moderation gate: moderation is only
  // legal while no turn is streaming and the debate isn't auto-running.
  // The auto-running check closes the race during the AUTO_ADVANCE_PAUSE_MS
  // sleep, when turnInFlight is momentarily false between turns.
  canModerate() {
    if (this.turnInFlight) return { ok: false, reason: 'turn-in-flight' };
    if (this.state === 'finished') return { ok: false, reason: 'finished' };
    if (this.state === 'running' && this.config.autoAdvance) return { ok: false, reason: 'auto-running' };
    return { ok: true };
  }

  editStatement(turnIndex, text) {
    const gate = this.canModerate();
    if (!gate.ok) return gate;
    const entry = this.transcript.find((e) => e.type !== 'moderator' && e.turn === turnIndex);
    if (!entry) return { ok: false, reason: 'unknown-turn' };
    const trimmed = String(text).trim();
    if (!trimmed) return { ok: false, reason: 'empty-text' };
    if (trimmed !== entry.text) {
      entry.text = trimmed;
      entry.editedAt = Date.now();
    }
    this.broadcast('entry_edited', entry);
    return { ok: true, entry };
  }

  injectModerator(text, afterTurn) {
    const gate = this.canModerate();
    if (!gate.ok) return gate;
    const trimmed = String(text).trim();
    if (!trimmed) return { ok: false, reason: 'empty-text' };
    const at = Number.isInteger(afterTurn) ? afterTurn : this.turn - 1;
    if (at < 0 || at >= this.turn) return { ok: false, reason: 'invalid-after-turn' };
    const entry = { type: 'moderator', id: randomUUID(), afterTurn: at, text: trimmed, createdAt: Date.now() };
    // Insert after the last entry chronologically at or before `at`, so
    // multiple notes on the same turn stack in creation order and a
    // retroactive note lands mid-array rather than at the end.
    const lastIdx = this.transcript.findLastIndex(
      (e) => (e.type !== 'moderator' && e.turn <= at) || (e.type === 'moderator' && e.afterTurn <= at),
    );
    this.transcript.splice(lastIdx + 1, 0, entry);
    this.broadcast('moderator_added', entry);
    return { ok: true, entry };
  }

  // ---------- export ----------

  exportMarkdown() {
    const { paper, agents } = this.config;
    const lines = [];
    lines.push(`# ${paper.title}`);
    lines.push('');
    agents.forEach((a, i) => {
      lines.push(`**Agent ${i === 0 ? 'A' : 'B'}:** ${a.name} — ${a.stance} (${a.provider} · ${a.model})`);
    });
    lines.push('');
    for (const entry of this.transcript) {
      if (entry.type === 'moderator') {
        lines.push(`### Moderator — after turn ${entry.afterTurn + 1}`);
      } else {
        const agent = agents[entry.agentIndex];
        const edited = entry.editedAt ? ' *(edited)*' : '';
        lines.push(`### Turn ${entry.turn + 1} — ${agent.name} (${entry.provider} · ${entry.model})${edited}`);
      }
      lines.push('');
      lines.push(entry.text);
      lines.push('');
      // A generated visual is described, not linked: the export is a
      // downloaded file, so a relative /api/... image URL would be dead the
      // moment it leaves the app (and the session it points at is gone on the
      // next server restart anyway). The alt text is the durable artifact.
      if (entry.type !== 'moderator' && entry.visual?.status === 'ready' && entry.visual.alt) {
        lines.push(`*Visual: ${entry.visual.alt}*`);
        lines.push('');
      }
    }
    return lines.join('\n');
  }

  exportJSON() {
    return {
      id: this.id,
      config: this.config,
      state: this.state,
      transcript: this.transcript,
    };
  }
}
