# Colloquy

A live, semi-adversarial debate between two LLM agents (Claude, ChatGPT, Gemini, or a keyless Mock) about a research paper, streaming token-by-token to the browser for classroom display.

## Quickstart

```bash
npm install
cp .env.example .env   # fill in whichever API keys you have — all optional
npm start
```

Open `http://localhost:3000`. Configure the paper and the two combatants, pick your advance mode, and click **Begin debate →**.

## Demo with zero API keys

You don't need any provider keys to try Colloquy. Leave `.env` blank (or don't create it at all) and set **both** agents' Provider to **Mock (offline demo)** in the setup screen. The Mock provider ships pre-written scholarly debate turns (a "methodological skeptic" voice and a "contribution champion" voice) and streams them word-by-word with a short delay, so the live experience looks identical to a real model — no network calls, no keys, no cost. This is also the verification path used during development — there is no automated test suite, so a Mock-vs-Mock debate is how changes get exercised end-to-end.

## Moderating a debate

Whenever the debate is paused between turns (always the case in manual advance mode; press **Pause** first in auto mode), each completed statement gains **Edit** and **+ Note** actions in its meta bar, and a quiet **＋ Moderator note** affordance sits at the live edge of the transcript:

- **Edit** rewrites a statement in place. From then on both agents see the edited text in their history, the statement is tagged *edited* on screen, and the Markdown export marks it `*(edited)*`.
- **+ Note** / **＋ Moderator note** inserts a visible, neutral **Moderator** entry — after that statement, or after the latest one. Both agents read it as an instruction from the moderator; the system prompt tells them `MODERATOR:`-prefixed text is never the opponent speaking.

Moderator entries don't count as turns: round numbering, `maxTurns`, and the closing statement count are unaffected. Everything survives a refresh and appears in both export formats. Moderation is unavailable while a statement is streaming, while auto-advance is running, and after the debate finishes (the API answers 409 in those states).

Both affordances work in presentation mode too, so you can intervene without dropping off the projector. There they join the controls bar as auto-hiding chrome: visible on entry and on any mouse movement or keypress, faded out after 3s of inactivity. Only the entry points fade — an editor you have already opened stays on screen with its draft intact, so a half-typed note is never pulled out from under you.

## Turn visuals

Optionally, each completed statement gains a generated infographic that illustrates the argument it just made — the graphic you'd put on a slide to make the point land. Turn it on in **Debate settings → Generate visuals** (it is **off by default**, so the keyless Mock demo and every existing debate are unchanged, and nothing bills without an explicit choice), then pick a visual provider and the two models it uses.

It is a two-call pipeline per turn, fired after `turn_end` and awaited by nobody — image latency never delays the debate:

1. A **prompt writer** (a normal text model, through the same adapter as the speaking agent) reads the finished statement plus the paper title and returns strict JSON: one `archetype` from a fixed list, an image `prompt`, and `alt` text.
2. The server composes the final image prompt as *style preamble + archetype scaffold + the model's prompt*, so the model chooses the **subject** while the server fixes the **form** and the palette.
3. A **visual adapter** (`server/visuals/`) renders it to bytes.

The archetype list is what keeps the output explanatory rather than decorative — most argumentative moves in a paper debate collapse into a small closed set: `comparison` (claimed vs. tested scope), `causal` (correlation vs. causation, confounders), `flow` (a pipeline with the weak link highlighted), `venn` (scope boundaries), `quadrant` (a tradeoff, not a win), `magnitude` (effect size against noise), `partition` (sample vs. population), and `timeline` (prior work, novelty).

Two properties worth knowing. **A visual failure never pauses the debate** — unlike a text-provider error, it is caught locally, marked on the statement, and the debate advances. And **the Mock visual provider needs no key and makes no network call**, so a Mock-vs-Mock debate with visuals on is still a fully offline demo.

Be aware that image models render structure and in-image text imperfectly: some fraction of graphics will carry a garbled label or a backwards arrow. The archetype scaffold and a strict text-density rule (short labels only, none repeated) reduce that, but do not eliminate it — expect roughly one graphic in two to be genuinely sharp, and the rest to be merely decorative. Panels degrade quietly — a failed or skipped visual leaves the statement readable.

## Architecture

Colloquy is a small Express server (`server/index.js`) that holds debate sessions in an in-memory `Map` (`server/debate.js`'s `DebateSession`, one per debate). Each session runs a turn loop: on each turn it builds a provider-neutral message array from the transcript so far (the speaking agent's own prior statements become `assistant` turns, the opponent's become `user` turns), calls the assigned provider's streaming adapter, and fans out `turn_start` / `delta` / `turn_end` Server-Sent Events to every subscribed browser tab in real time. A freshly-connecting or refreshed browser first receives a `snapshot` event with the full config, transcript, and any in-flight partial statement, so it can recover mid-debate. The frontend (`public/`) is plain HTML/CSS/JS — no build step, no frameworks — and renders the transcript live from those events, escaping all model output before applying a whitelisted markdown subset (headings, lists, tables, blockquotes, fenced and inline code, thematic breaks, links, bold/italic/strikethrough). LaTeX math is typeset by a locally vendored KaTeX — `$…$` and `\(…\)` inline, `$$…$$`, `\[…\]` and ```` ```math ```` blocks as display math — with a bare `$` left alone when it reads as currency. Nothing is fetched from a CDN, so a debate still runs with no network. That renderer lives in `public/render.js` rather than in `app.js`, because the server imports the very same module (along with the same vendored KaTeX) to build the HTML transcript export — a downloaded debate renders exactly like the one on screen.

Because the message array is rebuilt from the transcript on every turn, a human moderator can rewrite history between turns (see **Moderating a debate**): edited statements and injected moderator entries flow into every subsequent turn automatically. Moderator entries reach the models as `user` messages prefixed `MODERATOR:`, and consecutive same-role messages are merged before an adapter sees them, so the strictly-alternating message contract below still holds. Moderation changes fan out live as `entry_edited` / `moderator_added` SSE events, and reconnecting tabs pick them up through the normal `snapshot`.

## Scenarios

A **scenario** is the prompt shape a debate runs under: the system prompt, the stance presets offered for it, the moderator notes, and a few UI labels. Three ship today:

| `?scenario=` | What it is |
|---|---|
| `classroom-debate` *(default)* | Supporter vs. adversary on a research paper, grounded in specific sections and figures, pitched at undergraduates. Every turn but the last ends with a challenge to the opponent. |
| `polarised-debate` | The same two-sided shape, but both agents deliberately overshoot — the supporter oversells, the adversary overcorrects — so a class can see the two poles clearly. Lower reading level; each turn ends with a question to the audience. |
| `socratic` | Not a debate: an asymmetric teacher↔student dialogue. The teacher explains with analogies, the student asks eager, naive, practical questions and doesn't explain back. Stances are `teacher`/`student`. |

Pick one by adding `?scenario=<id>` to the app URL. An unknown id quietly falls back to `classroom-debate`. The setup form's begin row names the active scenario in a small pill (hover it for the `?scenario=` id), so the choice is always visible even though *selecting* one stays URL-only for now — the roster is served whole by `GET /api/scenarios`, so promoting it to a dropdown is a small frontend change.

Stance presets are **scenario-scoped**, not global: `socratic` offers teacher/student, `polarised-debate` drops the mimic-student, and a stance's `text` is written against that scenario's system prompt. The chosen scenario is stored on the session, so it survives a reload and reaches any tab joining a `?debate=<id>` link.

### Adding a scenario

Add one module under `server/prompts/` that default-exports the shape below, then add one import and one line to `SCENARIOS` in `server/prompts/index.js` — the same pattern as provider adapters:

```js
export default {
  id: 'my-scenario',                  // what ?scenario= takes
  label: 'My scenario',
  stances: [{ id, label, text }, …],  // include a { id: 'custom', text: '' } entry
  labels: { sourceHeading, sourceTextLabel, sourceTextPlaceholder, sourceTextError, stageKicker },
  buildSystemPrompt({ name, opponentName, stance, paper, wordTarget }) { … },
  openingModeratorMessage({ opponentName }) { … },
  finalRoundModeratorNote() { … },
  moderatorInterjection,              // import from './moderator.js' — do not redefine
};
```

Every `labels` key is optional; omitted ones leave the markup's own text alone. Two constraints are load-bearing: keep the `MODERATOR:` marker (import `moderatorInterjection` rather than writing your own), and keep `Your assigned analytical stance: <text>` on a line of its own — the Mock provider parses that line to pick each agent a distinct voice, which is what makes the offline demo legible. The turn-visual prompts in `server/prompts/visuals.js` are shared across scenarios and are not part of this contract.

## Adding a provider

Every provider is a small adapter module under `server/providers/` that default-exports this contract:

```js
export default {
  id: 'my-vendor',                 // stable key used by the API/UI
  label: 'My Vendor',
  defaultModel: 'my-default-model',
  isConfigured() { return Boolean(process.env.MY_VENDOR_API_KEY); },
  // Async generator yielding text chunks as they arrive.
  // messages: [{ role: 'user'|'assistant', content: string }] — provider-neutral,
  // strictly alternating, first and last entries are role 'user'.
  async *stream({ model, system, messages, maxTokens }) { /* ... */ },
};
```

Then register it in `server/providers/index.js`: import the module and add it to the `ADAPTERS` array. That's the whole integration surface — the debate engine, the HTTP API, and the frontend's provider dropdown all pick it up automatically via `GET /api/providers`.

**Visual providers are a second, separate contract.** `server/visuals/` follows the same registry pattern, but its adapters are *not* generators and do not yield text — they return image bytes:

```js
export default {
  id: 'my-vendor',
  label: 'My Vendor · Images',
  defaultModel: 'my-image-model',
  isConfigured() { return Boolean(process.env.MY_VENDOR_API_KEY); },
  // Returns { bytes: Buffer, mime: string }.
  async render({ model, prompt, size }) { /* ... */ },
};
```

Register it in `server/visuals/index.js` and it appears in `GET /api/visual-providers` and the setup form. Keep the two contracts distinct: the "yield text only" rule below applies to `server/providers/`, and it is precisely *because* image output would violate it that visuals get their own module.

## Notes on the included adapters

- **Anthropic** (`server/providers/anthropic.js`) uses `@anthropic-ai/sdk`'s `client.messages.stream`, defaults to model `claude-opus-4-8`, and passes `thinking: { type: 'adaptive' }`. It deliberately never sends `temperature`, `top_p`, or `top_k` — current Claude models reject those with a 400 error on this endpoint.
- **OpenAI** (`server/providers/openai.js`) uses chat completions with `stream: true` and `max_completion_tokens` (newer models reject the legacy `max_tokens`). Default model `gpt-5.6-luna` — edit the model field in the UI if your org uses a different name.
- **Google** (`server/providers/google.js`) uses `@google/genai`'s `client.models.generateContentStream`, default model `gemini-3.6-flash`.
- **Mock** (`server/providers/mock.js`) needs no key, ships two six-turn canned debate scripts, and streams word-by-word — the offline demo and test path described above.

## HTTP API

- `GET /api/providers`
- `GET /api/visual-providers` — the `server/visuals/` adapter list, used to build the setup form's visual-provider dropdown
- `GET /api/scenarios` — the scenario roster from `server/prompts/`, each entry carrying its own stance presets and UI label overrides; used to build the setup form's stance dropdown and copy
- `POST /api/debates`
- `GET /api/debates/:id/events` (SSE)
- `POST /api/debates/:id/start` · `/pause` · `/next` · `/stop`
- `PATCH /api/debates/:id/transcript/:turn` — moderator edit of a completed statement; body `{ text }`
- `POST /api/debates/:id/moderator` — inject a moderator note; body `{ text, afterTurn? }` (`afterTurn` defaults to the latest completed turn)
- `GET /api/debates/:id/visuals/:turn` — the generated image bytes for one statement, served from memory; 404 until the visual is ready
- `GET /api/debates/:id/transcript?format=md|html|json` — the **Download transcript** menu offers the first two. `md` is the plain transcript, where a generated visual becomes an italic `*Visual: …*` caption. `html` is a single self-contained page: the same markdown rendering the stage uses, every generated image inlined as a `data:` URI, and KaTeX's stylesheet and fonts folded in, so the saved file keeps its figures and typeset math offline and forever. `json` is the raw session (never image bytes)
