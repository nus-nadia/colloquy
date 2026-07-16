// Provider registry. Adding a new vendor = add one adapter file that
// default-exports the contract described in the README, then add one
// import + one line to `ADAPTERS` below.

import anthropic from './anthropic.js';
import openai from './openai.js';
import google from './google.js';
import mock from './mock.js';

const ADAPTERS = [anthropic, openai, google, mock];

const byId = new Map(ADAPTERS.map((p) => [p.id, p]));

export function getProvider(id) {
  return byId.get(id);
}

export function listProviders() {
  return ADAPTERS.map((p) => ({
    id: p.id,
    label: p.label,
    defaultModel: p.defaultModel,
    configured: p.isConfigured(),
  }));
}
