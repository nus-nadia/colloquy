// Scenario registry. Adding a new prompt scenario = add one module that
// default-exports the shape below, then add one import + one line to
// `SCENARIOS`. Same pattern as server/providers/index.js.
//
// A scenario module exports:
//   id, label                          — identity; `id` is what ?scenario= takes
//   stances: [{id, label, text}]        — scenario-scoped, NOT a global list
//   labels: {…}                         — UI text overrides, see below
//   buildSystemPrompt({name, opponentName, stance, paper, wordTarget})
//   openingModeratorMessage({opponentName})
//   finalRoundModeratorNote()
//   moderatorInterjection(text)
//
// The four functions have exactly the signatures server/prompts.js exported
// before the split, so server/debate.js calls them the same way — only the
// lookup in front changed.
//
// Stances are per-scenario because they are not interchangeable: `socratic`
// assigns teacher/student roles, which are meaningless in a debate, and
// `polarised-debate` deliberately omits the mimic-student. A scenario's stance
// `text` is what reaches the prompt, so it has to be written against that
// scenario's system prompt, not against a shared vocabulary.
//
// The visual pipeline (./visuals.js) is deliberately NOT per-scenario — see
// the header there.

import classroomDebate from './classroom-debate.js';
import polarisedDebate from './polarised-debate.js';
import socratic from './socratic.js';

const SCENARIOS = [classroomDebate, polarisedDebate, socratic];

// The scenario a debate gets when none is named. Must stay `classroom-debate`:
// its prompt text is identical to the pre-split server/prompts.js, so an
// unparameterized debate behaves exactly as it did before scenarios existed.
export const DEFAULT_SCENARIO_ID = 'classroom-debate';

const byId = new Map(SCENARIOS.map((s) => [s.id, s]));

/**
 * Resolve a scenario id, falling back to the default rather than returning
 * undefined. The fallback is the point: `?scenario=` is user-typed and
 * `config.scenarioId` is replayed from a session that may outlive a rename,
 * so a bad id has to degrade to the original behavior instead of throwing
 * inside the turn loop, where the failure would surface as a paused debate.
 */
export function getScenario(id) {
  return byId.get(id) || byId.get(DEFAULT_SCENARIO_ID);
}

/**
 * The full roster for the frontend. Returns every scenario's stances and
 * labels in one payload, so switching scenarios in the browser needs no
 * second request — GET /api/scenarios is fetched once at startup.
 */
export function listScenarios() {
  return SCENARIOS.map((s) => ({
    id: s.id,
    label: s.label,
    stances: s.stances,
    labels: s.labels,
  }));
}
