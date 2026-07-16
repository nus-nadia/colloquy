// Google (Gemini) provider adapter.
//
// Uses the official @google/genai package. Verified against the
// installed version's typings (node_modules/@google/genai/dist/node/node.d.ts):
// `generateContentStream` returns a Promise of an async generator, and
// each yielded `GenerateContentResponse` exposes a `.text` getter —
// matches the usage below exactly.

import { GoogleGenAI } from '@google/genai';

let client;

export default {
  id: 'google',
  label: 'Gemini (Google)',
  defaultModel: 'gemini-3.5-flash',

  isConfigured() {
    return Boolean(process.env.GEMINI_API_KEY);
  },

  async *stream({ model, system, messages, maxTokens }) {
    client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const contents = messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    const res = await client.models.generateContentStream({
      model,
      contents,
      config: { systemInstruction: system, maxOutputTokens: maxTokens ?? 2048 },
    });
    for await (const chunk of res) {
      if (chunk.text) yield chunk.text;
    }
  },
};
