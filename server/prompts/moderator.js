// The one piece of prompt text that is the same in every scenario.
//
// "MODERATOR:" is a protocol marker, not prose: it is how a human interjection
// is distinguished from the opponent's voice in the reconstructed message
// history, and every scenario's system prompt has a rule referring to it by
// that exact literal. Scenarios reference this rather than each defining their
// own, so the marker can never drift apart from the rules that describe it.
//
// Each scenario still exposes it as `scenario.moderatorInterjection(text)` so
// callers in server/debate.js need only one lookup.

/**
 * A live human-moderator interjection injected between turns. Reuses the
 * MODERATOR: marker established by each scenario's finalRoundModeratorNote()
 * so agents read it as neutral instruction, not as the opponent's voice.
 */
export function moderatorInterjection(text) {
  return `MODERATOR: ${text}`;
}
