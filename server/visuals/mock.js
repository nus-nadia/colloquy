// Mock visual adapter — the zero-API-key demo and verification path for the
// turn-visual pipeline, and the reason a Mock+Mock debate stays a genuinely
// offline demo: with this selected the app still makes ZERO external requests,
// an explicit design property in CLAUDE.md and design/DESIGN_SPEC.md.
//
// Instead of calling an image API it composes an SVG on the spot: the chosen
// archetype's name, the turn number, and a small procedural bar figure. Every
// random-looking quantity comes from a PRNG seeded by the turn index, so the
// same debate re-run produces byte-identical images — reloads, reconnects, and
// screenshots in the design spec all stay stable. A ~400ms delay stands in for
// network latency so the frontend's pending -> ready transition is actually
// observable rather than instantaneous.
//
// Palette is the "Reading Room" theme from design/DESIGN_SPEC.md §2, the same
// tokens the style preamble pins for the real image models: parchment ground,
// near-black linework, the speaking agent's hue as the single accent, and the
// live/ember hue for the one emphasized element.

const GROUND = '#FBF8F0'; // --bg-surface
const HAIRLINE = '#DBCFAF'; // --rule-hairline
const INK = '#211C15'; // --ink-primary
const INK_SECONDARY = '#56503F'; // --ink-secondary
const INK_TERTIARY = '#857C63'; // --ink-tertiary
const EMPHASIS = '#A6551E'; // --state-live
const AGENT_HUES = ['#7B2432', '#21395A']; // --agentA-600 / --agentB-600

const WIDTH = 1536;
const HEIGHT = 1024;
const MARGIN = 96;

// mulberry32 — tiny, fast, and fully determined by its 32-bit seed.
function seededRandom(seed) {
  let a = (seed >>> 0) + 0x6d2b79f5;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The archetype id reaches us from a model, and SVG is XML — escape before
// interpolating, never after.
function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildSvg({ archetype, turn, agentIndex }) {
  const accent = AGENT_HUES[agentIndex === 1 ? 1 : 0];
  const rand = seededRandom(turn + 1);
  const label = escapeXml(String(archetype || 'figure').toUpperCase().replace(/[^A-Z0-9 ]/g, ' '));
  const turnLabel = `TURN ${turn + 1}`;

  const bars = 7;
  const gap = 28;
  const span = WIDTH - MARGIN * 2;
  const barWidth = (span - gap * (bars - 1)) / bars;
  const baseline = HEIGHT - 148;
  const heights = Array.from({ length: bars }, () => 110 + Math.round(rand() * 380));
  const highlight = Math.floor(rand() * bars);
  const noiseFloor = baseline - (90 + Math.round(rand() * 70));

  const columns = heights
    .map((h, i) => {
      const x = MARGIN + i * (barWidth + gap);
      const y = baseline - h;
      const fill = i === highlight ? EMPHASIS : accent;
      const opacity = i === highlight ? 1 : 0.82;
      return `<rect x="${x.toFixed(1)}" y="${y}" width="${barWidth.toFixed(1)}" height="${h}" fill="${fill}" fill-opacity="${opacity}"/>`;
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" role="img" aria-label="Mock ${label} figure for ${turnLabel}">
<title>Mock ${label} figure — ${turnLabel}</title>
<rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="${GROUND}"/>
<rect x="48" y="48" width="${WIDTH - 96}" height="${HEIGHT - 96}" fill="none" stroke="${HAIRLINE}" stroke-width="2"/>
<text x="${MARGIN}" y="150" font-family="Helvetica, Arial, sans-serif" font-size="26" font-weight="700" letter-spacing="6" fill="${INK_TERTIARY}">MOCK VISUAL</text>
<text x="${WIDTH - MARGIN}" y="150" text-anchor="end" font-family="Helvetica, Arial, sans-serif" font-size="26" font-weight="700" letter-spacing="6" fill="${INK_SECONDARY}">${escapeXml(turnLabel)}</text>
<text x="${MARGIN}" y="290" font-family="Georgia, 'Times New Roman', serif" font-size="104" font-weight="700" fill="${accent}">${label}</text>
<rect x="${MARGIN}" y="336" width="${span}" height="4" fill="${INK}"/>
${columns}
<line x1="${MARGIN}" y1="${noiseFloor}" x2="${WIDTH - MARGIN}" y2="${noiseFloor}" stroke="${INK}" stroke-width="4" stroke-dasharray="18 14"/>
<rect x="${MARGIN}" y="${baseline}" width="${span}" height="5" fill="${INK}"/>
</svg>
`;
}

export default {
  id: 'mock',
  label: 'Mock (offline demo)',
  defaultModel: 'mock-figure-v1',

  isConfigured() {
    return true;
  },

  // `prompt` is accepted and ignored on purpose — the whole point of the mock
  // is that nothing leaves the process. The debate context is what it draws.
  async render({ archetype, turn, agentIndex }) {
    await sleep(400);
    const svg = buildSvg({ archetype, turn: Number.isInteger(turn) ? turn : 0, agentIndex });
    return { bytes: Buffer.from(svg, 'utf8'), mime: 'image/svg+xml' };
  },
};
