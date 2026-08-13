// Self-contained HTML transcript export.
//
// The Markdown export (DebateSession.exportMarkdown) can only *describe* a
// generated visual, because a relative /api/... URL is dead the moment the
// file leaves the app. This export solves that the other way: every image is
// inlined as a data: URI, so one .html file carries the whole debate — text,
// figures, and typeset math — and opens offline, forever, with no server.
//
// Two things are deliberately shared rather than reimplemented:
//   * public/render.js — the exact markdown renderer the live stage uses, so
//     an exported statement is byte-identical to the one on screen. Its
//     escape-everything-first invariant (see CLAUDE.md) is what keeps model
//     text inert here too; nothing in this file interpolates raw model output.
//   * public/vendor/katex/ — the same vendored KaTeX the browser loads, both
//     the typesetter (assigned to globalThis so render.js finds it) and the
//     stylesheet (with its woff2 fonts folded in as data: URIs).
// Both are loaded lazily and cached: a debate with no math never pays for the
// ~400KB of fonts, and a missing vendor/ degrades to literal math text rather
// than throwing, exactly as the frontend does.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { escapeHtml, renderStatementHTML } from '../public/render.js';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const KATEX_DIR = path.join(PUBLIC_DIR, 'vendor', 'katex');

let katexLoaded = false;

// render.js reads an ambient global `katex` (the browser gets one from a
// <script> tag), so the server has to publish the vendored UMD build under the
// same name before any statement is rendered. Without it renderMath() returns
// null and math falls back to literal text — degraded, never broken.
//
// It cannot simply be require()d or import()ed: the package is "type": "module",
// so Node treats the vendored .js as ESM, and the UMD wrapper — which expects
// either a CommonJS `module` or a `this` to hang a global off — ends up
// assigning to undefined. Running it as a function body with a CommonJS-shaped
// `module` in scope is the branch it was written for. The source is our own
// vendored file, never input, and the alternative would be a second copy of a
// 270KB library on disk purely to rename it .cjs.
function ensureKatex() {
  if (katexLoaded) return;
  katexLoaded = true;
  if (globalThis.katex) return;
  try {
    const src = readFileSync(path.join(KATEX_DIR, 'katex.min.js'), 'utf8');
    const shim = { exports: {} };
    // eslint-disable-next-line no-new-func
    new Function('module', 'exports', src)(shim, shim.exports);
    globalThis.katex = shim.exports;
  } catch (err) {
    console.warn(`[export] KaTeX unavailable, math will export as text: ${err.message}`);
  }
}

let katexCSS;

// katex.min.css references its fonts by relative URL, which cannot survive in
// a file the reader saves to their desktop. Rewrite each @font-face src to a
// single woff2 data: URI (the woff/ttf fallbacks are dropped — every browser
// that can open this file reads woff2).
function getKatexCSS() {
  if (katexCSS !== undefined) return katexCSS;
  try {
    const css = readFileSync(path.join(KATEX_DIR, 'katex.min.css'), 'utf8');
    katexCSS = css.replace(/url\(fonts\/([\w-]+\.woff2)\)[^;}]*/g, (whole, file) => {
      try {
        const b64 = readFileSync(path.join(KATEX_DIR, 'fonts', file)).toString('base64');
        return `url(data:font/woff2;base64,${b64}) format("woff2")`;
      } catch {
        return whole;
      }
    });
  } catch (err) {
    console.warn(`[export] KaTeX stylesheet unavailable: ${err.message}`);
    katexCSS = null;
  }
  return katexCSS;
}

// A trimmed copy of the stage's Reading Room theme (public/styles.css), kept
// to the tokens and the .stmt-body block rules the renderer can actually emit.
// It is a separate copy on purpose: styles.css is full of app-shell layout
// (controls bar, presentation mode, SSE state pills) that means nothing in a
// static document. If you add a block tag to render.js, add a rule here too.
const DOC_CSS = `
:root{
  --bg-page:#F1EBDC;--bg-surface:#FBF8F0;--bg-surface-alt:#ECE3CE;--bg-sunken:#E5DCC4;
  --rule-hairline:#DBCFAF;--rule-strong:#C7B78D;
  --ink-primary:#211C15;--ink-secondary:#56503F;--ink-tertiary:#857C63;--ink-inverse:#F7F1E2;
  --agentA-600:#7B2432;--agentA-500:#96313F;--agentA-100:#F3E1DE;
  --agentB-600:#21395A;--agentB-500:#2E4A70;--agentB-100:#E2E7EE;
  --state-error:#9C3B2E;
  --font-serif:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,"Times New Roman",serif;
  --font-sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
  --font-mono:ui-monospace,"SF Mono","Cascadia Code","Roboto Mono",Consolas,Menlo,monospace;
}
*{box-sizing:border-box;}
body{margin:0;background:var(--bg-page);color:var(--ink-primary);font-family:var(--font-sans);
  -webkit-font-smoothing:antialiased;}
.doc{max-width:860px;margin:0 auto;padding:48px 24px 80px;}

.doc-head{border-bottom:2px solid var(--rule-strong);padding-bottom:22px;margin-bottom:34px;}
.doc-kicker{margin:0 0 8px;font-size:11px;letter-spacing:.16em;text-transform:uppercase;
  color:var(--ink-tertiary);font-weight:700;}
.doc-title{margin:0 0 18px;font-family:var(--font-serif);font-size:30px;line-height:1.24;font-weight:700;}
.playbill{display:flex;flex-wrap:wrap;gap:12px;}
.combatant{flex:1 1 260px;background:var(--bg-surface);border:1px solid var(--rule-hairline);
  border-left-width:4px;border-radius:3px;padding:12px 14px;}
.combatant.side-a{border-left-color:var(--agentA-600);}
.combatant.side-b{border-left-color:var(--agentB-600);}
.combatant-name{margin:0 0 2px;font-weight:700;font-size:15px;}
.combatant-meta{margin:0 0 6px;font-size:12px;color:var(--ink-tertiary);}
.combatant-stance{margin:0;font-family:var(--font-serif);font-size:14px;font-style:italic;
  color:var(--ink-secondary);}
.doc-meta{margin:18px 0 0;font-size:12px;color:var(--ink-tertiary);}

.stmt{background:var(--bg-surface);border:1px solid var(--rule-hairline);border-radius:3px;
  margin:0 0 26px;overflow:hidden;}
.stmt.side-a{border-top:3px solid var(--agentA-600);}
.stmt.side-b{border-top:3px solid var(--agentB-600);}
.stmt-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:11px 20px;
  background:var(--bg-surface-alt);border-bottom:1px solid var(--rule-hairline);font-size:12px;
  color:var(--ink-secondary);}
.crest{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;
  font-weight:700;font-size:12px;color:var(--ink-inverse);}
.side-a .crest{background:var(--agentA-600);border-radius:50%;}
.side-b .crest{background:var(--agentB-600);border-radius:2px;}
.stmt-name{font-weight:700;color:var(--ink-primary);font-size:13px;}
.stmt-turn{margin-left:auto;letter-spacing:.1em;text-transform:uppercase;font-size:11px;
  color:var(--ink-tertiary);font-weight:700;}
.stmt-edited{letter-spacing:0;text-transform:none;font-style:italic;font-weight:400;}

.moderator{background:var(--bg-sunken);border:1px dashed var(--rule-strong);border-radius:3px;
  margin:0 0 26px;padding:6px 0 0;}
.moderator-label{margin:0;padding:0 20px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;
  color:var(--ink-secondary);font-weight:700;}

.stmt-visual{margin:0;padding:0 20px 20px;}
.stmt-visual img{display:block;width:100%;height:auto;border:1px solid var(--rule-hairline);
  border-radius:3px;background:var(--bg-surface);}
.stmt-visual figcaption{margin-top:8px;font-family:var(--font-serif);font-size:13px;font-style:italic;
  color:var(--ink-secondary);}

.stmt-body{padding:18px 20px 20px;font-family:var(--font-serif);font-size:18px;line-height:1.62;
  color:var(--ink-primary);overflow-wrap:break-word;}
.stmt-body > :first-child{margin-top:0;}
.stmt-body > :last-child{margin-bottom:0;}
.stmt-body p{margin:0 0 0.72em;}
.stmt-body h1,.stmt-body h2,.stmt-body h3,.stmt-body h4,.stmt-body h5,.stmt-body h6{
  margin:1.1em 0 0.5em;font-weight:700;line-height:1.3;}
.stmt-body h1{font-size:1.16em;}
.stmt-body h2{font-size:1.08em;}
.stmt-body h3{font-size:1em;}
.stmt-body h4,.stmt-body h5,.stmt-body h6{font-size:0.92em;letter-spacing:.02em;text-transform:uppercase;
  color:var(--ink-secondary);}
.stmt-body ul,.stmt-body ol{margin:0 0 0.72em;padding-left:1.5em;}
.stmt-body li{margin:0 0 0.22em;}
.stmt-body li:last-child{margin-bottom:0;}
.stmt-body li > ul,.stmt-body li > ol{margin:0.22em 0 0.1em;}
.stmt-body li > p{margin:0 0 0.4em;}
.stmt-body blockquote{margin:0 0 0.72em;padding-left:14px;border-left:3px solid var(--rule-strong);
  color:var(--ink-secondary);font-style:italic;}
.stmt-body code{font-family:var(--font-mono);font-size:0.92em;background:var(--bg-sunken);
  padding:0.1em 0.35em;border-radius:2px;}
.stmt-body pre{margin:0 0 0.8em;padding:12px 14px;background:var(--bg-sunken);
  border:1px solid var(--rule-hairline);border-radius:3px;overflow-x:auto;}
.stmt-body pre code{display:block;background:none;padding:0;border-radius:0;font-size:0.8em;
  line-height:1.55;white-space:pre;}
.stmt-body hr{margin:1.1em 0;border:0;border-top:1px solid var(--rule-strong);}
.stmt-body a{color:var(--agentB-600);text-decoration:underline;text-underline-offset:2px;}
.stmt-body del{color:var(--ink-tertiary);}
.stmt-body .md-table-wrap{margin:0 0 0.8em;overflow-x:auto;}
.stmt-body table{border-collapse:collapse;font-family:var(--font-sans);font-size:0.78em;line-height:1.45;}
.stmt-body th,.stmt-body td{border:1px solid var(--rule-hairline);padding:6px 10px;text-align:left;
  vertical-align:top;}
.stmt-body th{background:var(--bg-surface-alt);font-weight:700;}
.stmt-body .katex{font-size:1.05em;}
.stmt-body .katex-display{margin:0.55em 0 0.85em;padding:2px 0;overflow-x:auto;overflow-y:hidden;}
.stmt-body .katex-display > .katex{font-size:1.12em;}
.stmt-body .katex-error{color:var(--state-error);font-family:var(--font-mono);font-size:0.88em;}

@media print{
  body{background:#fff;}
  .doc{max-width:none;padding:0;}
  .stmt,.moderator{break-inside:avoid;}
}
`;

function playbillHTML(agents) {
  return agents
    .map((agent, i) => `
      <div class="combatant side-${i === 0 ? 'a' : 'b'}">
        <p class="combatant-name">${escapeHtml(agent.name)}</p>
        <p class="combatant-meta">${escapeHtml(agent.provider)} · ${escapeHtml(agent.model)}</p>
        <p class="combatant-stance">&ldquo;${escapeHtml(agent.stance)}&rdquo;</p>
      </div>`)
    .join('');
}

// The <img> src is built here from bytes this process generated, and alt comes
// from the model but is escaped — the same split the live app makes, where the
// src is always an app-built URL and alt is assigned as a property.
function visualHTML(entry, visualBytes) {
  if (entry.visual?.status !== 'ready') return '';
  const stored = visualBytes.get(entry.turn);
  if (!stored) return '';
  const alt = entry.visual.alt || '';
  const src = `data:${stored.mime};base64,${stored.bytes.toString('base64')}`;
  const caption = alt ? `<figcaption>${escapeHtml(alt)}</figcaption>` : '';
  return `<figure class="stmt-visual"><img src="${src}" alt="${escapeHtml(alt)}">${caption}</figure>`;
}

/**
 * Renders a whole session as one self-contained HTML document.
 * Takes the session rather than a snapshot because it needs `visualBytes`,
 * which deliberately never rides on the transcript or the SSE snapshot.
 */
export function exportHTMLDocument(session) {
  ensureKatex();
  const { config, transcript, visualBytes } = session;
  const { paper, agents } = config;

  const parts = [];
  for (const entry of transcript) {
    const body = `<div class="stmt-body">${renderStatementHTML(entry.text)}</div>`;
    if (entry.type === 'moderator') {
      // "after turn N" counts statements, matching exportMarkdown() rather
      // than the round-numbered label the stage shows (see CLAUDE.md).
      parts.push(`
      <article class="moderator">
        <p class="moderator-label">Moderator — after turn ${entry.afterTurn + 1}</p>
        ${body}
      </article>`);
      continue;
    }
    const agent = agents[entry.agentIndex];
    const side = entry.agentIndex === 0 ? 'a' : 'b';
    const edited = entry.editedAt ? ' <span class="stmt-edited">(edited)</span>' : '';
    parts.push(`
      <article class="stmt side-${side}">
        <div class="stmt-meta">
          <span class="crest">${escapeHtml((agent.name || '?').charAt(0).toUpperCase())}</span>
          <span class="stmt-name">${escapeHtml(agent.name)}</span>
          <span>${escapeHtml(entry.provider || agent.provider)} · ${escapeHtml(entry.model || agent.model)}</span>
          <span class="stmt-turn">Turn ${entry.turn + 1}${edited}</span>
        </div>
        ${body}
        ${visualHTML(entry, visualBytes)}
      </article>`);
  }

  const doc = parts.join('\n');
  const statements = transcript.filter((e) => e.type !== 'moderator').length;
  // Fonts are ~400KB of base64; a debate with no math should not carry them.
  const katexStyle = doc.includes('class="katex') && getKatexCSS()
    ? `<style>${getKatexCSS()}</style>\n`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(paper.title)} — Colloquy transcript</title>
${katexStyle}<style>${DOC_CSS}</style>
</head>
<body>
<main class="doc">
  <header class="doc-head">
    <p class="doc-kicker">Colloquy transcript</p>
    <h1 class="doc-title">${escapeHtml(paper.title)}</h1>
    <div class="playbill">${playbillHTML(agents)}</div>
    <p class="doc-meta">${statements} statement${statements === 1 ? '' : 's'} · exported ${escapeHtml(new Date().toISOString().slice(0, 10))}</p>
  </header>
${doc}
</main>
</body>
</html>
`;
}
