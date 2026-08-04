// OpenAI (GPT Image) visual adapter.
//
// Uses the official `openai` package's images endpoint. Constraints this
// encodes:
// - GPT Image models ALWAYS return base64 in `data[0].b64_json`; unlike the
//   older DALL·E endpoints they reject `response_format`, so we never send it
//   and never look for a URL in the response.
// - `size` must be one of the sizes the model supports; the pipeline asks for
//   '1536x1024' (3:2 landscape), which matches the wide framing the style
//   preamble specifies and the transcript column's aspect.
// - `quality: 'low'` is deliberate: these are per-turn classroom illustrations
//   generated live, so latency and cost matter far more than fidelity.
// - `new OpenAI()` reads OPENAI_API_KEY from env implicitly, exactly as
//   server/providers/openai.js does.

import OpenAI from 'openai';

let client;

export default {
  id: 'openai',
  label: 'OpenAI · GPT Image',
  defaultModel: 'gpt-image-2',

  isConfigured() {
    return Boolean(process.env.OPENAI_API_KEY);
  },

  async render({ model, prompt, size }) {
    client ??= new OpenAI(); // reads OPENAI_API_KEY from env
    const res = await client.images.generate({
      model,
      prompt,
      size: size || '1536x1024',
      quality: 'low',
    });
    const b64 = res?.data?.[0]?.b64_json;
    if (!b64) throw new Error('OpenAI returned no image data.');
    return { bytes: Buffer.from(b64, 'base64'), mime: 'image/png' };
  },
};
