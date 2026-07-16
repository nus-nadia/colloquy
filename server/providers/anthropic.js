// Anthropic (Claude) provider adapter.
//
// Uses the official @anthropic-ai/sdk streaming interface. Per the
// implementation spec, current Claude models reject `temperature`,
// `top_p`, and `top_k` on this endpoint (400 error) — do NOT add them
// here even though other adapters may accept sampling params. Also do
// not pass a `thinking` budget; `{ type: 'adaptive' }` lets the model
// decide.

import Anthropic from '@anthropic-ai/sdk';

let client;

export default {
  id: 'anthropic',
  label: 'Claude (Anthropic)',
  defaultModel: 'claude-opus-4-8',

  isConfigured() {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  },

  async *stream({ model, system, messages, maxTokens }) {
    client ??= new Anthropic(); // reads ANTHROPIC_API_KEY from env
    const s = client.messages.stream({
      model,
      max_tokens: maxTokens ?? 2048,
      system,
      thinking: { type: 'adaptive' },
      messages,
    });
    for await (const event of s) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield event.delta.text;
      }
    }
  },
};
