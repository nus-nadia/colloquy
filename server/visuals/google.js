// Google (Gemini Image) visual adapter.
//
// Uses the official @google/genai package. Verified against the installed
// version's typings (node_modules/@google/genai/dist/node/node.d.ts), the way
// server/providers/google.js documents having done:
// - `GoogleGenAI` exposes `interactions` (a `GeminiNextGenInteractions`), whose
//   `create(params)` resolves to a full Interaction when `stream` is not set.
// - `CreateModelInteraction` accepts `{ model, input, response_modalities }`,
//   where `InteractionsInput` may be a bare string — so the composed prompt
//   goes in as-is — and `ResponseModality` includes the literal 'image'.
// - The resolved Interaction carries `output_image?: ImageContent`, which is
//   `{ type: 'image', data?: string (base64), mime_type?: string }`. That is
//   where the bytes are; there is no `.text` equivalent for images.
// The older `models.generateImages` (Imagen) entry point also exists in this
// SDK, but it is a different model family and returns
// `generatedImages[0].image.imageBytes`; we deliberately use the interactions
// path because the default model here is a Gemini image model, not Imagen.
//
// Size is not a parameter on this endpoint — aspect is steered by the prompt —
// so `size` is accepted and ignored.

import { GoogleGenAI } from '@google/genai';

let client;

export default {
  id: 'google',
  label: 'Google · Gemini Image',
  defaultModel: 'gemini-3.1-flash-image',

  isConfigured() {
    return Boolean(process.env.GEMINI_API_KEY);
  },

  async render({ model, prompt }) {
    client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const interaction = await client.interactions.create({
      model,
      input: prompt,
      response_modalities: ['image'],
    });
    const image = interaction?.output_image;
    if (!image?.data) throw new Error('Gemini returned no image data.');
    return { bytes: Buffer.from(image.data, 'base64'), mime: image.mime_type || 'image/png' };
  },
};
