// Visual-provider registry — the image half of the turn-visual pipeline.
// Adding a vendor = add one adapter file that default-exports the contract
// below, then add one import + one line to `ADAPTERS`. Deliberately a mirror
// of server/providers/index.js so the two registries read the same.
//
// This is a SEPARATE contract from the text-provider one in the README, and
// notably not a generator — an image arrives all at once, so there is nothing
// to stream:
//
//   export default {
//     id: 'my-vendor',
//     label: 'My Vendor · Some Model',
//     defaultModel: 'my-image-model',
//     isConfigured() { return Boolean(process.env.MY_VENDOR_API_KEY); },
//     // Returns { bytes: Buffer, mime: string }.
//     async render({ model, prompt, size }) { /* ... */ },
//   };
//
// `render` also receives the debate context it was called from — `archetype`,
// `turn`, `agentIndex` — which every network-backed adapter ignores (the whole
// picture is already in `prompt`). Only the mock adapter reads them, to draw a
// deterministic offline SVG. Treat them as optional extras, not as contract.

import openai from './openai.js';
import google from './google.js';
import mock from './mock.js';

const ADAPTERS = [openai, google, mock];

const byId = new Map(ADAPTERS.map((p) => [p.id, p]));

export function getVisualProvider(id) {
  return byId.get(id);
}

export function listVisualProviders() {
  return ADAPTERS.map((p) => ({
    id: p.id,
    label: p.label,
    defaultModel: p.defaultModel,
    configured: p.isConfigured(),
  }));
}
