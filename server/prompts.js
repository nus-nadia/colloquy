// System-prompt builder + stance presets + moderator notes.

export const STANCE_PRESETS = [
  {
    id: 'methodological-skeptic',
    label: 'Methodological skeptic',
    text: 'Methodological skeptic — probe validity, statistics, baselines, and experimental design',
  },
  {
    id: 'contribution-champion',
    label: 'Champion of the contribution',
    text: 'Champion of the contribution — defend the significance, novelty, and rigor of the work',
  },
  {
    id: 'reproducibility-critic',
    label: 'Reproducibility & generalization critic',
    text: 'Reproducibility & generalization critic — question robustness beyond the reported setting',
  },
  {
    id: 'ethics-examiner',
    label: 'Ethics & societal impact examiner',
    text: 'Ethics & societal impact examiner — surface risks, externalities, and framing problems',
  },
  {
    id: 'adoption-advocate',
    label: 'Practical adoption advocate',
    text: 'Practical adoption advocate — argue for real-world value and deployment readiness',
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
  return `You are ${name}, a scholar in a live, structured classroom debate about a research paper.
Your assigned analytical stance: ${stance}.

THE PAPER ("${paper.title}"):
${paper.text}

DEBATE RULES:
- Engage critically with both the paper and your opponent, ${opponentName}. This is a real debate, not a panel of agreement.
- Ground every major claim in the paper itself: cite specific sections, results, figures, or methodological choices.
- When your opponent's argument has a weakness, name it directly and explain why it fails. Do not soften disagreement out of politeness.
- Concede only when the evidence genuinely compels it — and then pivot to the strongest remaining ground for your stance.
- Never open with validation filler ("Great point", "I largely agree"). Open with substance.
- Roughly ${wordTarget} words per statement. Spoken-style register for a student audience: precise, vivid, technical terms explained in a clause.
- End every statement except a closing statement with one pointed question or challenge to ${opponentName}.`;
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
