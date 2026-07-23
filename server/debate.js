// DebateSession — state machine + turn loop + SSE fanout.

import { randomUUID } from 'node:crypto';
import { getProvider } from './providers/index.js';
import { buildSystemPrompt, openingModeratorMessage, finalRoundModeratorNote, moderatorInterjection } from './prompts.js';

const AUTO_ADVANCE_PAUSE_MS = 1500;

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

export class DebateSession {
  constructor(config) {
    this.id = randomUUID();
    this.config = config; // { paper, agents: [a,b], maxTurns, autoAdvance, wordTarget }
    this.state = 'configured'; // configured | running | paused | finished
    this.transcript = []; // completed turns
    this.turn = 0; // index of the next turn to play
    this.liveTurn = null; // { turn, agentIndex, text } while a turn is streaming
    this.lastError = null; // { message, turn } | null
    this.turnInFlight = false;
    this._looping = false;
    this.subscribers = new Set();
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
      messages.push({ role: 'user', content: openingModeratorMessage({ opponentName }) });
    }
    for (const entry of this.transcript) {
      if (entry.type === 'moderator') {
        messages.push({ role: 'user', content: moderatorInterjection(entry.text) });
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
      last.content = `${last.content}\n\n${finalRoundModeratorNote()}`;
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
      const system = buildSystemPrompt({
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
