// Colloquy frontend — vanilla JS, no build step, no frameworks.
'use strict';

// Mirrors server/prompts.js STANCE_PRESETS. There is no dedicated API
// route for these (the spec's HTTP API list doesn't include one), so
// the six presets are duplicated here deliberately.
const STANCE_PRESETS = [
  { id: 'methodological-skeptic', label: 'Methodological skeptic', text: 'Methodological skeptic — probe validity, statistics, baselines, and experimental design' },
  { id: 'contribution-champion', label: 'Champion of the contribution', text: 'Champion of the contribution — defend the significance, novelty, and rigor of the work' },
  { id: 'reproducibility-critic', label: 'Reproducibility & generalization critic', text: 'Reproducibility & generalization critic — question robustness beyond the reported setting' },
  { id: 'ethics-examiner', label: 'Ethics & societal impact examiner', text: 'Ethics & societal impact examiner — surface risks, externalities, and framing problems' },
  { id: 'adoption-advocate', label: 'Practical adoption advocate', text: 'Practical adoption advocate — argue for real-world value and deployment readiness' },
  { id: 'custom', label: 'Custom…', text: '' },
];

const WARNING_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5 21.5 20h-19z"></path><path d="M12 9.5v4.2"></path><circle cx="12" cy="16.8" r="0.9" fill="currentColor" stroke="none"></circle></svg>';
const PLAY_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4l14 8-14 8z"></path></svg>';
const PAUSE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="5" width="4" height="14"></rect><rect x="14" y="5" width="4" height="14"></rect></svg>';

// ---------------------------------------------------------------
// Safe markdown rendering: escape ALL HTML first, then apply only a
// tiny whitelist of markup. This is the ONLY code path allowed to set
// .innerHTML from model-generated text.
// ---------------------------------------------------------------

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function mdInline(escapedText) {
  return escapedText
    .replace(/`([^`]+?)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+?)\*/g, '<em>$1</em>');
}

// Renders a raw (untrusted) statement into a safe HTML string. Every
// character of `raw` passes through escapeHtml before any tag is ever
// introduced; mdInline only wraps already-escaped substrings in a
// fixed whitelist of tags via regex substitution.
function renderStatementHTML(raw) {
  return String(raw)
    .split('\n')
    .map((line) => {
      const m = line.match(/^>\s?(.*)$/);
      if (m) return `<blockquote>${mdInline(escapeHtml(m[1]))}</blockquote>`;
      return mdInline(escapeHtml(line));
    })
    .join('\n');
}

// ---------------------------------------------------------------
// App state
// ---------------------------------------------------------------

const state = {
  view: 'setup',
  providers: [],
  debateId: null,
  config: null,
  transcript: [],
  liveTurn: null,
  sessionState: 'configured',
  lastError: null,
  pinnedToLive: true,
  presentation: false,
  canModerate: false,
  eventSource: null,
};

// ---------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------

const setupView = document.getElementById('setup-view');
const stageView = document.getElementById('stage-view');
const setupForm = document.getElementById('setup-form');
const setupError = document.getElementById('setup-error');
const setupErrorCopy = document.getElementById('setup-error-copy');

const paperTitleInput = document.getElementById('paper-title');
const paperTextInput = document.getElementById('paper-text');
const paperTextError = document.getElementById('paper-text-error');
const loadFileBtn = document.getElementById('load-file-btn');
const fileInput = document.getElementById('file-input');

const agentAProvider = document.getElementById('agentA-provider');
const agentBProvider = document.getElementById('agentB-provider');
const agentAModel = document.getElementById('agentA-model');
const agentBModel = document.getElementById('agentB-model');
const agentAName = document.getElementById('agentA-name');
const agentBName = document.getElementById('agentB-name');
const agentAStancePreset = document.getElementById('agentA-stance-preset');
const agentBStancePreset = document.getElementById('agentB-stance-preset');
const agentAStanceCustom = document.getElementById('agentA-stance-custom');
const agentBStanceCustom = document.getElementById('agentB-stance-custom');
const agentAModelError = document.getElementById('agentA-model-error');
const agentBModelError = document.getElementById('agentB-model-error');
const agentAProviderHint = document.getElementById('agentA-provider-hint');
const agentBProviderHint = document.getElementById('agentB-provider-hint');

const turnsSelect = document.getElementById('turns-select');
const advanceModeSegmented = document.getElementById('advance-mode-segmented');
const lengthSegmented = document.getElementById('length-segmented');
const beginNote = document.getElementById('begin-note');

const appShell = document.getElementById('app-shell');
const stagePaperTitle = document.getElementById('stage-paper-title');
const roundValueEl = document.getElementById('round-value');
const roundTicksEl = document.getElementById('round-ticks');
const statePillEl = document.getElementById('state-pill');
const playbillEl = document.getElementById('playbill');
const transcriptBody = document.getElementById('transcript-body');
const controlsBar = document.getElementById('controls-bar');
const startPauseBtn = document.getElementById('start-pause-btn');
const nextBtn = document.getElementById('next-btn');
const nextKbdHint = document.getElementById('next-kbd-hint');
const endBtn = document.getElementById('end-btn');
const downloadBtn = document.getElementById('download-btn');
const presentationBtn = document.getElementById('presentation-btn');
const jumpPill = document.getElementById('jump-pill');

// ---------------------------------------------------------------
// Setup view wiring
// ---------------------------------------------------------------

function populateStanceSelect(selectEl) {
  selectEl.innerHTML = '';
  for (const s of STANCE_PRESETS) {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.label;
    selectEl.appendChild(opt);
  }
}

function resolvedStance(prefix) {
  const presetSelect = prefix === 'A' ? agentAStancePreset : agentBStancePreset;
  const customInput = prefix === 'A' ? agentAStanceCustom : agentBStanceCustom;
  const preset = STANCE_PRESETS.find((s) => s.id === presetSelect.value);
  if (!preset || preset.id === 'custom') return customInput.value.trim();
  return preset.text;
}

function wireStanceSelect(prefix) {
  const presetSelect = prefix === 'A' ? agentAStancePreset : agentBStancePreset;
  const customInput = prefix === 'A' ? agentAStanceCustom : agentBStanceCustom;
  presetSelect.addEventListener('change', () => {
    const isCustom = presetSelect.value === 'custom';
    customInput.classList.toggle('hidden', !isCustom);
    if (isCustom) customInput.focus();
  });
}

function populateProviderSelect(selectEl, hintEl) {
  selectEl.innerHTML = '';
  for (const p of state.providers) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.configured ? p.label : `${p.label} — no API key`;
    opt.disabled = !p.configured;
    selectEl.appendChild(opt);
  }
  const preferred = state.providers.find((p) => p.configured) || state.providers.find((p) => p.id === 'mock');
  if (preferred) selectEl.value = preferred.id;
  updateProviderHint(selectEl, hintEl);
}

function updateProviderHint(selectEl, hintEl) {
  const provider = state.providers.find((p) => p.id === selectEl.value);
  hintEl.classList.toggle('hidden', !provider || provider.configured);
}

function wireProviderSelect(selectEl, modelInput, hintEl) {
  selectEl.addEventListener('change', () => {
    const provider = state.providers.find((p) => p.id === selectEl.value);
    if (provider) modelInput.value = provider.defaultModel;
    updateProviderHint(selectEl, hintEl);
  });
}

async function loadProviders() {
  const res = await fetch('/api/providers');
  state.providers = await res.json();
  populateProviderSelect(agentAProvider, agentAProviderHint);
  populateProviderSelect(agentBProvider, agentBProviderHint);
  const aProvider = state.providers.find((p) => p.id === agentAProvider.value);
  const bProvider = state.providers.find((p) => p.id === agentBProvider.value);
  if (aProvider) agentAModel.value = aProvider.defaultModel;
  if (bProvider) agentBModel.value = bProvider.defaultModel;
}

function wireSegmented(container, onChange) {
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    for (const b of container.querySelectorAll('button')) b.classList.remove('active');
    btn.classList.add('active');
    onChange(btn.dataset.value);
    updateBeginNote();
  });
}

function getAdvanceMode() {
  return advanceModeSegmented.querySelector('button.active')?.dataset.value || 'auto';
}
function getWordTarget() {
  return parseInt(lengthSegmented.querySelector('button.active')?.dataset.value || '160', 10);
}

function updateBeginNote() {
  const turns = turnsSelect.value;
  const mode = getAdvanceMode() === 'auto' ? 'auto-advance' : 'manual advance';
  const lengthBtn = lengthSegmented.querySelector('button.active');
  const lengthLabel = (lengthBtn ? lengthBtn.textContent : 'Standard').toLowerCase();
  beginNote.textContent = `${turns} turns · ${mode} · ${lengthLabel} length`;
}

loadFileBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  const file = fileInput.files && fileInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => { paperTextInput.value = String(reader.result || ''); };
  reader.readAsText(file);
});

turnsSelect.addEventListener('change', updateBeginNote);
wireSegmented(advanceModeSegmented, () => {});
wireSegmented(lengthSegmented, () => {});
wireStanceSelect('A');
wireStanceSelect('B');
wireProviderSelect(agentAProvider, agentAModel, agentAProviderHint);
wireProviderSelect(agentBProvider, agentBModel, agentBProviderHint);

function clearSetupErrors() {
  setupError.classList.add('hidden');
  paperTextError.classList.add('hidden');
  agentAModelError.classList.add('hidden');
  agentBModelError.classList.add('hidden');
}

function showSetupError(message) {
  setupErrorCopy.textContent = message;
  setupError.classList.remove('hidden');
  setupError.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function buildConfigFromForm() {
  return {
    paper: {
      title: paperTitleInput.value.trim(),
      text: paperTextInput.value.trim(),
    },
    agents: [
      {
        name: agentAName.value.trim() || 'Agent A',
        provider: agentAProvider.value,
        model: agentAModel.value.trim(),
        stance: resolvedStance('A'),
      },
      {
        name: agentBName.value.trim() || 'Agent B',
        provider: agentBProvider.value,
        model: agentBModel.value.trim(),
        stance: resolvedStance('B'),
      },
    ],
    maxTurns: parseInt(turnsSelect.value, 10),
    autoAdvance: getAdvanceMode() === 'auto',
    wordTarget: getWordTarget(),
  };
}

const agentCardA = document.getElementById('agent-card-a');
const agentCardB = document.getElementById('agent-card-b');

function validateForm(config) {
  let ok = true;
  agentCardA.classList.remove('invalid');
  agentCardB.classList.remove('invalid');
  if (!config.paper.text) {
    paperTextError.classList.remove('hidden');
    ok = false;
  }
  if (!config.agents[0].model) {
    agentAModelError.classList.remove('hidden');
    agentCardA.classList.add('invalid');
    ok = false;
  }
  if (!config.agents[1].model) {
    agentBModelError.classList.remove('hidden');
    agentCardB.classList.add('invalid');
    ok = false;
  }
  return ok;
}

setupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearSetupErrors();
  const config = buildConfigFromForm();
  if (!validateForm(config)) return;

  const beginBtn = document.getElementById('begin-btn');
  beginBtn.disabled = true;
  try {
    const res = await fetch('/api/debates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Could not start the debate.' }));
      showSetupError(err.error || 'Could not start the debate.');
      return;
    }
    const { id } = await res.json();
    state.debateId = id;
    history.replaceState(null, '', `?debate=${id}`);
    await fetch(`/api/debates/${id}/start`, { method: 'POST' });
    showStageView();
    connectSSE(id);
  } catch (err) {
    showSetupError('Network error — is the server running?');
  } finally {
    beginBtn.disabled = false;
  }
});

// ---------------------------------------------------------------
// View switching
// ---------------------------------------------------------------

function showStageView() {
  state.view = 'stage';
  setupView.classList.add('hidden');
  stageView.classList.remove('hidden');
}

// ---------------------------------------------------------------
// SSE
// ---------------------------------------------------------------

function connectSSE(id) {
  if (state.eventSource) state.eventSource.close();
  const es = new EventSource(`/api/debates/${id}/events`);
  es.addEventListener('snapshot', (e) => onSnapshot(JSON.parse(e.data)));
  es.addEventListener('turn_start', (e) => onTurnStart(JSON.parse(e.data)));
  es.addEventListener('delta', (e) => onDelta(JSON.parse(e.data)));
  es.addEventListener('turn_end', (e) => onTurnEnd(JSON.parse(e.data)));
  es.addEventListener('state', (e) => onStateEvent(JSON.parse(e.data)));
  es.addEventListener('done', (e) => onDone(JSON.parse(e.data)));
  es.addEventListener('entry_edited', (e) => onEntryEdited(JSON.parse(e.data)));
  es.addEventListener('moderator_added', (e) => onModeratorAdded(JSON.parse(e.data)));
  // NOTE: EventSource's native connection-failure event is also named
  // "error" — the same name our server uses for a real debate-turn
  // error. Disambiguate via presence of `.data` (only server-sent
  // custom events carry a payload).
  es.addEventListener('error', (e) => {
    if (e.data) onDebateError(JSON.parse(e.data));
    else console.warn('SSE connection issue (browser will auto-retry):', e);
  });
  state.eventSource = es;
}

function getAgentConfig(agentIndex) {
  return state.config.agents[agentIndex];
}

function providerLabel(providerId) {
  const p = state.providers.find((x) => x.id === providerId);
  return p ? p.label : providerId;
}

function onSnapshot(snap) {
  state.config = snap.config;
  state.transcript = snap.transcript;
  state.liveTurn = snap.liveTurn;
  state.sessionState = snap.state;
  state.lastError = snap.lastError;
  renderStageChrome();
  rebuildTranscriptFromScratch();
  updateControlsUI();
}

function onTurnStart(data) {
  removeBetweenTurnsDivider();
  closeTransientEditors();
  state.liveTurn = { turn: data.turn, agentIndex: data.agentIndex, text: '' };
  state.pinnedToLive = true;
  hideJumpPill();
  appendStatementRow(data);
  updateRoundChrome();
  updateControlsUI();
  scrollToBottom(false);
}

function onDelta(data) {
  if (!state.liveTurn || state.liveTurn.turn !== data.turn) return;
  state.liveTurn.text += data.text;
  updateLiveStatementBody();
  if (state.pinnedToLive) scrollToBottom(false);
  else showJumpPillIfStreaming();
}

function onTurnEnd(entry) {
  const idx = state.transcript.findIndex((t) => t.type !== 'moderator' && t.turn === entry.turn);
  if (idx === -1) state.transcript.push(entry); else state.transcript[idx] = entry;
  state.liveTurn = null;
  finalizeStatementRow(entry);
  appendBetweenTurnsDividerIfMore(entry.turn);
  updateRoundChrome();
  updateControlsUI();
  hideJumpPill();
  if (state.pinnedToLive) scrollToBottom(false);
}

function onStateEvent(data) {
  state.sessionState = data.state;
  state.lastError = data.lastError;
  updateStatePill();
  updateControlsUI();
}

function onDebateError(data) {
  state.lastError = data;
  state.liveTurn = null;
  removeBetweenTurnsDivider();
  renderErrorBanner(data);
  updateStatePill();
  updateControlsUI();
}

function onDone(data) {
  removeBetweenTurnsDivider();
  renderFinishedBlock(data);
  updateControlsUI();
}

// ---------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------

function renderStageChrome() {
  stagePaperTitle.textContent = state.config.paper.title;
  renderPlaybill();
  updateRoundChrome();
  updateStatePill();
}

function renderPlaybill() {
  const a = state.config.agents[0];
  const b = state.config.agents[1];
  playbillEl.innerHTML = `
    <div class="playbill-side a">
      <span class="crest crest-a"><span class="crest-letter">${escapeHtml((a.name || '?').charAt(0).toUpperCase())}</span></span>
      <div>
        <p class="combatant-name">${escapeHtml(a.name)}</p>
        <p class="combatant-meta">${escapeHtml(providerLabel(a.provider))} · ${escapeHtml(a.model)}</p>
        <p class="combatant-stance">&ldquo;${escapeHtml(a.stance)}&rdquo;</p>
      </div>
    </div>
    <span class="vs-medallion">vs</span>
    <div class="playbill-side b">
      <span class="crest crest-b">${escapeHtml((b.name || '?').charAt(0).toUpperCase())}</span>
      <div>
        <p class="combatant-name">${escapeHtml(b.name)}</p>
        <p class="combatant-meta">${escapeHtml(providerLabel(b.provider))} · ${escapeHtml(b.model)}</p>
        <p class="combatant-stance">&ldquo;${escapeHtml(b.stance)}&rdquo;</p>
      </div>
    </div>`;
}

function updateRoundChrome() {
  const totalRounds = Math.max(1, Math.ceil(state.config.maxTurns / 2));
  const completedTurns = state.transcript.filter((e) => e.type !== 'moderator').length;
  const liveTurnIdx = state.liveTurn ? state.liveTurn.turn : null;
  let currentRound;
  if (liveTurnIdx != null) currentRound = Math.floor(liveTurnIdx / 2) + 1;
  else if (completedTurns > 0) currentRound = Math.floor((completedTurns - 1) / 2) + 1;
  else currentRound = state.sessionState === 'finished' ? totalRounds : 1;
  roundValueEl.textContent = `${Math.min(currentRound, totalRounds)} of ${totalRounds}`;

  roundTicksEl.innerHTML = '';
  for (let r = 0; r < totalRounds; r++) {
    const t0 = 2 * r;
    const t1 = 2 * r + 1;
    const t0done = t0 < completedTurns;
    const t1exists = t1 < state.config.maxTurns;
    const t1done = t1exists ? t1 < completedTurns : true;
    let cls = 'tick';
    if (t0done && t1done) cls += ' done';
    else if (t0done || t1done || liveTurnIdx === t0 || liveTurnIdx === t1) cls += ' current';
    const span = document.createElement('span');
    span.className = cls;
    roundTicksEl.appendChild(span);
  }
}

function updateStatePill() {
  let cls = 'idle';
  let text = 'Ready';
  let showDot = false;
  if (state.sessionState === 'paused' && state.lastError) {
    cls = 'error'; text = 'Error';
  } else if (state.sessionState === 'running') {
    cls = 'live'; text = 'Live'; showDot = true;
  } else if (state.sessionState === 'paused') {
    cls = 'paused'; text = 'Paused';
  } else if (state.sessionState === 'finished') {
    cls = 'finished'; text = 'Finished';
  }
  statePillEl.className = `state-pill ${cls}`;
  statePillEl.innerHTML = showDot ? `<span class="dot"></span>${text}` : text;
}

function updateControlsUI() {
  const running = state.sessionState === 'running';
  const finished = state.sessionState === 'finished';
  startPauseBtn.disabled = finished;
  startPauseBtn.innerHTML = running
    ? `${PAUSE_SVG}Pause`
    : `${PLAY_SVG}${state.sessionState === 'configured' ? 'Start' : 'Resume'}`;

  const autoAdvance = Boolean(state.config && state.config.autoAdvance);
  const nextEnabled = !finished && !state.liveTurn && (!autoAdvance || state.sessionState === 'paused');
  // The Next-turn predicate doubles as the moderation gate — moderation is
  // legal exactly when a turn isn't streaming and the loop isn't auto-running
  // (server twin: DebateSession.canModerate). Paused-with-error qualifies.
  state.canModerate = nextEnabled;
  appShell.classList.toggle('can-moderate', nextEnabled);
  nextBtn.disabled = !nextEnabled;
  nextBtn.title = autoAdvance && state.sessionState !== 'paused' ? 'Auto-advance is on' : '';
  nextKbdHint.textContent = autoAdvance ? 'N · auto-advance on' : 'N';

  endBtn.disabled = finished;
  updateModeratorInjectUI();
}

function agentSideClass(agentIndex) {
  return agentIndex === 0 ? 'agentA' : 'agentB';
}

function appendStatementRow(data) {
  const agent = getAgentConfig(data.agentIndex);
  const sideClass = agentSideClass(data.agentIndex);
  const row = document.createElement('div');
  row.className = `stmt-row ${sideClass}`;
  row.id = `turn-row-${data.turn}`;
  const crestLetter = escapeHtml((agent.name || '?').charAt(0).toUpperCase());
  const crestHTML = data.agentIndex === 0
    ? `<span class="crest crest-a sm"><span class="crest-letter">${crestLetter}</span></span>`
    : `<span class="crest crest-b sm">${crestLetter}</span>`;
  row.innerHTML = `
    <article class="stmt ${sideClass} is-live" id="stmt-${data.turn}">
      <div class="stmt-meta">
        ${crestHTML}
        <span class="stmt-name">${escapeHtml(agent.name)}</span>
        <span class="stmt-sep">·</span>
        <span class="stmt-provider">${escapeHtml(providerLabel(data.provider || agent.provider))}</span>
        <span class="stmt-sep">·</span>
        <span class="stmt-model">${escapeHtml(data.model || agent.model)}</span>
        <span class="stmt-meta-right">
          <span class="live-tag"><span class="live-dot"></span>Live</span>
          Turn ${Math.floor(data.turn / 2) + 1}
          <button type="button" class="mod-action" data-mod-edit="${data.turn}">Edit</button>
          <button type="button" class="mod-action" data-mod-note="${data.turn}">+ Note</button>
        </span>
      </div>
      <div class="stmt-body" id="stmt-body-${data.turn}"></div>
    </article>`;
  transcriptBody.appendChild(row);
}

function updateLiveStatementBody() {
  const bodyEl = document.getElementById(`stmt-body-${state.liveTurn.turn}`);
  if (!bodyEl) return;
  bodyEl.innerHTML = `${renderStatementHTML(state.liveTurn.text)}<span class="caret"></span>`;
}

function finalizeStatementRow(entry) {
  const article = document.getElementById(`stmt-${entry.turn}`);
  if (article) {
    article.classList.remove('is-live');
    const liveTag = article.querySelector('.live-tag');
    if (liveTag) liveTag.remove();
  }
  const bodyEl = document.getElementById(`stmt-body-${entry.turn}`);
  if (bodyEl) bodyEl.innerHTML = renderStatementHTML(entry.text);
  if (entry.editedAt) ensureEditedTag(entry.turn);
}

function appendBetweenTurnsDividerIfMore(justFinishedTurn) {
  const nextTurn = justFinishedTurn + 1;
  if (nextTurn >= state.config.maxTurns) return;
  const nextAgent = getAgentConfig(nextTurn % 2);
  const div = document.createElement('div');
  div.className = 'between-turns';
  div.id = 'between-turns-divider';
  div.innerHTML = `${escapeHtml(nextAgent.name)} preparing to respond<span class="dots"><span></span><span></span><span></span></span>`;
  transcriptBody.appendChild(div);
}

function removeBetweenTurnsDivider() {
  const el = document.getElementById('between-turns-divider');
  if (el) el.remove();
}

function renderErrorBanner(data) {
  const rowId = `turn-row-${data.turn}`;
  const agent = getAgentConfig(data.turn % 2);
  const bannerHTML = `
    <div class="error-banner">
      <span class="error-icon">${WARNING_SVG}</span>
      <div>
        <p class="error-title">${escapeHtml(agent.name)} (${escapeHtml(agent.model)}) didn't respond</p>
        <p class="error-copy">${escapeHtml(data.message)} This is usually transient — retry the turn, or skip it and let the debate continue.</p>
        <div class="error-actions">
          <button type="button" class="btn btn-primary" data-action="retry">Retry turn</button>
          <button type="button" class="btn btn-quiet" data-action="skip">Skip turn</button>
        </div>
      </div>
    </div>`;
  let row = document.getElementById(rowId);
  if (!row) {
    row = document.createElement('div');
    row.id = rowId;
    transcriptBody.appendChild(row);
  }
  row.className = 'stmt-row-error';
  row.innerHTML = bannerHTML;
  row.querySelector('[data-action="retry"]').addEventListener('click', callNext);
  // The spec defines no dedicated "skip" endpoint — Retry and Skip
  // both map to POST /next (the only mechanism that advances a paused
  // session by one turn). Skip is presented as the calmer, secondary
  // action per the design, but has identical behavior today.
  row.querySelector('[data-action="skip"]').addEventListener('click', callNext);
}

function renderFinishedBlock(data) {
  const div = document.createElement('div');
  div.className = 'finished-block';
  div.id = 'finished-block';
  const rounds = Math.ceil(state.config.maxTurns / 2);
  div.innerHTML = `
    <div class="finished-rule"><span class="finished-diamond"></span></div>
    <p class="finished-label">Debate concluded — ${rounds} rounds, ${data.turns} statements</p>`;
  transcriptBody.appendChild(div);
}

function rebuildTranscriptFromScratch() {
  transcriptBody.innerHTML = '';
  for (const entry of state.transcript) {
    if (entry.type === 'moderator') {
      appendModeratorRow(entry);
    } else {
      appendStatementRow(entry);
      finalizeStatementRow(entry);
    }
  }
  if (state.liveTurn) {
    const agent = getAgentConfig(state.liveTurn.agentIndex);
    appendStatementRow({
      turn: state.liveTurn.turn,
      agentIndex: state.liveTurn.agentIndex,
      provider: agent.provider,
      model: agent.model,
    });
    updateLiveStatementBody();
  } else if (state.lastError) {
    renderErrorBanner(state.lastError);
  }
  if (state.sessionState === 'finished') {
    renderFinishedBlock({ turns: state.transcript.filter((e) => e.type !== 'moderator').length });
  }
  scrollToBottom(false);
}

// ---------------------------------------------------------------
// Moderation — edit-in-place, moderator notes, live-edge inject
// ---------------------------------------------------------------

// Shared editor for the three moderation surfaces (edit-in-place, the
// per-statement "+ Note", and the live-edge inject row). `onSave(text)` runs
// the request and resolves to an inline error string (shown under the
// textarea) or a falsy value on success; the caller / SSE handler tears the
// editor down once the change lands.
function buildModEditor({ initialValue = '', saveLabel = 'Save', onSave, onCancel }) {
  const el = document.createElement('div');
  el.className = 'mod-editor';

  const textarea = document.createElement('textarea');
  textarea.className = 'mod-textarea';
  textarea.value = initialValue; // property assignment — model/user text never reaches innerHTML here

  const error = document.createElement('p');
  error.className = 'mod-editor-error hidden';

  const actions = document.createElement('div');
  actions.className = 'mod-editor-actions';
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn btn-primary';
  saveBtn.textContent = saveLabel;
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn btn-quiet';
  cancelBtn.textContent = 'Cancel';
  actions.append(saveBtn, cancelBtn);

  el.append(textarea, error, actions);

  const syncSave = () => { saveBtn.disabled = !textarea.value.trim(); };
  syncSave();
  textarea.addEventListener('input', syncSave);

  // Handle Escape locally so the global keydown handler never sees it and
  // drops out of presentation mode. (The global guard already ignores keys
  // while a TEXTAREA is focused, so N/Space/F stay safe automatically.)
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); onCancel(); }
  });

  saveBtn.addEventListener('click', async () => {
    const text = textarea.value.trim();
    if (!text) return;
    saveBtn.disabled = true;
    error.classList.add('hidden');
    const message = await onSave(text);
    if (message) {
      error.textContent = message; // textContent — safe
      error.classList.remove('hidden');
      saveBtn.disabled = false;
    }
  });
  cancelBtn.addEventListener('click', () => onCancel());

  return { el, textarea };
}

function editErrorMessage(res) {
  if (res.status === 409) return 'Debate advanced — try again while paused.';
  if (res.status === 404) return 'This statement is no longer available.';
  return "Couldn't save the edit — try again.";
}

function moderatorErrorMessage(res) {
  if (res.status === 409) return 'Debate advanced — try again while paused.';
  return "Couldn't add the note — try again.";
}

// One delegated listener — survives every transcript rebuild, no per-row wiring.
transcriptBody.addEventListener('click', (e) => {
  const editBtn = e.target.closest('[data-mod-edit]');
  if (editBtn) { openEditor(parseInt(editBtn.dataset.modEdit, 10)); return; }
  const noteBtn = e.target.closest('[data-mod-note]');
  if (noteBtn) openNoteEditor(parseInt(noteBtn.dataset.modNote, 10));
});

function openEditor(turn) {
  const bodyEl = document.getElementById(`stmt-body-${turn}`);
  const entry = state.transcript.find((t) => t.type !== 'moderator' && t.turn === turn);
  if (!bodyEl || !entry) return;
  const editor = buildModEditor({
    initialValue: entry.text,
    saveLabel: 'Save edit',
    onSave: async (text) => {
      const res = await fetch(`/api/debates/${state.debateId}/transcript/${turn}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      // Success: the entry_edited SSE re-renders this body, closing the editor.
      return res.ok ? null : editErrorMessage(res);
    },
    onCancel: () => { bodyEl.innerHTML = renderStatementHTML(entry.text); },
  });
  bodyEl.innerHTML = '';
  bodyEl.appendChild(editor.el);
  editor.textarea.focus();
}

function openNoteEditor(turn) {
  const stmtRow = document.getElementById(`turn-row-${turn}`);
  if (!stmtRow) return;
  const existing = document.getElementById(`mod-note-row-${turn}`);
  if (existing) { existing.querySelector('.mod-textarea')?.focus(); return; }
  const row = document.createElement('div');
  row.className = 'stmt-row moderator mod-note-row';
  row.id = `mod-note-row-${turn}`;
  const editor = buildModEditor({
    initialValue: '',
    saveLabel: 'Add note',
    onSave: async (text) => {
      const res = await fetch(`/api/debates/${state.debateId}/moderator`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, afterTurn: turn }),
      });
      if (!res.ok) return moderatorErrorMessage(res);
      row.remove(); // the moderator_added SSE inserts the rendered entry
      return null;
    },
    onCancel: () => row.remove(),
  });
  row.appendChild(editor.el);
  stmtRow.insertAdjacentElement('afterend', row);
  editor.textarea.focus();
}

// Restore any open edit-in-place editors (discarding drafts) and drop
// transient note editors — called when a new turn starts streaming.
function closeTransientEditors() {
  for (const body of transcriptBody.querySelectorAll('.stmt-body')) {
    if (!body.querySelector('.mod-editor')) continue;
    const turn = parseInt(body.id.replace('stmt-body-', ''), 10);
    const entry = state.transcript.find((t) => t.type !== 'moderator' && t.turn === turn);
    body.innerHTML = entry ? renderStatementHTML(entry.text) : '';
  }
  for (const noteRow of transcriptBody.querySelectorAll('.mod-note-row')) noteRow.remove();
}

function ensureEditedTag(turn) {
  const article = document.getElementById(`stmt-${turn}`);
  if (!article) return;
  const metaRight = article.querySelector('.stmt-meta-right');
  if (!metaRight || metaRight.querySelector('.edited-tag')) return;
  const tag = document.createElement('span');
  tag.className = 'edited-tag';
  tag.title = 'Edited by moderator';
  tag.textContent = 'edited';
  const firstAction = metaRight.querySelector('.mod-action');
  if (firstAction) metaRight.insertBefore(tag, firstAction);
  else metaRight.appendChild(tag);
}

function buildModeratorRow(entry) {
  const row = document.createElement('div');
  row.className = 'stmt-row moderator';
  row.id = `mod-row-${entry.id}`; // server UUID; property assignment per the existing row.id idiom
  row.innerHTML = `
    <article class="stmt moderator">
      <div class="stmt-meta">
        <span class="stmt-name mod-name">Moderator</span>
        <span class="stmt-meta-right">after turn ${entry.afterTurn + 1}</span>
      </div>
      <div class="stmt-body"></div>
    </article>`;
  row.querySelector('.stmt-body').innerHTML = renderStatementHTML(entry.text);
  return row;
}

function appendModeratorRow(entry) {
  const row = buildModeratorRow(entry);
  transcriptBody.appendChild(row);
  return row;
}

function rowElementForEntry(entry) {
  return entry.type === 'moderator'
    ? document.getElementById(`mod-row-${entry.id}`)
    : document.getElementById(`turn-row-${entry.turn}`);
}

function onEntryEdited(entry) {
  const idx = state.transcript.findIndex((t) => t.type !== 'moderator' && t.turn === entry.turn);
  if (idx === -1) state.transcript.push(entry); else state.transcript[idx] = entry;
  const bodyEl = document.getElementById(`stmt-body-${entry.turn}`);
  if (bodyEl) bodyEl.innerHTML = renderStatementHTML(entry.text); // replaces any open editor for this turn
  if (entry.editedAt) ensureEditedTag(entry.turn);
}

function onModeratorAdded(entry) {
  const at = entry.afterTurn;
  // Mirror server/debate.js's findLastIndex insertion so array order matches.
  const lastIdx = state.transcript.findLastIndex(
    (e) => (e.type !== 'moderator' && e.turn <= at) || (e.type === 'moderator' && e.afterTurn <= at),
  );
  const insertIdx = lastIdx + 1;
  state.transcript.splice(insertIdx, 0, entry);

  const row = buildModeratorRow(entry);
  const nextEntry = state.transcript[insertIdx + 1];
  let anchor = nextEntry ? rowElementForEntry(nextEntry) : null;
  if (!anchor) anchor = document.getElementById('between-turns-divider') || document.getElementById('mod-inject');
  if (anchor) transcriptBody.insertBefore(row, anchor);
  else transcriptBody.appendChild(row);

  if (state.pinnedToLive && !nextEntry) scrollToBottom(false);
}

// The live-edge inject affordance, kept at the end of the transcript.
// Deliberately independent of the between-turns divider's lifecycle so it
// survives the paused-with-error state, where moderation is still legal.
let injectExpanded = false;

function updateModeratorInjectUI() {
  const hasStatements = state.transcript.some((e) => e.type !== 'moderator');
  const visible = state.canModerate && hasStatements && !state.presentation;
  let row = document.getElementById('mod-inject');
  if (!visible) {
    if (row) row.remove();
    injectExpanded = false;
    return;
  }
  if (!row) {
    row = document.createElement('div');
    row.id = 'mod-inject';
    row.className = 'stmt-row moderator';
    renderModeratorInject(row);
  }
  transcriptBody.appendChild(row); // keep it at the live edge (moves an existing row without losing its draft)
}

function renderModeratorInject(row) {
  row.innerHTML = '';
  if (!injectExpanded) {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'mod-inject-toggle';
    toggle.textContent = '＋ Moderator note';
    toggle.addEventListener('click', () => { injectExpanded = true; renderModeratorInject(row); });
    row.appendChild(toggle);
    return;
  }
  const editor = buildModEditor({
    initialValue: '',
    saveLabel: 'Add note',
    onSave: async (text) => {
      const res = await fetch(`/api/debates/${state.debateId}/moderator`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) return moderatorErrorMessage(res);
      injectExpanded = false;
      renderModeratorInject(row); // collapse; the moderator_added SSE inserts the entry
      return null;
    },
    onCancel: () => { injectExpanded = false; renderModeratorInject(row); },
  });
  row.appendChild(editor.el);
  editor.textarea.focus();
}

// ---------------------------------------------------------------
// Controls
// ---------------------------------------------------------------

async function callNext() {
  if (nextBtn.disabled) return;
  await fetch(`/api/debates/${state.debateId}/next`, { method: 'POST' });
}

startPauseBtn.addEventListener('click', async () => {
  if (!state.debateId) return;
  if (state.sessionState === 'running') {
    await fetch(`/api/debates/${state.debateId}/pause`, { method: 'POST' });
  } else {
    await fetch(`/api/debates/${state.debateId}/start`, { method: 'POST' });
  }
});

nextBtn.addEventListener('click', callNext);

endBtn.addEventListener('click', async () => {
  if (!state.debateId) return;
  await fetch(`/api/debates/${state.debateId}/stop`, { method: 'POST' });
});

downloadBtn.addEventListener('click', () => {
  if (!state.debateId) return;
  const a = document.createElement('a');
  a.href = `/api/debates/${state.debateId}/transcript?format=md`;
  a.download = `colloquy-${state.debateId}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
});

presentationBtn.addEventListener('click', () => togglePresentationMode());

// ---------------------------------------------------------------
// Auto-scroll & jump-to-live
// ---------------------------------------------------------------

function isAtBottom() {
  return (window.innerHeight + window.scrollY) >= (document.documentElement.scrollHeight - 4);
}

function scrollToBottom(smooth) {
  window.scrollTo({ top: document.documentElement.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
}

function showJumpPillIfStreaming() {
  jumpPill.classList.toggle('visible', Boolean(state.liveTurn) && !state.pinnedToLive);
}

function hideJumpPill() {
  jumpPill.classList.remove('visible');
}

function unpinIfScrolledAway() {
  if (state.view !== 'stage') return;
  if (!isAtBottom()) {
    state.pinnedToLive = false;
    showJumpPillIfStreaming();
  }
}

window.addEventListener('wheel', unpinIfScrolledAway, { passive: true });
window.addEventListener('touchmove', unpinIfScrolledAway, { passive: true });

jumpPill.addEventListener('click', () => {
  state.pinnedToLive = true;
  hideJumpPill();
  scrollToBottom(true);
});

// ---------------------------------------------------------------
// Presentation mode
// ---------------------------------------------------------------

let autoHideTimer = null;

function resetAutoHideTimer() {
  if (!state.presentation) return;
  controlsBar.classList.remove('auto-hide');
  clearTimeout(autoHideTimer);
  autoHideTimer = setTimeout(() => controlsBar.classList.add('auto-hide'), 3000);
}

function togglePresentationMode(force) {
  const next = force !== undefined ? force : !state.presentation;
  state.presentation = next;
  appShell.classList.toggle('presentation', next);
  updateModeratorInjectUI();
  if (next) {
    document.documentElement.requestFullscreen?.().catch(() => {});
    resetAutoHideTimer();
  } else {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    clearTimeout(autoHideTimer);
    controlsBar.classList.remove('auto-hide');
  }
}

document.addEventListener('mousemove', resetAutoHideTimer);
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && state.presentation) togglePresentationMode(false);
});

// ---------------------------------------------------------------
// Keyboard shortcuts
// ---------------------------------------------------------------

document.addEventListener('keydown', (e) => {
  resetAutoHideTimer();
  const tag = document.activeElement && document.activeElement.tagName;
  const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  if (typing) return;
  if (state.view !== 'stage') return;

  if (e.code === 'Space') {
    e.preventDefault();
    startPauseBtn.click();
  } else if (e.key === 'n' || e.key === 'N') {
    if (!nextBtn.disabled) nextBtn.click();
  } else if (e.key === 'f' || e.key === 'F') {
    togglePresentationMode();
  } else if (e.key === 'Escape') {
    if (state.presentation) togglePresentationMode(false);
  } else if (e.key === 'ArrowDown') {
    if (jumpPill.classList.contains('visible')) jumpPill.click();
  }
});

// ---------------------------------------------------------------
// Init
// ---------------------------------------------------------------

(async function init() {
  populateStanceSelect(agentAStancePreset);
  populateStanceSelect(agentBStancePreset);
  agentAStancePreset.value = 'methodological-skeptic';
  agentBStancePreset.value = 'contribution-champion';
  updateBeginNote();

  await loadProviders();

  const params = new URLSearchParams(location.search);
  const existingId = params.get('debate');
  if (existingId) {
    state.debateId = existingId;
    showStageView();
    connectSSE(existingId);
  }
})();
