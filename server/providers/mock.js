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
  "The statistics here are doing more work than they can bear. A handful of runs, no confidence intervals, and a single point comparison against a baseline dressed as a definitive result — that's not enough runs to distinguish a real effect from sampling variance, and the paper never says otherwise. If the authors ran this experiment on a different day with different seeds, would the reported gap survive? Nothing in the text lets a reader answer that question, which means the central number in the abstract is currently unfalsifiable. I'd want to see the same comparison with proper variance reporting before treating the effect as established. Can you actually defend the sample size, or is it just what was affordable?",
  "Reproducibility is the real fault line here, and it's worth separating two very different failures: sloppy reporting versus an irreproducible result. The paper doesn't release enough — no seed list, no full hyperparameter sweep, no clear description of what exactly varied between the proposed method and the baseline it beats. That's not pedantry; it's the difference between a claim a reader can check and a claim a reader has to take on faith. Papers that can't be independently verified shouldn't get to claim the strong form of their result, only a weaker, hedged version. So: if I ran your exact described procedure myself, on a fresh random seed, do you actually believe I'd land within reporting distance of the number in the abstract?",
  "There's also a framing problem worth naming directly: the paper presents its result as evidence for a general principle, but every piece of supporting evidence comes from one narrow task family. Generalization is the claim; a single benchmark is the evidence. Those aren't the same size of claim, and the gap between them is exactly where I'd want more scrutiny, not less. A result that only holds in the exact conditions it was measured under isn't a general finding, it's a case study wearing a general finding's clothes. What in the paper, specifically, would you point to as evidence this transfers beyond the one setting tested — and not just as an assertion in the discussion section?",
  "So let's land this. I'm not arguing the underlying idea is wrong — I'm arguing the paper's evidence is weaker than its rhetoric. The gap between what's measured and what's claimed is the whole disagreement: a single aggregate number, an under-specified baseline comparison, and no variance reporting are being asked to support a much bigger claim than they can carry. Tighten the reporting, show the variance, and stress-test the assumption under conditions the authors didn't choose themselves, and this could be a genuinely strong result. Right now it's a plausible one dressed up as a settled one, and that distinction matters for anyone trying to build on this work.",
];

const DEFENDER_TURNS = [
  "That's a fair concern about the write-up, but it's worth being precise about what it actually undermines. The core mechanism the paper proposes is motivated from first principles in the methods section, and the reported result is consistent with that motivation rather than being the sole basis for it. Incomplete reporting is a real flaw and worth fixing, but it's a flaw in the paper's exposition, not necessarily in the underlying method — those are two different failures with two different remedies. The paper also isn't claiming something wildly implausible; it's claiming an incremental, mechanistically-motivated improvement, which is exactly the kind of claim that doesn't require extraordinary proof. What specific prediction of the method's account do you think the result actually contradicts, rather than just under-documents?",
  "On the design question: no single paper can stress-test every violated assumption, and demanding that standard would rule out publishing almost any incremental result in this area. The comparison the authors do run is against the strongest baseline commonly used in this line of work, which is the relevant bar to clear, not a hypothetical harder one that doesn't yet exist in the literature. Papers build on each other; this one clears the bar the field has actually set. That's meaningful progress even if it isn't a final word. Isn't it a bit of a motte-and-bailey to demand exhaustive robustness testing from a single paper while the rest of the field is held to a much lower standard?",
  "On the statistics: yes, more runs and formal confidence intervals would strengthen the paper, and that's a legitimate ask. But the effect size reported here isn't a marginal, noise-adjacent number — it's large enough that it would need an implausibly large amount of variance to be pure sampling artifact, and nothing in the method's description gives a mechanistic reason to expect that much variance. Absence of a confidence interval is a reporting gap, not evidence the effect is fake. We should ask for better statistics going forward without treating their absence today as a reason to disbelieve a result that's otherwise mechanistically coherent. What would you accept as sufficient evidence of a real effect, short of a standard the field itself doesn't uniformly apply?",
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
  const match = (system || '').match(/your assigned analytical stance:\s*([^\n]+)/i);
  const stanceLine = (match ? match[1] : system || '').toLowerCase();
  if (/\bskeptic|\bprobe|reproducib|generaliz|\bcritic\b|critique|\brisk|examiner|\bethic/.test(stanceLine)) return SKEPTIC_TURNS;
  if (/champion|defend|advocate|adoption|contribution/.test(stanceLine)) return DEFENDER_TURNS;
  // Fallback: deterministic split by system-prompt length so the same
  // agent always lands on the same pool for the life of the debate.
  return system && system.length % 2 === 0 ? SKEPTIC_TURNS : DEFENDER_TURNS;
}

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
