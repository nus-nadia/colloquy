// Mock provider adapter — the zero-API-key demo and automated-test path.
//
// Ships two small pools of pre-written scholarly debate turns (a
// "skeptic-flavored" pool and a "contribution-defense-flavored" pool),
// generic enough to plausibly fit any paper under debate. Which pool a
// given call draws from is inferred from the agent's stance text in
// the system prompt (stable for a given agent across the whole
// debate, since the system prompt doesn't change turn to turn), so
// the same mock agent keeps a consistent "voice" for the whole
// session. Text streams out word-by-word with a short delay so the
// UI experience looks identical to a real streaming provider.

const SKEPTIC_TURNS = [
  "Let's start with what the paper actually claims, not what the abstract implies. The headline result is reported as a single aggregate number, and the methods section is thin on exactly the details that would let anyone else reproduce it: sample sizes per condition, whether a held-out validation split existed at all, and what — if anything — was tuned on the test set itself. A strong result without that bookkeeping isn't evidence of a strong method; it's evidence of an unaudited pipeline. Extraordinary claims about generalization need ordinary things like seeds, splits, and variance across runs, and the paper is short on all three. Before we grant that the core mechanism works as described, can you point to where the paper actually rules out the simplest explanation — that this is measuring noise dressed up as signal?",
  "Even granting the mechanism works on paper, the experimental design only tests it in the one setting the authors chose to report, which is exactly the setting most favorable to their hypothesis. There's no ablation showing what happens when the assumptions the method leans on are violated, and no comparison against a baseline that's been given equal tuning effort — the comparison as constructed advantages the proposed approach by construction, not by result. That's a design problem, not a bad-luck problem. What would it take, in your view, for this paper to have actually stress-tested its own claim instead of just illustrating it?",
  `The statistics here are doing more work than they can bear. Table 3 reports a gap of \\(\\Delta = 2.1\\) points from $n = 5$ runs with no confidence intervals, and the standard error on a mean of five samples is

$$\\mathrm{SE} = \\frac{\\sigma}{\\sqrt{n}} = \\frac{\\sigma}{\\sqrt{5}} \\approx 0.45\\,\\sigma$$

so unless the run-to-run spread is under about one point, that headline gap sits inside the noise. Put the actual test the paper never runs on the page:

\\[
t = \\frac{\\bar{x}_1 - \\bar{x}_2}{s_p \\sqrt{\\tfrac{1}{n_1} + \\tfrac{1}{n_2}}}
\\]

With $n_1 = n_2 = 5$ you need $|t| > 2.31$ to clear $p < 0.05$, and nothing reported gets you there. If the authors ran this on a different day with different seeds, would the gap survive? Nothing in the text lets a reader answer that, which means the central number in the abstract is currently unfalsifiable. Five runs at $40 to $60 of compute each is not a budget problem — it's a choice. Can you actually defend the sample size, or is it just what was affordable?`,
  "Reproducibility is the real fault line here, and it's worth separating two very different failures: sloppy reporting versus an irreproducible result. The paper doesn't release enough — no seed list, no full hyperparameter sweep, no clear description of what exactly varied between the proposed method and the baseline it beats. That's not pedantry; it's the difference between a claim a reader can check and a claim a reader has to take on faith. Papers that can't be independently verified shouldn't get to claim the strong form of their result, only a weaker, hedged version. So: if I ran your exact described procedure myself, on a fresh random seed, do you actually believe I'd land within reporting distance of the number in the abstract?",
  "There's also a framing problem worth naming directly: the paper presents its result as evidence for a general principle, but every piece of supporting evidence comes from one narrow task family. Generalization is the claim; a single benchmark is the evidence. Those aren't the same size of claim, and the gap between them is exactly where I'd want more scrutiny, not less. A result that only holds in the exact conditions it was measured under isn't a general finding, it's a case study wearing a general finding's clothes. What in the paper, specifically, would you point to as evidence this transfers beyond the one setting tested — and not just as an assertion in the discussion section?",
  "So let's land this. I'm not arguing the underlying idea is wrong — I'm arguing the paper's evidence is weaker than its rhetoric. The gap between what's measured and what's claimed is the whole disagreement: a single aggregate number, an under-specified baseline comparison, and no variance reporting are being asked to support a much bigger claim than they can carry. Tighten the reporting, show the variance, and stress-test the assumption under conditions the authors didn't choose themselves, and this could be a genuinely strong result. Right now it's a plausible one dressed up as a settled one, and that distinction matters for anyone trying to build on this work.",
];

const DEFENDER_TURNS = [
  "That's a fair concern about the write-up, but it's worth being precise about what it actually undermines. The core mechanism the paper proposes is motivated from first principles in the methods section, and the reported result is consistent with that motivation rather than being the sole basis for it. Incomplete reporting is a real flaw and worth fixing, but it's a flaw in the paper's exposition, not necessarily in the underlying method — those are two different failures with two different remedies. The paper also isn't claiming something wildly implausible; it's claiming an incremental, mechanistically-motivated improvement, which is exactly the kind of claim that doesn't require extraordinary proof. What specific prediction of the method's account do you think the result actually contradicts, rather than just under-documents?",
  "On the design question: no single paper can stress-test every violated assumption, and demanding that standard would rule out publishing almost any incremental result in this area. The comparison the authors do run is against the strongest baseline commonly used in this line of work, which is the relevant bar to clear, not a hypothetical harder one that doesn't yet exist in the literature. Papers build on each other; this one clears the bar the field has actually set. That's meaningful progress even if it isn't a final word. Isn't it a bit of a motte-and-bailey to demand exhaustive robustness testing from a single paper while the rest of the field is held to a much lower standard?",
  `On the statistics: yes, more runs and formal confidence intervals would strengthen the paper, and that's a legitimate ask. But your $t$-test assumes the very thing in dispute — that \\(\\sigma\\) is large. Appendix B reports per-seed scores spanning well under a point, so take \\(\\sigma \\approx 0.4\\):

\`\`\`math
t = \\frac{2.1}{0.4\\sqrt{2/5}} \\approx 8.3
\`\`\`

That clears your own threshold by a factor of three. The effect size

$$d = \\frac{\\bar{x}_1 - \\bar{x}_2}{s_p} = \\frac{2.1}{0.4} \\approx 5.2$$

is enormous by any convention — Cohen calls $d > 0.8$ large. Absence of a printed interval is a reporting gap, not evidence the effect is fake, and you can reconstruct the interval from what *is* printed:

\\[
\\begin{aligned}
\\bar{x}_1 - \\bar{x}_2 &= 2.1 \\\\
\\mathrm{CI}_{95} &= 2.1 \\pm 2.31 \\cdot 0.25 = [1.52,\\ 2.68]
\\end{aligned}
\\]

which excludes zero comfortably. What would you accept as sufficient evidence of a real effect, short of a standard the field itself doesn't uniformly apply?`,
  "I'll concede the reproducibility package is thinner than it should be — that's a fair, specific criticism, and I'm not going to defend under-documented seeds. But sloppy release hygiene and an unreplicable finding are different claims, and the paper gives independent reasons — the ablation results, the consistency with prior work's mechanism — to expect the core result would hold up even without the missing details. A paper can be under-documented and still correct; those aren't mutually exclusive, and treating a documentation gap as disqualifying sets a standard most published work in this area wouldn't clear either. Given that the ablation supports the same conclusion through a completely separate comparison, doesn't that address most of your reproducibility worry on its own?",
  "On generalization: the paper is careful — more careful than you're crediting it for — to scope its claim to the task family it actually tests, and the discussion section explicitly flags the untested regimes rather than papering over them. That's the responsible way to report a narrow-but-real finding, not a framing problem. Asking a single paper to also demonstrate cross-domain transfer would be asking it to be three papers. The right move for the field is to treat this as a solid foundation result and let follow-up work test the boundaries, which is exactly how methodological progress usually happens. Would you actually trust a paper more if it made bigger claims on the same evidence, or does the narrower scope here work in its favor?",
  "To close: every specific complaint raised is really an ask for more documentation, more variance reporting, more breadth — reasonable requests, and ones I'd want addressed in a revision. None of them is evidence that the reported result is wrong, or that the mechanism motivating it is unsound. The paper makes a scoped, mechanistically-grounded claim, backs it with a result consistent with that mechanism, and is honest about where it hasn't been tested. That's what a solid, incremental contribution looks like before the field has had time to stress-test it further. The reporting can and should improve; the underlying contribution doesn't need to be thrown out to say so.",
];

function poolFor(system) {
  // Only look at the "assigned analytical stance" line, not the whole
  // system prompt — the debate-rules boilerplate below it ("engage
  // *critically*...") is identical for both agents and would otherwise
  // false-match skeptic-flavored keywords (e.g. "critic" inside
  // "critically") for every stance, always picking the same pool.
  //
  // Every scenario in server/prompts/ must therefore keep this marker on a
  // line of its OWN. `socratic` originally ran it inline ("...and your assigned
  // analytical stance is: X. If your stance is that of the teacher...") and the
  // capture then swallowed both role words, matching `student` for the teacher
  // agent too and putting both agents in one voice. Splitting the line is what
  // fixes that; do not "relax" this regex to accommodate an inline variant.
  const match = (system || '').match(/your assigned analytical stance:\s*([^\n]+)/i);
  const stanceLine = (match ? match[1] : system || '').toLowerCase();
  // Question-asking roles read onto the skeptic pool and explaining roles onto
  // the defender pool. That is not a perfect fit for a tutorial — both pools
  // are debate prose — but it keeps the two mock agents in *different* voices,
  // which is what makes an offline socratic run legible as a two-party
  // exchange rather than one voice talking to itself.
  if (/\bskeptic|\bprobe|reproducib|generaliz|\bcritic\b|criticiz|critique|advers|\brisk|examiner|\bethic|\bstudent|aspiring|\blearner/.test(stanceLine)) return SKEPTIC_TURNS;
  if (/champion|defend|supporter|advocate|adoption|contribution|\bteacher|knowledgeable|\bmentor/.test(stanceLine)) return DEFENDER_TURNS;
  // Fallback: deterministic split by system-prompt length so the same
  // agent always lands on the same pool for the life of the debate.
  return system && system.length % 2 === 0 ? SKEPTIC_TURNS : DEFENDER_TURNS;
}

// The turn-visual pipeline's first call reuses this same text adapter (same
// provider as the speaking agent, so it needs no extra key), but wants strict
// JSON back, not a debate turn. Detect it the same way poolFor() detects a
// stance: by regex-matching one distinctive line of the system prompt.
//
// COUPLING: this literal is the opening of buildVisualDirectorPrompt() in
// server/prompts/visuals.js (shared across scenarios — not per-scenario, so
// one literal covers them all). Reword it there and this falls through to a
// debate turn, which the JSON parser rejects — every mock visual would then
// land on the fallback archetype, silently making the offline pipeline
// untestable.
const DIRECTOR_MARKER = /you are the visual director/i;

// One canned director response per archetype, cycled deterministically by the
// length of the statement being illustrated — so a given turn always draws the
// same figure, but a debate doesn't repeat one archetype for six turns.
const DIRECTOR_TURNS = [
  { archetype: 'comparison', prompt: 'Left column: the authors’ definition of robustness. Right column: the definition the benchmark encodes. Rows contrast what each one counts as a failure.', alt: 'A two-column chart contrasting the paper’s definition of robustness against the benchmark’s.' },
  { archetype: 'omission', prompt: 'Left column: the general claim the paper advertises. Right column: the single benchmark actually run. Bottom row shows the untested condition.', alt: 'A two-column chart comparing the claimed scope against the one condition actually tested.' },
  { archetype: 'magnitude', prompt: 'A tall bar for the reported gap between methods and a short bar for the run-to-run spread, with the noise floor crossing both.', alt: 'Two bars comparing the reported effect against the run-to-run noise floor.' },
  { archetype: 'causal', prompt: 'Method on the left, reported score on the right, joined by a crossed-out arrow; tuning effort sits above as the shared cause of both.', alt: 'A causal diagram showing tuning effort as a confounder behind the reported gap.' },
  { archetype: 'partition', prompt: 'A grid standing for every setting the claim covers, with the handful of seeds actually measured filled in one corner.', alt: 'A grid of settings with the small measured sample shaded in one corner.' },
  { archetype: 'flow', prompt: 'A pipeline from data split to tuning to evaluation to headline number, with the unreported validation split as the weak stage.', alt: 'A four-stage pipeline with the unreported validation split marked as the weak link.' },
  { archetype: 'venn', prompt: 'A small circle for the benchmark evidence sitting inside a large circle for the general claim, with the uncovered ground emphasized.', alt: 'Two circles showing the general claim reaching well beyond the benchmark evidence.' },
  { archetype: 'quadrant', prompt: 'Axes of accuracy against compute cost, with the method placed in the high-accuracy high-cost quadrant and the win quadrant empty.', alt: 'A quadrant chart placing the method in a tradeoff rather than an outright win.' },
  { archetype: 'timeline', prompt: 'Four prior results marked along a line, with the paper as the larger final marker showing where the novelty actually sits.', alt: 'A timeline of prior work with this paper as the final, larger marker.' },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default {
  id: 'mock',
  label: 'Mock (offline demo)',
  defaultModel: 'mock-debater-v1',

  isConfigured() {
    return true;
  },

  async *stream({ system, messages }) {
    if (DIRECTOR_MARKER.test(system || '')) {
      const statement = messages.map((m) => m.content).join('');
      const spec = DIRECTOR_TURNS[statement.length % DIRECTOR_TURNS.length];
      // Emit in two chunks: the caller concatenates, so this exercises that
      // path rather than handing it one pre-assembled string.
      const json = JSON.stringify(spec);
      const split = Math.floor(json.length / 2);
      await sleep(60);
      yield json.slice(0, split);
      await sleep(60);
      yield json.slice(split);
      return;
    }
    const pool = poolFor(system);
    const priorTurnsBySpeaker = messages.filter((m) => m.role === 'assistant').length;
    const text = pool[priorTurnsBySpeaker % pool.length];
    const words = text.match(/\S+\s*/g) ?? [text];
    for (const word of words) {
      await sleep(25);
      yield word;
    }
  },
};
