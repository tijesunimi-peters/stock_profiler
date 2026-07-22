# Altitude 3 — Sector Compare

**Prerequisite:** read `00-global-conventions.md` first.

This page puts **two sectors side by side** using the exact same seven-theme
spine as the overview. Nothing new is learned to read it — the only change from
`01` is that every row now carries **two values plus the gap between them.**
Consistency with the overview is the design point.

---

## Information ordering (top to bottom)

1. **Header bar** — two sector pickers + color assignment
2. **Composite scores** — paired bars per theme, with gap callout
3. **Metric medians** — paired mini-bars per metric

---

## 1. Header bar

Left to right:
- **Sector A picker** rendered as a pill carrying the **`accent`** color (with a
  small color dot), e.g. "Semiconductors".
- A quiet "vs" separator (`text.muted`).
- **Sector B picker** rendered as a pill carrying the **`secondary-accent`**
  color, e.g. "Software".
- Right side: the two peer-set counts and shared as-of period
  ("62 vs 148 filers · Q1 FY26").

**Color is assigned once, per sector, and held consistent** across every row and
card on the page (A = accent, B = secondary-accent). This is what lets the eye
track "which is which" without a legend on each panel. Pull both colors from the
existing style guide (`00 §1`); if the guide has no suitable second accent, ask.

### Entry point: pin-to-compare

This page is the **escape hatch from single-sector focus** (`00 §11.4`), and the
primary way a user arrives is by pinning sectors from the other altitudes rather
than by setting both pickers here. Consequences:

- Arriving with **one pin** pre-fills sector A and leaves B empty with a prompt
  to choose. Do not silently default B to anything.
- Arriving with **two pins** fills both and renders immediately.
- A **third pin attempt** does not silently evict A or B. Surface the choice
  (replace which one?) and treat repeated third-pin attempts as the signal to
  raise N-way comparison with the user — see the extensibility note below.
- Pins are part of cross-page state (`00 §7`) and survive altitude switches.

The pickers here are the same **pill row** control used everywhere else
(`00 §11.1`), one row per sector slot, tinted to that slot's assigned color.

## 2. Composite scores

A vertical list of **seven rows**, one per theme, in the same order as `01`. Each
row is a three-column grid:

- **Column 1** — theme name (`text.secondary`).
- **Column 2** — two **stacked horizontal bars**: sector A (accent) on top,
  sector B (secondary-accent) below, each filled to its composite score on a
  shared 0–100 scale. (Composite scores share one scale because they are all
  0–100 — see the metric-median caveat below for why raw metrics do not.)
- **Column 3** — the **gap callout**, right-aligned: the signed difference and
  which sector leads (e.g. "+9 SW", "even"). Emphasis (`text.primary` vs
  `text.secondary`) scales with the size of the gap so big divergences stand out.

## 3. Metric medians

Header: "Metric medians" + `text.muted` hint ("bar length = sector median · gap
called out").

A responsive **two-column grid of metric cards** (`surface.inset`). Each card:
- **Metric name** (`text.primary`, bold).
- **Two rows**, A then B, each: a mini-bar (A = accent, B = secondary-accent)
  with the **raw value** right-aligned at the end in the sector's color.

Recommended metrics (confirm with user; each carries `higherIsBetter`):

| Metric | Direction |
|--------|-----------|
| Net margin | higher better |
| Revenue growth YoY | higher better |
| R&D / revenue | higher better (context) |
| Net debt / EBITDA | **lower better** |
| FCF margin | higher better |
| Revenue / employee | higher better |

### Two scaling rules that must not be skipped

1. **Per-metric normalization, not a global axis.** Revenue-per-employee ($680k
   vs $410k) and net margin (18% vs 25%) cannot share one axis. **Each card
   normalizes bar length within its own metric's range**, and the true value is
   printed at the end of the bar. Do **not** put an absolute axis across all
   cards — it would make small-magnitude metrics vanish.

2. **Direction-inverted metrics must not read backwards.** For "lower is better"
   metrics (net debt/EBITDA), the shorter bar is the winner, which contradicts
   every other card where longer = better. **Flip the fill so the healthier
   sector always shows the fuller bar**, and keep the raw value visible so
   nothing is hidden. (Alternative if the user prefers: keep true-length bars and
   add a small "lower is better" marker on those cards. Default to the flip for
   scannability; confirm the choice with the user.)

---

## Interactions

- Change either sector picker → re-derive the whole page against the new pairing.
- Optionally allow clicking a theme row to open both sectors' drill-down of that
  theme side by side (confirm scope with user before building).

## Extensibility note

The layout is specified for **two** sectors. If the user later wants N-way
comparison, the paired-bar pattern does not scale past two or three cleanly —
raise this with the user rather than cramming more bars into a card.

## States

Per `00 §10`. If the two sectors have very different filing coverage for the
period, surface both coverage figures in the header so the comparison's
provisional nature is visible.
