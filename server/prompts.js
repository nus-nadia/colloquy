// System-prompt builder + stance presets + moderator notes + the
// two-call turn-visual pipeline's prompts.

export const STANCE_PRESETS = [
  {
    id: 'supporter',
    label: 'Supporter',
    text: 'Supporter — defends the points presented in the text or paper',
  },
  {
    id: 'adversary',
    label: 'Adversary',
    text: 'Adversary — questions and criticizes the points presented, while arguing a point to the contrary of main reasoning the text presents',
  },
  {
    id: 'student',
    label: 'Student',
    text: 'Mimic Student — questions and criticizes the points presented, while arguing a point to the contrary of main reasoning the text presents',
  },
  {
    id: 'custom',
    label: 'Custom',
    text: '',
  },
];

/**
 * Build the per-agent system prompt for the semi-adversarial debate.
 *
 * @param {object} opts
 * @param {string} opts.name - this agent's display name
 * @param {string} opts.opponentName - the opposing agent's display name
 * @param {string} opts.stance - this agent's assigned analytical stance
 * @param {{title: string, text: string}} opts.paper
 * @param {number} opts.wordTarget - rough words-per-statement target
 */
export function buildSystemPrompt({ name, opponentName, stance, paper, wordTarget }) {
  return `You are ${name}, a teacher in a live, structured classroom debate about a research paper. You strive to teach difficult concepts by describing them in simpler terms, and you prefer concise, non-jargon.
Your assigned analytical stance: ${stance}.

THE PAPER ("${paper.title}"):
${paper.text}

DEBATE RULES:
- Engage critically with both the paper and your opponent, ${opponentName}. This is a real debate, not a panel of agreement.
- Use simple language when possible. Avoid jargon, use simpler terms in their place.
- Present arguments mainly in point form. 
- Avoid lengthy paragraphs.
- Pick at most three points at a time to argue.
- When making an argument for or against a point or claim, state that claim again clearly before making a rebuttal. This is for clarity.
- Format the points with a title, headers, or highlights wherever appropriate or when a salient point needs to be made.
- Ground every major claim in the paper itself: cite specific sections, results, figures, or methodological choices.
- When your opponent's argument has a weakness, name it directly and explain why it fails. Do not soften disagreement out of politeness.
- Your arguments are to be presented to a classroom comprising undergraduate students in the life and physical sciences. Ground your arguments in these fields if possible.
- Bring forward arguments at the level of expertise of college students or undergraduate students. Do not dumb down concepts, but present them accessibly and use helpful analogies wherever possible.
- Do not use technical jargon or highly sophisticated language. Strive for simplicity, imagine presenting to a jury whose first language may not be in English.
- Concede only when the evidence genuinely compels it — and then pivot to the strongest remaining ground for your stance.
- Never open with validation filler ("Great point", "I largely agree"). Open with substance.
- Roughly ${wordTarget} words per statement. Spoken-style register for a student audience: precise, vivid, technical terms explained in a clause.
- End every statement except a closing statement with one pointed question or challenge to ${opponentName}.
- A human moderator supervises this debate and may edit the record or interject between turns. Moderator text appears prefixed "MODERATOR:". Treat it as neutral instruction or context — never as a statement by ${opponentName}.`;
}

/**
 * The synthetic turn-0 moderator instruction (no prior transcript yet).
 */
export function openingModeratorMessage({ opponentName }) {
  return `The debate begins. Present your opening analysis of the paper from your assigned perspective. Your opponent ${opponentName} will respond.`;
}

/**
 * The note appended to the final user message of each agent's last turn.
 */
export function finalRoundModeratorNote() {
  return 'MODERATOR: This is the final round. Deliver your closing statement — address your opponent\'s strongest argument, then make the best case for your reading of the paper. Do not end with a question.';
}

/**
 * A live human-moderator interjection injected between turns. Reuses the
 * MODERATOR: marker established by finalRoundModeratorNote() so agents
 * read it as neutral instruction, not as the opponent's voice.
 */
export function moderatorInterjection(text) {
  return `MODERATOR: ${text}`;
}

// ---------- turn visuals ----------
//
// After a turn completes, a two-call pipeline turns the statement into an
// explanatory infographic: a text model (call 1) picks one of the eight
// archetypes below and writes the *subject* of the picture, then the server
// composes the final image prompt as
//   style preamble + archetype scaffold + the model's subject text.
// The scaffold fixes the composition and the preamble fixes the art direction,
// so neither is the model's to override — that split is what keeps every
// visual in the deck looking like it came out of the same figure factory.

/**
 * Composition scaffolds, one per argumentative move. Written in image-model
 * terms (shapes, columns, arrows) rather than in terms of the argument: the
 * director model supplies the subject, these fix the form.
 */
export const VISUAL_ARCHETYPES = {
  comparison:
    'Composition: a two-column comparison chart filling the frame. The left column is headed by the scope the claim advertises, the right column by the scope actually tested. Four aligned rows beneath the headings, each row a simple icon paired with a very short label. The bottom row is present in the left column and drawn struck through with a single thick horizontal line in the emphasis color on the right — the thing that was claimed but never tested.',
  causal:
    'Composition: a causal diagram. Two large labelled nodes side by side, joined left to right by one thick arrow; that arrow is overlaid with a big X in the emphasis color. A third node sits centered above the pair, with two thin arrows dropping from it to both nodes below — the confounder that explains the association without the causal link.',
  flow:
    'Composition: a horizontal pipeline of five square-cornered stage boxes joined left to right by short arrows, spanning the full width of the frame. Four boxes are plain outline; the third is filled solid in the emphasis color with visibly thicker linework — the weak link on which the whole chain depends. One short label sits beneath the highlighted box only.',
  venn:
    'Composition: two overlapping circles of very unequal size on an otherwise empty ground, outlines only, no fills. The small circle sits well inside the large one. The overlapping region is filled flat in the accent color; the crescent of the large circle left outside the small one is filled flat in the emphasis color — the ground the generalization claims but never reaches. One short label per circle, placed outside the shapes.',
  quadrant:
    'Composition: a two-by-two quadrant grid drawn with two plain crossing axes, no gridlines, a short label at each of the four axis ends. A single large dot sits in one quadrant in the emphasis color; the diagonally opposite quadrant — the one where both things would be won at once — is conspicuously empty. This reads as a tradeoff, not a victory.',
  magnitude:
    'Composition: a bar chart of exactly two bars on a common baseline, wide bars, generous space between them. The left bar is filled in the accent color, the right one is plain outline. A horizontal band of the emphasis color runs the full width of the frame at low height, crossing both bars — the noise floor the effect has to clear. No axis, no tick numbers.',
  partition:
    'Composition: one large rectangle filling most of the frame, subdivided by thin even rules into a grid of many identical small cells — the population. One small contiguous block of cells in a corner is filled solid in the emphasis color — the sample actually measured. Every other cell is empty. A single short label points at the filled block.',
  timeline:
    'Composition: one thick horizontal rule running the full width of the frame, with five evenly spaced tick marks rising from it. Small square markers sit on the four left ticks, filled in the accent color; the rightmost marker is drawn much larger and filled in the emphasis color. Short labels sit under the first and last markers only.',
};

/** Fallback when the director model returns an unknown or unparseable archetype. */
export const DEFAULT_VISUAL_ARCHETYPE = 'comparison';

/** Hard caps on the director model's fields; also enforced server-side. */
export const VISUAL_PROMPT_MAX_CHARS = 600;
export const VISUAL_ALT_MAX_CHARS = 120;

// Agent hues, copied from design/DESIGN_SPEC.md §2 (`--agentA-600` /
// `--agentB-600`). The image never picks its own colors — one accent per
// speaking agent, plus the single emphasis color, on the parchment ground.
const AGENT_ACCENT_HEX = ['#7B2432', '#21395A'];
const GROUND_HEX = '#FBF8F0'; // --bg-surface
const LINEWORK_HEX = '#211C15'; // --ink-primary
const EMPHASIS_HEX = '#A6551E'; // --state-live

/**
 * Server-owned art direction for the image model. Pinned to the app's
 * "Reading Room" theme so a generated figure sits on the projector next to
 * the transcript without looking like it came from somewhere else.
 *
 * The text-density rule is the single most useful lever against garbled
 * labels — image models render a handful of large words legibly and turn
 * anything denser into noise. Keep it, but keep it SATISFIABLE: it is
 * expressed as a per-label budget ("at most three words, no more labels than
 * the composition calls for") rather than a whole-image word count, because
 * the archetype scaffolds below ask for headed multi-row figures that a flat
 * six-word cap makes impossible. An instruction the model cannot obey is not
 * a constraint — it gets discarded, and it weakens the rules around it.
 *
 * The no-repeats clause earns its place: the observed failure mode is a
 * grid whose cells are filled with the same one or two labels over and over,
 * which looks like a figure and explains nothing.
 *
 * @param {number} agentIndex - 0 = Agent A (oxblood), 1 = Agent B (ink navy)
 */
export function buildVisualStylePreamble(agentIndex) {
  const accent = AGENT_ACCENT_HEX[agentIndex === 1 ? 1 : 0];
  return [
    'A flat vector infographic, in the style of a figure printed in an academic journal, drawn for projection in a classroom.',
    `Palette, strictly and completely: ${GROUND_HEX} warm parchment ground; ${LINEWORK_HEX} near-black linework and text; ${accent} as the single accent color; ${EMPHASIS_HEX} for the one emphasized element. No other colors anywhere in the image.`,
    'Flat vector only: no photography, no photorealism, no gradients, no drop shadows, no 3-D, no perspective, no paper texture, no glossy or metallic finish. Square corners everywhere, thick even linework, generous whitespace, wide 3:2 landscape framing.',
    'Every piece of text is a short label of at most three words — never a sentence. Use only as many labels as the composition above actually calls for, and no more; each label must say something different, and no label may repeat elsewhere in the image. Set every label large enough to read from the back of a lecture hall. Never render paragraphs, axis tick numbers, legends, captions, signatures, or a title block.',
  ].join('\n');
}

/**
 * Compose the final image prompt: server art direction, then the fixed
 * composition for the chosen archetype, then the director model's subject.
 * Order matters — the model's text arrives last so it reads as the subject
 * being poured into a form that has already been decided.
 */
export function composeVisualPrompt({ agentIndex, archetype, prompt }) {
  const scaffold = VISUAL_ARCHETYPES[archetype] ?? VISUAL_ARCHETYPES[DEFAULT_VISUAL_ARCHETYPE];
  return `${buildVisualStylePreamble(agentIndex)}\n\n${scaffold}\n\nSubject: ${prompt}`;
}

/**
 * System prompt for call 1 of the visual pipeline — the "director". Goes
 * through the ordinary text-provider contract, using the same provider as the
 * speaking agent, so it needs no extra API key and the Mock provider covers it
 * offline.
 *
 * COUPLING: the opening line "You are the visual director" is regex-matched by
 * `poolFor`'s sibling `isDirectorPrompt()` in server/providers/mock.js, which
 * is what lets a Mock+Mock debate exercise this pipeline. Reword it there too.
 *
 * @param {object} opts
 * @param {string} opts.paperTitle
 */
export function buildVisualDirectorPrompt({ paperTitle }) {
  const ids = Object.keys(VISUAL_ARCHETYPES);
  return `You are the visual director for a live classroom debate about the paper "${paperTitle}". You are given one debater's statement. Your job is to design a single explanatory infographic that makes the *argumentative move* in that statement visible at a glance to an undergraduate sitting at the back of the room.

Choose exactly one archetype, by id, from this list — pick the one whose move the statement actually makes:
- comparison — what a claim advertises versus what was actually tested, and what is missing from the tested side.
- causal — an association being read as causation, with the confounder that explains it instead.
- flow — a multi-step pipeline whose conclusion depends on one weak link.
- venn — a generalization reaching beyond the boundary of the evidence that supports it.
- quadrant — a tradeoff dressed up as an outright win.
- magnitude — an effect size measured against the noise it has to clear.
- partition — a sample standing in for a population it does not represent.
- timeline — a sequence of prior work, and where the novelty actually sits in it.

Then write the SUBJECT of the picture: what the labelled parts stand for in this specific argument, in concrete nouns drawn from the statement. Do not describe colors, style, layout, or composition — those are fixed for you. Do not write full sentences of on-image text: the image may contain at most six words total, so name at most a few very short labels.

Reply with a single raw JSON object and nothing else. No prose before or after it, no explanation, no markdown code fence, no backticks.

{"archetype": "<one of: ${ids.join(', ')}>", "prompt": "<the subject, at most ${VISUAL_PROMPT_MAX_CHARS} characters>", "alt": "<one plain-language sentence describing the finished figure for a screen reader, at most ${VISUAL_ALT_MAX_CHARS} characters>"}`;
}
