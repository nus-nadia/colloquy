import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

import { listProviders, getProvider } from './providers/index.js';
import { DebateSession } from './debate.js';
import { STANCE_PRESETS } from './prompts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const app = express();
app.use(express.json({ limit: '5mb' }));

/** @type {Map<string, DebateSession>} */
const sessions = new Map();

function getSessionOr404(req, res) {
  const session = sessions.get(req.params.id);
  if (!session) {
    res.status(404).json({ error: 'Debate not found.' });
    return null;
  }
  return session;
}

// ---------- API ----------

app.get('/api/providers', (req, res) => {
  res.json(listProviders());
});

// The frontend's stance dropdown is built from this, so prompts.js stays
// the single source of truth for preset ids, labels, and stance text.
app.get('/api/stances', (req, res) => {
  res.json(STANCE_PRESETS);
});

app.post('/api/debates', (req, res) => {
  const body = req.body || {};
  const errors = [];

  const paper = body.paper || {};
  const paperText = typeof paper.text === 'string' ? paper.text.trim() : '';
  if (!paperText) errors.push('Paper text must not be empty.');
  const paperTitle = typeof paper.title === 'string' && paper.title.trim() ? paper.title.trim() : 'Untitled paper';

  const agentsInput = Array.isArray(body.agents) ? body.agents : [];
  if (agentsInput.length !== 2) errors.push('Exactly two agents are required.');

  const agents = agentsInput.slice(0, 2).map((a, i) => {
    const providerId = a && a.provider;
    const provider = providerId ? getProvider(providerId) : undefined;
    if (!provider) {
      errors.push(`Agent ${i === 0 ? 'A' : 'B'}: unknown provider "${providerId}".`);
      return null;
    }
    if (!provider.isConfigured()) {
      errors.push(`Agent ${i === 0 ? 'A' : 'B'}: provider "${providerId}" is not configured (missing API key).`);
    }
    return {
      name: (a.name && String(a.name).trim()) || provider.label,
      provider: provider.id,
      model: (a.model && String(a.model).trim()) || provider.defaultModel,
      stance: (a.stance && String(a.stance).trim()) || 'Custom',
    };
  });

  const maxTurns = Number.isInteger(body.maxTurns) ? body.maxTurns : parseInt(body.maxTurns, 10);
  if (!Number.isInteger(maxTurns) || maxTurns < 2 || maxTurns > 20) {
    errors.push('maxTurns must be an integer between 2 and 20.');
  }

  if (errors.length) {
    return res.status(400).json({ error: errors.join(' ') });
  }

  const config = {
    paper: { title: paperTitle, text: paperText },
    agents,
    maxTurns,
    autoAdvance: Boolean(body.autoAdvance),
    wordTarget: Number.isFinite(body.wordTarget) ? body.wordTarget : 160,
  };

  const session = new DebateSession(config);
  sessions.set(session.id, session);
  res.status(201).json({ id: session.id });
});

app.get('/api/debates/:id/events', (req, res) => {
  const session = getSessionOr404(req, res);
  if (!session) return;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  const heartbeat = setInterval(() => {
    res.write(': ping\n\n');
  }, 25000);

  session.subscribe(res);

  req.on('close', () => {
    clearInterval(heartbeat);
  });
});

app.post('/api/debates/:id/start', (req, res) => {
  const session = getSessionOr404(req, res);
  if (!session) return;
  session.start();
  res.json({ state: session.state });
});

app.post('/api/debates/:id/pause', (req, res) => {
  const session = getSessionOr404(req, res);
  if (!session) return;
  session.pause();
  res.json({ state: session.state });
});

app.post('/api/debates/:id/next', async (req, res) => {
  const session = getSessionOr404(req, res);
  if (!session) return;
  const result = await session.next();
  res.json({ state: session.state, ...result });
});

app.post('/api/debates/:id/stop', (req, res) => {
  const session = getSessionOr404(req, res);
  if (!session) return;
  session.stop();
  res.json({ state: session.state });
});

app.patch('/api/debates/:id/transcript/:turn', (req, res) => {
  const session = getSessionOr404(req, res);
  if (!session) return;
  const result = session.editStatement(parseInt(req.params.turn, 10), req.body?.text ?? '');
  if (!result.ok) {
    const status = result.reason === 'unknown-turn' ? 404 : result.reason === 'empty-text' ? 400 : 409;
    return res.status(status).json({ error: result.reason });
  }
  res.json({ ok: true, entry: result.entry });
});

app.post('/api/debates/:id/moderator', (req, res) => {
  const session = getSessionOr404(req, res);
  if (!session) return;
  const result = session.injectModerator(req.body?.text ?? '', req.body?.afterTurn);
  if (!result.ok) {
    const status = result.reason === 'empty-text' || result.reason === 'invalid-after-turn' ? 400 : 409;
    return res.status(status).json({ error: result.reason });
  }
  res.status(201).json({ ok: true, entry: result.entry });
});

app.get('/api/debates/:id/transcript', (req, res) => {
  const session = getSessionOr404(req, res);
  if (!session) return;
  const format = req.query.format === 'json' ? 'json' : 'md';
  if (format === 'json') {
    res.setHeader('Content-Disposition', `attachment; filename="colloquy-${session.id}.json"`);
    res.json(session.exportJSON());
  } else {
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="colloquy-${session.id}.md"`);
    res.send(session.exportMarkdown());
  }
});

// ---------- static frontend ----------

app.use(express.static(PUBLIC_DIR));

// ---------- error safety net ----------

app.use((err, req, res, next) => {
  console.error('Unhandled request error:', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Internal server error.' });
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Colloquy listening on http://localhost:${PORT}`);
});
