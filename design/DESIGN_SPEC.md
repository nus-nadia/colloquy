# Colloquy — Visual Design Spec

Theme: **"Reading Room"** (light, parchment/ink) — the single deliberate default theme. No dark theme is provided in v1 (see rationale below); presentation mode is a scaled variant of this same theme, not a separate palette.

---

## 1. Design rationale

Colloquy stages a debate, not a chat log. The visual language borrows from the seminar room and the printed journal, not the messaging app: a masthead like a periodical's, a "playbill" strip that introduces the two combatants before they speak, a quiet center spine running down the transcript like the aisle between two lecterns, and statement blocks that read like typeset entries in a proceedings volume — square-cornered (with one clipped corner, mirrored per side, like a dog-eared page), ruled, serif-set. Nothing here should look like it shipped inside a SaaS dashboard: no rounded chat bubbles, no purple gradients, no glossy cards. Color, shape, and position are all load-bearing.

The theme is light — warm parchment page, near-black ink text — because this app's hardest constraint is legibility on a classroom projector from the back of the room, and that is fundamentally different from legibility on a laptop screen at arm's length. Classroom projectors are rarely used in a blacked-out room; ambient light (windows, door glass, students' laptops) is present, and cheap/mid-range projectors cannot produce a true black — a dark-theme background degrades to a washed, low-contrast gray under any ambient light, crushing the very contrast a dark theme is supposed to buy you. A light, slightly warm (not pure-white, to reduce glare/halation) background paired with dense, near-black ink text keeps the contrast ratio high and *stable* as ambient light and projector quality vary, which a dark theme cannot guarantee. It also happens to look like what it is: a document under discussion.

Agent identity is deliberately over-determined so it survives from the back of a room and for colorblind viewers: fixed side (Agent A always left, Agent B always right), a distinct hue per agent (oxblood vs. ink navy — different hue families, not just different shades), a distinct crest shape per agent (diamond vs. circle, each holding the agent's initial), a mirrored clipped-corner treatment on the statement card itself, and a persistent name + provider + model label on every single statement. Any one of these five channels alone would be enough to tell the sides apart; together they make it unambiguous at a glance and robust to any single failure (e.g., a colorblind student, a washed-out projector, a screen reader).

---

## 2. Color system (exact hex)

All colors are warm-neutral (parchment/ink), never pure black/white, to avoid projector glare and halation. Use the `-700` variant of a semantic/agent color for **text set on that color's own tinted wash**, to guarantee AA contrast; use the `-600` variant for accents, borders, icon fills, and solid chip backgrounds (paired with `ink-inverse` text).

### Background layers

| Token | Hex | Usage |
|---|---|---|
| `--bg-masthead` | `#E7DEC7` | Top-most brand strip ("COLLOQUY") |
| `--bg-page` | `#F1EBDC` | Page/room background |
| `--bg-header` | `#F6F1E4` | Stage header bar (paper title + round indicator) |
| `--bg-surface` | `#FBF8F0` | Statement cards, agent cards, modals — the "page" surface, brightest layer |
| `--bg-surface-alt` | `#ECE3CE` | Controls bar, playbill strip, recessed panels |
| `--bg-sunken` | `#E5DCC4` | Text inputs, textareas, tally-tick track |
| `--bg-scrim` | `rgba(33,28,21,0.45)` | Paused overlay / modal scrim |

### Rules & borders

| Token | Hex | Usage |
|---|---|---|
| `--rule-hairline` | `#DBCFAF` | Default 1px dividers, card borders |
| `--rule-strong` | `#C7B78D` | Emphasis dividers, input borders, button outlines |
| `--rule-spine` | `#D4C6A2` | The center "debate floor" spine line down the transcript |

### Text / ink hierarchy

| Token | Hex | Usage |
|---|---|---|
| `--ink-primary` | `#211C15` | Headings, statement body copy |
| `--ink-secondary` | `#56503F` | Meta text, labels, captions |
| `--ink-tertiary` | `#857C63` | Timestamps, placeholders, disabled text |
| `--ink-placeholder` | `#A89C7C` | Form placeholder text only |
| `--ink-inverse` | `#F7F1E2` | Text set on solid ink/agent/state fills |

### Agent A — "Oxblood" (fixed left side)

| Token | Hex | Usage |
|---|---|---|
| `--agentA-700` | `#5B1B26` | Text on `agentA-100` wash |
| `--agentA-600` | `#7B2432` | Primary hue: crest fill, top accent bar, chip name color |
| `--agentA-500` | `#96313F` | Hover/active state of agent-colored controls |
| `--agentA-200` | `#E4C2C0` | Border tint (e.g. hovered card outline) |
| `--agentA-100` | `#F3E1DE` | Wash background (e.g. selected/active agent card) |

### Agent B — "Ink Navy" (fixed right side)

| Token | Hex | Usage |
|---|---|---|
| `--agentB-700` | `#172A42` | Text on `agentB-100` wash |
| `--agentB-600` | `#21395A` | Primary hue: crest fill, top accent bar, chip name color |
| `--agentB-500` | `#2E4A70` | Hover/active state of agent-colored controls |
| `--agentB-200` | `#C1CCDA` | Border tint |
| `--agentB-100` | `#E2E7EE` | Wash background |

Agent hues are intentionally different *hue families* (red vs. blue), not merely different lightness, so they remain distinguishable under grayscale projection and to protanopia/deuteranopia viewers. Never assign these hues to any other semantic meaning in the app.

### Semantic states

| State | Accent (`-600`) | Text-on-wash (`-700`) | Wash bg (`-100`) | Notes |
|---|---|---|---|---|
| Live / streaming | `--state-live: #A6551E` | `#7C4015` | `#F4E3D2` | Warm ember/amber — theatrical "spotlight," distinct from both agent hues |
| Paused | `--state-paused: #6B6350` | `#4F4938` | `#EAE2CC` | Muted olive-gray — "at rest," low energy |
| Finished | `--state-finished: #3E5D45` | `#2E4635` | `#E1E8DC` | Deep forest green — calm resolution |
| Error | `--state-error: #9C3B2E` | `#7A2E22` | `#F5E1DA` | Brick red-orange; deliberately a different hue angle than Agent A's oxblood so an error never reads as "Agent A's fault" |
| Focus ring | `#A6551E`, 2px, 2px offset | — | — | Consistent app-wide keyboard focus indicator |

Contrast targets: body text on page/surface layers exceeds 12:1 (AAA). Agent hues and semantic `-600` accents on `bg-surface`/`bg-page` exceed 6:1. Text-on-wash pairs (`-700` on `-100`) target ≥ 6:1. All meet or exceed WCAG AA at every pairing actually used for text; most clear AAA — deliberate headroom for projector washout.

---

## 3. Typography

No web fonts, no icon fonts — with one exception, below. Three system stacks, used with intent:

```
--font-serif: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Times New Roman", serif;
--font-sans:  -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
--font-mono:  ui-monospace, "SF Mono", "Cascadia Code", "Roboto Mono", Consolas, Menlo, monospace;
```

- **Serif** carries anything that *is* the debate: paper title, statement body, stance lines, the finished/paused ornament copy. It's what gives this a journal/manuscript character.
- **Sans** carries UI chrome: labels, buttons, chips' agent-name, form fields, timestamps.
- **Mono** is reserved for one thing only: model identifiers (`claude-opus-4-8`, `gemini-2.5-pro`), so they read as literal technical strings, not prose.
- **Math** is the exception to "no web fonts": the KaTeX faces ship with the typesetter, because there is no system-stack equivalent for math glyphs — a `\sum` or a stretched radical rendered in Georgia is not the same character. They are vendored under `public/vendor/katex/fonts/` (woff2 only) and served from the app itself, so the no-network posture is intact. Rendered math sits at 1.05em against the serif body so it reads as the same size as the prose around it rather than KaTeX's default 1.21em; display blocks scroll horizontally inside the 62ch column instead of widening the statement.

### Type scale (Normal mode / Presentation mode)

| Role | Font | Weight | Normal | Presentation | Line-height | Tracking |
|---|---|---|---|---|---|---|
| Masthead wordmark | sans | 700 | 13px | *(hidden in presentation)* | 1 | 0.14em |
| Paper title (H1) | serif | 700 | 25px | 34px | 1.25 | 0 |
| Round label ("ROUND") | sans | 700 | 11px | 13px | 1 | 0.08em |
| Round value ("2 of 4") | serif | 600 | 17px | 21px | 1.2 | 0 |
| State pill text | sans | 700 | 12px | 14px | 1 | 0.05em |
| Combatant name (playbill) | sans | 700 | 17px | 20px | 1.2 | 0 |
| Combatant stance (playbill) | serif italic | 400 | 14px | 17px | 1.4 | 0 |
| Statement meta: agent name | sans | 700 | 15.5px | 18px | 1.2 | 0 |
| Statement meta: provider/model | mono | 500 | 12.5px | 15px | 1.2 | 0 |
| Statement meta: turn/time | sans | 500 | 12px | 14px | 1.2 | 0 |
| **Statement body** | serif | 400 | **19px** | **28px** | 1.62 / 1.55 | 0 |
| Between-turns divider | serif italic | 400 | 13px | 16px | 1.3 | 0.02em |
| Button label | sans | 600 | 13.5px | 15px | 1 | 0 |
| Keyboard hint caption | sans | 500 | 11px | *(hidden)* | 1 | 0.02em |
| Setup field label | sans | 700 | 12.5px | — | 1.2 | 0.06em |
| Setup input text | sans | 400 | 15.5px | — | 1.4 | 0 |
| Paper textarea content | serif | 400 | 16px | — | 1.5 | 0 |
| "Begin Debate" label | sans | 700 | 16px | — | 1 | 0.02em |

Statement body meets the brief's hard floor (≥18px normal, ≥24px presentation) with margin (19px / 28px) to stay comfortably legible as rooms and projectors vary.

---

## 4. Spacing & layout system

Base unit **4px**; scale used throughout: `4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80`.

### Page grid

- App shell: `max-width: 1280px`, centered, fluid side margins (`clamp(16px, 4vw, 48px)`).
- Chrome stack, top to bottom: masthead (34px) → stage header (auto, ~76px) → round-progress ticks (28px) → combatants/playbill strip (auto, ~84px) → transcript → controls bar (64px, sticky bottom).
- Transcript container: `max-width: 1120px`, centered, `padding: 32px`. A 1px `--rule-spine` line runs down its exact horizontal center, from the top of the first statement to the bottom of the last — the "debate floor" aisle.
- Each statement row is a flex row spanning the transcript width: Agent A rows justify to the **start** (left), Agent B rows justify to the **end** (right). Statement block width: `min(520px, 100%)` (~62–66 characters at 19px serif — the readability ceiling for a single line).

### Statement block anatomy (top → bottom)

1. **Top accent bar** — 4px solid, agent's `-600` hue, full block width.
2. **Meta bar** — 12px/20px padding, 1px hairline rule below it. Contains, left to right: crest mark (26px shape + initial) · agent name (sans 700) · "·" · provider (sans 500, secondary) · "·" · model (mono 500, secondary) · flexible spacer · turn label · elapsed/word-count (secondary, tertiary color).
3. **Body** — 18px top / 20px side / 20px bottom padding, serif 19px/1.62, `max-width: 62ch` as a safety ceiling.
4. **Card frame** — `--bg-surface`, 1px `--rule-hairline` border, one **clipped corner** (`clip-path`, 10×10px cut) on the block's *outer* top corner — top-left for Agent A (left column, so its outward edge is the left edge), top-right for Agent B (mirrored, like two dog-eared pages turned outward from the spine). Corner radius otherwise **0** — this app does not use rounded "bubble" shapes for content, only for the transient jump-to-live pill.
5. Shadow: single soft drop shadow only (`0 1px 2px rgba(33,28,21,.06), 0 4px 10px rgba(33,28,21,.04)`) — a sheet of paper lifted slightly off the table, not a glossy SaaS card.

### Between-turns row

Full transcript width, centered text, no card — just italic serif caption + three animated dots, so it reads as a stage direction, not a message.

### Setup view grid

- Paper section: full width, label + title input, then a large textarea (min-height 220px) + a secondary "Load .txt/.md file" button below-right of it.
- Agent cards: 2-column grid (`1fr 1fr`, 24px gap) below ~720px stacks to 1 column. Each card carries its agent's accent bar + crest, exactly as the transcript will, so the instructor sees the same identity they'll see on the projector.
- Debate settings: 3-column grid (turns / advance mode / response length), 24px gap.
- "Begin Debate": full-width prominent button, right-aligned within its row, large tap target (52px tall).

---

## 5. Component inventory & states

**Masthead** — static brand strip. One state.

**Stage header** — paper title + round indicator + state pill. States of the state pill: `LIVE` (amber dot, pulsing), `PAUSED` (olive, static), `FINISHED` (green, static), `ERROR` (brick, static). Idle/configured-not-started shows no pill or a neutral "READY" pill in `ink-tertiary`.

**Round-progress ticks** — one tick per configured round. Filled `ink-primary` = completed, outlined `rule-strong` = upcoming, filled `state-live` + soft pulse = current round.

**Combatants / playbill strip** — two fixed-side panels (crest, name, provider/model, stance in italic) either side of a small circular "VS" medallion sitting on the spine. Static; this is scene-setting, shown once above the transcript.

**Agent card (setup)** — states: *default* (rule-hairline border), *focus-within* (border → agent `-500`, subtle `-100` wash), *provider unavailable* (option shown but disabled, `ink-tertiary` text + "no API key" note, no accent color), *invalid* (thin `state-error` bottom border + inline error caption under the offending field).

**Identity chip / statement meta bar** — *static* (as described above) and *live-pulsing* (crest gets a soft outward glow ring animation in the agent's own hue at low opacity; an amber `LIVE` micro-tag appears before the turn label).

**Statement block** — *static/completed* (as above), *streaming* (blinking caret `▍` at the end of the growing body text, top accent bar at full saturation, subtle glow as above), *error-inline* (the block is replaced edge-to-edge by the error banner treatment below — the turn is not silently skipped).

**Error banner** — calm, not alarming: `bg-surface` card, 1px `state-error-border`, 4px left-only accent bar in `state-error`, small triangular warning glyph (CSS/SVG, not emoji), one line of plain-language copy naming the agent and failure, a primary "Retry" button and a quieter "Skip turn" text action. No red flash, no shake.

**Finished treatment** — after the last statement: a centered horizontal rule with a small neutral diamond ornament at its center (echoes Agent A's crest shape but in neutral ink, symbolizing closure, not one side "winning"), and small-caps serif "Debate concluded" beneath it. State pill switches to `FINISHED` (green).

**Controls bar** — left group: Start/Pause (primary, label + icon swap by state), Next Turn (secondary; disabled + tooltip note "auto-advance is on" when not in manual mode), End Debate (quiet text-only, `state-error-700`, no button chrome, so it doesn't read as dangerous but is clearly a stop action). Right group: Download Transcript, Presentation Mode toggle. Buttons: flat fills, 1px borders, 3px corner radius (deliberately small — architectural, not pill-shaped), no gradients/glow. States: default / hover (slightly deeper fill or `bg-surface-alt` wash for secondary) / active (1px translateY) / disabled (`ink-tertiary` text, `rule-hairline` border, no hover).

**"Jump to live" pill** — the one intentionally rounded (999px) shape in the app, since it's a transient floating affordance, not content. Appears above the controls bar when the reader has scrolled away from the live edge during streaming; `ink-primary` fill, `ink-inverse` text, down-arrow + "Jump to live." Hover: `agentA/B`-neutral, just a slight lift shadow increase.

**Keyboard hint captions** — 11px sans captions under/beside the relevant control ("Space," "N," "F"), hidden in presentation mode along with the rest of the chrome.

---

## 6. Interaction notes

**Streaming affordance.** The currently-generating statement is the only one with: (a) a pulsing glow ring on its crest, (b) an amber `LIVE` micro-tag in its meta bar, (c) a blinking block caret at the point new text is appended. Text appends by simple reflow (no per-character fade/slide — motion should feel like handwriting appearing, not a UI animating). All other statements are fully static; only one statement is ever "live" at a time.

**Auto-scroll & "jump to live."** While a statement streams, the transcript auto-scrolls to keep its growing tail in view. The instant a user scrolls up (wheel, trackpad, touch) auto-scroll disengages and the "Jump to live" pill fades in above the controls bar; clicking it (or pressing `↓`) smooth-scrolls back to the streaming tail and re-engages auto-scroll. Auto-scroll also re-engages automatically at the start of the next turn.

**Presentation mode transition.** Toggling presentation mode (button or `F`) does three things over a ~200ms fade: (1) the masthead, keyboard-hint captions, and setup-adjacent chrome disappear; (2) type scale steps up to the Presentation column throughout; (3) the controls bar becomes an auto-hide overlay — visible on entry and on any mouse movement/keypress, fading to ~0 opacity after 3s of inactivity, reappearing instantly on the next movement. The moderation entry points (per-statement *Edit* / *+ Note*, and the ＋ Moderator note affordance at the live edge) fade on that same timer, so the instructor can intervene without leaving the projected view but the room sees no instructor chrome between interventions. An *open* editor is exempt — it never fades, since losing sight of a half-typed note mid-sentence is worse than a little chrome on the projector. The palette does not change — same parchment/ink theme, just larger and quieter. Exiting (`F`/`Esc`) reverses the fade and restores normal-mode chrome and scale.

**Keyboard hints.**

| Key | Action |
|---|---|
| `Space` | Pause / resume |
| `N` | Next turn (manual mode only) |
| `F` | Toggle presentation mode |
| `Esc` | Exit presentation mode |
| `↓` | Jump to live (when pill is showing) |

---

---

## 7. Turn visual panel

An optional generated infographic accompanying each statement. It is a **sixth** element of the statement block, not a sixth identity channel — it must never carry information about *which* agent is speaking, since §1's five channels are already sufficient and adding a sixth that can fail (a visual may be absent, pending, or failed) would weaken rather than strengthen them.

### Placement

The panel's parent **changes with the mode**. It is never allowed to take width away from the statement text: either it stacks below the text, or it goes in whitespace the text was not using.

- **Normal mode** — the panel lives *inside* the card, below the body, as a sibling of it inside the `.stmt-split` wrapper (a block here), at full card width. Normal mode is the instructor console, never projected, so the vertical cost is acceptable and the 520px card is unchanged. There is no usable gutter at 1120px anyway.
- **Presentation mode** — the panel is **lifted out of the card** into the row's empty gutter, as a sibling of `.stmt` inside `.stmt-row`, taking `flex: 1 1 0` with a `280px` floor: it claims *all* the width the card leaves, out to the transcript's own 5% page gutter, rather than a capped slice of it. The card keeps the whole of its own width for text; only a row that actually carries a visible panel (`.has-visual`) narrows to `58%` to open the gutter, so a visuals-off debate presents exactly as it did before the feature existed. A `.has-visual` row also drops the 6% outboard padding the bare rows keep — that inset is precisely the space the panel wants, and on a row without a panel it is the only thing stopping a lone card from stretching across the whole projector.

  Because the width is uncapped, the panel's declared 3:2 would drive its height past the bottom of a 16:9 screen at wide aspect ratios. The image is therefore capped at `72vh`: the ratio is allowed to break, the width still fills the row, and `object-fit: cover` crops rather than overflowing, so a statement and its visual stay on one screen. The pending/failed placeholder is capped identically, or it would reserve a taller box than the image that replaces it.

In presentation mode the panel sits on the card's **inboard** edge — right of Agent A (left column), left of Agent B — because that is where the unused whitespace is. It therefore **crosses the centre spine**, and that is intended: the spine is a hairline painted behind the row (`z-index: 0` against the row's `1`), so the opaque panel simply covers it for the length of one statement and the aisle reappears in the gaps between turns. The dog-eared clipped corner stays outboard and continues to do the mirroring work §4 assigns it; the panel is not an identity channel and does not need to mirror.

Implementation note: the panel cannot merely overflow the card in presentation mode. `.stmt` carries a `clip-path` for its clipped corner, which clips the entire subtree — an overflowing child is painted away, absolutely positioned or not. So the figure genuinely changes parents (`syncVisualMount()` in `public/app.js`), one node moved rather than two nodes duplicated.

### Treatment

`--bg-surface` ground, 1px `--rule-hairline`, the same paper-lift shadow as the statement card, and **square corners** — §4's prohibition holds, the jump-to-live pill remains the only rounded shape in the app. No gradient, no glow, no frame ornament.

The image is `width: 100%` at a fixed `aspect-ratio: 3/2` with `object-fit: cover`, so the panel reserves its footprint *before* the image arrives. Nothing may reflow mid-debate — a card that resizes under a reader on a projector is worse than no image.

Caption (`figcaption`): sans, `--ink-secondary`, ≥14px normal / ≥18px presentation.

### States

| State | Treatment |
|---|---|
| absent (visuals off) | render nothing; reserve no space |
| `pending` | `--bg-sunken` placeholder at the same aspect ratio, 1px hairline. No spinner. |
| `ready` | the image + caption |
| `failed` | same placeholder, one line of `--ink-tertiary` text |
| `skipped` | render nothing |

No spinner and no red anywhere: per §5 the app's failure treatment is calm, not alarming, and a visual failing is a non-event — the statement is still fully readable without it. The pending placeholder deliberately does not animate; §6 reserves motion for the three streaming affordances.

### Generated image content

The art direction is composed server-side and the generating model cannot override it. Ground `--bg-surface #FBF8F0`, linework `--ink-primary #211C15`, a single accent in the speaking agent's `-600` hue (`#7B2432` / `#21395A`), and `--state-live #A6551E` reserved for the one emphasized element. Flat vector infographic — no photography, no gradients, no 3-D, square corners, generous whitespace. Text is held to **short labels of at most three words, no more of them than the composition calls for, and none repeated**, each set large enough to read from the back of the room. Image models render in-image text unreliably, and on a projector a garbled label costs more attention than the graphic returns — but the rule must stay satisfiable: a flat "six words per image" cap contradicts the multi-row archetypes and is simply ignored.

---

## Deliberate deviations / notes for the engineer

- No second (dark) theme is included — the brief allowed this. Presentation mode reuses the same palette at larger scale rather than switching to dark, per the projector-contrast rationale in §1.
- The center "spine" line and the "playbill" combatants strip are additions beyond the brief's literal list, added because they're what make the transcript read as a debate floor rather than a chat log at a glance; they cost nothing structurally (a 1px absolutely-positioned line, one extra strip component) and are easy to omit if scope needs to shrink.
- Icons are minimal inline SVG line-glyphs (no icon font, no emoji) — see `mockup.html` for the exact paths/strokes to reuse.
