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

You don't need any provider keys to try Colloquy. Leave `.env` blank (or don't create it at all) and set **both** agents' Provider to **Mock (offline demo)** in the setup screen. The Mock provider ships pre-written scholarly debate turns (a "methodological skeptic" voice and a "contribution champion" voice) and streams them word-by-word with a short delay, so the live experience looks identical to a real model — no network calls, no keys, no cost. This is also the automated-test path used during development (see the acceptance checks below).

## Architecture

Colloquy is a small Express server (`server/index.js`) that holds debate sessions in an in-memory `Map` (`server/debate.js`'s `DebateSession`, one per debate). Each session runs a turn loop: on each turn it builds a provider-neutral message array from the transcript so far (the speaking agent's own prior statements become `assistant` turns, the opponent's become `user` turns), calls the assigned provider's streaming adapter, and fans out `turn_start` / `delta` / `turn_end` Server-Sent Events to every subscribed browser tab in real time. A freshly-connecting or refreshed browser first receives a `snapshot` event with the full config, transcript, and any in-flight partial statement, so it can recover mid-debate. The frontend (`public/`) is plain HTML/CSS/JS — no build step, no frameworks — and renders the transcript live from those events, escaping all model output before applying a minimal, whitelisted markdown subset (bold/italic/code/blockquote).

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
- `POST /api/debates`
- `GET /api/debates/:id/events` (SSE)
- `POST /api/debates/:id/start` · `/pause` · `/next` · `/stop`
- `GET /api/debates/:id/transcript?format=md|json`
