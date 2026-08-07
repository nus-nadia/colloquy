// Scenario: classroom-debate — the original Colloquy experience.
//
// Two teachers argue opposite readings of a research paper for an
// undergraduate audience. Symmetric: both agents get the same prompt with
// name/opponentName/stance swapped. Every turn but the last ends with a
// challenge aimed at the opponent.
//
// This is the default scenario, and its prompt text is deliberately identical
// to what server/prompts.js held before the scenario split — a debate started
// with no ?scenario= param must behave exactly as it did before.

import { moderatorInterjection } from './moderator.js';

export default {
  id: 'classroom-debate',
  label: 'Classroom debate',

  stances: [
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
  ],

  // These are the strings hard-coded in index.html before the split, so the
  // default scenario renders the setup form and stage exactly as before.
  labels: {
    sourceHeading: 'The paper',
    sourceTextLabel: 'Paper text',
    sourceTextPlaceholder: 'Paste the abstract, or the full paper text, here...',
    sourceTextError: "Paper text can't be empty.",
    stageKicker: 'Paper under debate',
  },

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
  buildSystemPrompt({ name, opponentName, stance, paper, wordTarget }) {
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
  },

  /**
   * The synthetic turn-0 moderator instruction (no prior transcript yet).
   */
  openingModeratorMessage({ opponentName }) {
    return `The debate begins. Present your opening analysis of the paper from your assigned perspective. Your opponent ${opponentName} will respond.`;
  },

  /**
   * The note appended to the final user message of each agent's last turn.
   */
  finalRoundModeratorNote() {
    return 'MODERATOR: This is the final round. Deliver your closing statement — address your opponent\'s strongest argument, then make the best case for your reading of the paper. Do not end with a question.';
  },

  moderatorInterjection,
};
