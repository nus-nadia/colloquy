// OpenAI (ChatGPT) provider adapter.
//
// Uses the official `openai` package's chat completions endpoint with
// `stream: true`. Newer OpenAI models reject the legacy `max_tokens`
// param in favor of `max_completion_tokens`, so we always use the
// latter. No `temperature` is set (some newer models reject
// non-default values, and consistency with the other adapters keeps
// behavior predictable turn to turn).

import OpenAI from 'openai';

let client;

export default {
  id: 'openai',
  label: 'ChatGPT (OpenAI)',
  defaultModel: 'gpt-5.6-luna',

  isConfigured() {
    return Boolean(process.env.OPENAI_API_KEY);
  },

  async *stream({ model, system, messages, maxTokens }) {
    client ??= new OpenAI(); // reads OPENAI_API_KEY from env
    const chatMessages = [{ role: 'system', content: system }, ...messages];
    const s = await client.chat.completions.create({
      model,
      messages: chatMessages,
      max_completion_tokens: maxTokens ?? 2048,
      stream: true,
    });
    for await (const chunk of s) {
      const text = chunk.choices?.[0]?.delta?.content;
      if (text) yield text;
    }
  },
};
