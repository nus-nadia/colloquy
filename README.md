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

## Architecture

Colloquy is a small Express server (`server/index.js`) that holds debate sessions in an in-memory `Map` (`server/debate.js`'s `DebateSession`, one per debate). Each session runs a turn loop: on each turn it builds a provider-neutral message array from the transcript so far (the speaking agent's own prior statements become `assistant` turns, the opponent's become `user` turns), calls the assigned provider's streaming adapter, and fans out `turn_start` / `delta` / `turn_end` Server-Sent Events to every subscribed browser tab in real time. A freshly-connecting or refreshed browser first receives a `snapshot` event with the full config, transcript, and any in-flight partial statement, so it can recover mid-debate. The frontend (`public/`) is plain HTML/CSS/JS — no build step, no frameworks — and renders the transcript live from those events, escaping all model output before applying a whitelisted markdown subset (headings, lists, tables, blockquotes, fenced and inline code, thematic breaks, links, bold/italic/strikethrough). LaTeX math is typeset by a locally vendored KaTeX — `$…$` and `\(…\)` inline, `$$…$$`, `\[…\]` and ```` ```math ```` blocks as display math — with a bare `$` left alone when it reads as currency. Nothing is fetched from a CDN, so a debate still runs with no network.

Because the message array is rebuilt from the transcript on every turn, a human moderator can rewrite history between turns (see **Moderating a debate**): edited statements and injected moderator entries flow into every subsequent turn automatically. Moderator entries reach the models as `user` messages prefixed `MODERATOR:`, and consecutive same-role messages are merged before an adapter sees them, so the strictly-alternating message contract below still holds. Moderation changes fan out live as `entry_edited` / `moderator_added` SSE events, and reconnecting tabs pick them up through the normal `snapshot`.

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

## Notes on the included adapters

- **Anthropic** (`server/providers/anthropic.js`) uses `@anthropic-ai/sdk`'s `client.messages.stream`, defaults to model `claude-opus-4-8`, and passes `thinking: { type: 'adaptive' }`. It deliberately never sends `temperature`, `top_p`, or `top_k` — current Claude models reject those with a 400 error on this endpoint.
- **OpenAI** (`server/providers/openai.js`) uses chat completions with `stream: true` and `max_completion_tokens` (newer models reject the legacy `max_tokens`). Default model `gpt-5` — edit the model field in the UI if your org uses a different name.
- **Google** (`server/providers/google.js`) uses `@google/genai`'s `client.models.generateContentStream`, default model `gemini-3.5-flash`.
- **Mock** (`server/providers/mock.js`) needs no key, ships two six-turn canned debate scripts, and streams word-by-word — the offline demo and test path described above.

## HTTP API

- `GET /api/providers`
- `GET /api/stances` — the `STANCE_PRESETS` list from `server/prompts.js`, used to build the setup form's stance dropdown
- `POST /api/debates`
- `GET /api/debates/:id/events` (SSE)
- `POST /api/debates/:id/start` · `/pause` · `/next` · `/stop`
- `PATCH /api/debates/:id/transcript/:turn` — moderator edit of a completed statement; body `{ text }`
- `POST /api/debates/:id/moderator` — inject a moderator note; body `{ text, afterTurn? }` (`afterTurn` defaults to the latest completed turn)
- `GET /api/debates/:id/transcript?format=md|json`
