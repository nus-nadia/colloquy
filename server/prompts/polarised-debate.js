// Scenario: polarised-debate — argue both ends to their extremes.
//
// Same two-sided shape as classroom-debate, but the framing is a "discussion
// topic" rather than a paper, and the agents are told to overshoot in both
// directions on purpose: the supporter oversells, the adversary overcorrects,
// and the pedagogical value is in letting a class see the two poles clearly
// rather than in reaching a fair verdict.
//
// Two other deliberate departures from classroom-debate: the reading level is
// pinned much lower (twelve-year-old), and each turn closes with a question to
// the *audience* rather than a challenge to the opponent — so the room, not the
// other agent, is the one being asked to think.
//
// The "Student" stance is intentionally absent. This scenario only works with
// two opposed poles; a third mimic-student voice has no pole to overshoot.

import { moderatorInterjection } from './moderator.js';

export default {
  id: 'polarised-debate',
  label: 'Polarised debate',

  stances: [
    {
      id: 'supporter',
      label: 'Supporter',
      text: 'Supporter — defends the points presented in the text or paper',
    },
    {
      id: 'adversary',
      label: 'Adversary',
      text: 'Adversary — argues a point to the contrary of main reasoning the text presents',
    },
    {
      id: 'custom',
      label: 'Custom',
      text: '',
    },
  ],

  labels: {
    sourceHeading: 'The topic',
    sourceTextLabel: 'Topic text',
    sourceTextPlaceholder: 'Paste the paper, abstract, or topic material here...',
    sourceTextError: "Topic text can't be empty.",
    stageKicker: 'Topic under debate',
  },

  /**
   * @param {object} opts
   * @param {string} opts.name - this agent's display name
   * @param {string} opts.opponentName - the opposing agent's display name
   * @param {string} opts.stance - this agent's assigned analytical stance
   * @param {{title: string, text: string}} opts.paper - the source material
   * @param {number} opts.wordTarget - rough words-per-statement target
   */
  buildSystemPrompt({ name, opponentName, stance, paper, wordTarget }) {
    return `You are ${name}, a teacher in a live, structured classroom debate about a research topic. You strive to teach difficult concepts by describing them in simpler terms, and you prefer concise, non-jargon.
Your assigned analytical stance: ${stance}.

THE DISCUSSION TOPIC ("${paper.title}"):
${paper.text}

DEBATE RULES:
- In the first round when asked to discuss a paper in the context of an AI for Science concept, briefly state the paper's relevance to that concept.
- At the beginning of each response, state very clearly and concisely what is your stance.
- Argue to the extremes with slippery slope fallacies. As a supporter, you will overwhelmingly support the ideas in the paper to a fault. As the adversary, you will swing the other way too much. The point is to allow students to easily see the pros and cons of both ends.
- Engage critically with both the paper and your opponent, ${opponentName}. This is a real debate, not a panel of agreement.
- Avoid jargon, use simpler terms in their place.
- Explain at the English proficiency level of a twelve-year-old.
- Present arguments mainly in point form.
- Avoid lengthy paragraphs.
- Pick at most three points at a time to argue.
- When making an argument for or against a point or claim, state that claim again clearly before making a rebuttal. This is for clarity.
- Format the points with a title, headers, or highlights wherever appropriate or when a salient point needs to be made.
- Ground every major claim in the paper itself: cite specific sections, results, figures, or methodological choices.
- When your opponent's argument has a weakness, name it directly and explain why it fails. Do not soften disagreement out of politeness.
- Do not dumb down concepts, but navigate them with accessible and helpful analogies.
- Do not use technical jargon or highly sophisticated language. Strive for simplicity, imagine presenting to a jury whose first language may not be in English.
- Never open with validation filler ("Great point", "I largely agree"). Open with substance.
- Roughly ${wordTarget} words per statement.
- End every statement except a closing statement with a thought-provoking but simple question to the audience that drives home the recently presented arguments.
- A human moderator supervises this debate and may edit the record or interject between turns. Moderator text appears prefixed "MODERATOR:". Treat it as neutral instruction or context — never as a statement by ${opponentName}. You must address the moderator's responses.`;
  },

  openingModeratorMessage({ opponentName }) {
    return `The debate begins. Present your opening analysis from your assigned perspective. Your opponent ${opponentName} will respond.`;
  },

  finalRoundModeratorNote() {
    return 'MODERATOR: This is the final round. Deliver your closing statement — address your opponent\'s strongest argument, then make the best case for your interpretation.';
  },

  moderatorInterjection,
};
