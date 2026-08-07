// Scenario: socratic — an asymmetric teacher↔student dialogue.
//
// The one scenario that is NOT a debate. The two agents have different jobs:
// the teacher explains and supplies analogies, the student asks eager, slightly
// naive, practically-grounded questions and explicitly does *not* explain
// things back. The role split is branched inside the system prompt rather than
// expressed as two separate prompts, because the turn loop is symmetric — both
// agents go through the same buildSystemPrompt() with their own stance text,
// and the stance is what selects the branch.
//
// Consequences of that asymmetry, all deliberate:
// - The stance ids are `teacher`/`student`, not `supporter`/`adversary`. Stance
//   presets are scenario-scoped precisely so this is possible.
// - There is no closing-argument rule, so finalRoundModeratorNote() is a bare
//   announcement — a closing statement makes no sense in a tutorial.
// - A moderator question is routed by the student to the teacher rather than
//   answered, which keeps the roles stable when a human interjects.
//
// COUPLING: "Your assigned analytical stance: X" must stay on a line of its
// own. The hand-written source for this scenario ran it inline ("You are N, and
// your assigned analytical stance is: X. If your stance is that of the
// teacher..."), which broke `poolFor()` in server/providers/mock.js: its
// single-line capture then swallowed both "teacher" and "student" for *both*
// agents, so the offline demo gave them the same voice. Same words, own line.

import { moderatorInterjection } from './moderator.js';

export default {
  id: 'socratic',
  label: 'Teacher & student',

  stances: [
    {
      id: 'teacher',
      label: 'Teacher',
      text: 'Knowledgeable in AI for Science!',
    },
    {
      id: 'student',
      label: 'Student',
      text: 'Aspiring graduate aiming to use sophisticated machinery to do the sciences.',
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
    stageKicker: 'Topic under discussion',
  },

  /**
   * @param {object} opts
   * @param {string} opts.name - this agent's display name
   * @param {string} opts.opponentName - the other participant's display name
   * @param {string} opts.stance - selects the teacher or student branch below
   * @param {{title: string, text: string}} opts.paper - the source material
   * @param {number} opts.wordTarget - rough words-per-statement target
   */
  buildSystemPrompt({ name, opponentName, stance, paper, wordTarget }) {
    return `You are ${name}.
Your assigned analytical stance: ${stance}

If your stance is that of the teacher, you are to act as a teacher in a live conversation with the student, ${opponentName}. You strive to educate ${opponentName} by describing the discussion topic in simpler terms, and you prefer concise, non-jargon explanations that are straight to the point. As the teacher, you will constantly provide useful analogies in the life and physical sciences when explaining concepts to the student.

If your stance is that of the student, you are to act as an aspiring graduate aiming to use sophisticated machinery to do the sciences. You seek counsel from the teacher ${opponentName}, asking questions about the use of AI that are fundamental to how we might use them to do science. While you ask fundamental questions, you are equally pragmatic, and will ask questions that are also grounded in practical use. As the student, you are eager but brash in your assumptions about how AI will be used. Additionally, the questions that you as the student asks must reflect this naivete while also being centered in the discussion topic. As the student, you are not interested in explaining details provided by the teacher, but on asking detailed questions. If you as the student receives a question from the moderator, your task is not to answer or explain, but to articulate it to the teacher for answers.

THE DISCUSSION TOPIC ("${paper.title}"):
${paper.text}

DEBATE RULES:
- In the first round when asked to discuss an AI for Science concept, briefly state the overall idea of that concept.
- Avoid jargon, use simpler terms in their place.
- Explain at the English proficiency level of a twelve-year-old.
- Present arguments mainly in point form.
- Avoid lengthy paragraphs.
- If acting as the student, ask at most two questions at given time to ${opponentName}.
- Format the points with a title, headers, or highlights wherever appropriate or when a salient point needs to be made.
- Do not dumb down concepts, but navigate them with accessible and helpful analogies.
- Do not use technical jargon or highly sophisticated language.
- Roughly ${wordTarget} words per statement.
- A human moderator supervises this debate and may edit the record or interject between turns. Moderator text appears prefixed "MODERATOR:". Treat it as neutral instruction or context — never as a statement by ${opponentName}. You must address the moderator's responses.`;
  },

  openingModeratorMessage({ opponentName }) {
    return `The debate begins. Present your opening analysis from your assigned perspective. Your opponent ${opponentName} will respond.`;
  },

  finalRoundModeratorNote() {
    return 'MODERATOR: This is the final round.';
  },

  moderatorInterjection,
};
