# Brief — Compare view prototype-fidelity pass

Stage 1 (Product Manager). Task slug: `compare-fidelity`.
Governing directive: `docs/delivery/sector-app-followups.md`. Reference: prototype altitude-3 block
(`prototype.dc.html` lines ~302–360). **Frontend-only.** Third fidelity iteration (Sector `10cf5ba`,
Company `36aaa30`/`33c68da` done); **Compare view only** (Qualitative comes last).

## Problem / user

The Compare view works and is honest, but its layout differs from the prototype (generic section head,
stacked A/B bar lines, card styling). The operator wants it to **match the prototype's layout**.
**Compare has no synthetic elements** — it's all real (theme scores + metric medians) — so, unlike
Sector/Company, there is **nothing to placeholder** here; this is a pure layout-fidelity refactor.
Success: the Compare view reads column-for-column like the prototype while keeping every honesty
property it already has.

## Scope gate (Track 1 / honesty)

**PASS.** Frontend-only layout change; no data, no backend, no fabrication. All existing honesty
properties (no favorability color, no winner, true-length bars, "lower is better" text marker, N/A
cells, categorical A/B identity) are **preserved**.

## Scope (Compare view only)

1. **Header (prototype).** Replace the "01 Sector compare" section head with the prototype's A/B
   header row: **`[accent swatch] A-name   vs   [blue swatch] B-name   …   counts`** — names from the
   selected sectors, a **counts** string on the right from real `peer_count` (e.g. "59 vs 44 filers").
   Border-bottom 2px ink.
2. **Keep the dropdown selectors** (operator decision) below the header — A `--accent` / B `--pa-b`
   identity chips retained; changing either still recomputes. (Not the prototype's pill rows.)
3. **Composite-scores card (prototype).** Wrap the theme rows in a card ("**Composite scores · shared
   0–100 scale**" mono label, `--bg-card` + shadow). Each row → the prototype's **`grid-template-columns:
   170px 1fr 84px`**: **theme name (left) · paired A/B true-length bars (middle) · signed gap label
   (right)**. Keep the derived composite row + the "not scored" rows.
4. **Metric-median cards (prototype).** "Metric medians" heading + caption; the cards grid →
   **`repeat(auto-fit, minmax(280px, 1fr))`** on **`--bg-tint`**; each card = metric name + "lower is
   better" marker (when inverted) + paired A/B normalized bars with the raw value at the bar end.
5. **Footer caption** — keep the "true-length; no winner; identity only" note.

## Out of scope (this iteration)

- **Qualitative** view (next iteration); Sector/Company (done).
- Any **backend/endpoint/schema** change; any new data.
- The prototype's **pill selectors** (operator kept the dropdowns).
- Adding **favorability color** or a winner (both stay out).

## Acceptance criteria (what QA will verify)

- AC-1 The header shows **A-name + accent swatch · "vs" · B-name + blue swatch · a real counts
  string** (from `peer_count`); the generic "Sector compare" section head is gone.
- AC-2 The **dropdown selectors are kept** and still recompute the whole view on change (A `--accent`,
  B `--pa-b`).
- AC-3 The composite rows use the **`170px 1fr 84px`** grid (name · bars · gap) inside a "Composite
  scores · shared 0–100 scale" card; the derived composite row + "not scored" rows remain.
- AC-4 The metric-median cards grid is **`minmax(280px,1fr)` auto-fit** on `--bg-tint`; the
  "lower is better" marker + N/A cells + raw values remain.
- AC-5 **Honesty preserved:** no favorability color (A/B categorical identity only), **no winner**,
  **true-length** bars, signed gap = ink weight, "lower is better" a text marker, N/A never 0.
- AC-6 **Platform:** CSP-safe; **mobile 390px** no overflow (cards + rows stack); `pytest` green
  (no backend); Docker e2e passes + eyeballed.
- AC-7 **No regression:** Sector/Company/Qualitative + `/sectors` still render; pin-to-compare +
  `?a=&b=` presets still work.

## Risks / open decisions (for the architect)

- **R1 — counts string.** Build it from the sectors' `peer_count` (e.g. "59 vs 44 filers"); if a
  sector's count is unknown, show "—" (never fabricate).
- **R2 — composite row restructure.** Move from the current stacked `rowhead + A line + B line` to the
  `name · [A bar / B bar] · gap` 3-column grid; keep `cmpBar` for the two bars inside the middle cell;
  keep the gap label's ink-weight emphasis (`|gap|≥10` full ink), **not** color.
- **R3 — mobile.** At ≤560px the `170px 1fr 84px` grid must reflow (name/gap wrap, bars full-width)
  with no overflow.

## Handoff → Principal Architect

Frontend-only. Resolve R1–R3; name the exact `sectorapp.js`/`sectorapp.css` changes (`renderCompareView`,
`cmpHead`→A/B header, `cmpThemesHtml`/`cmpScoreRow` grid, `cmpMetricsHtml`/`.pa-cmp-cards` styling);
map every AC to a concrete check; confirm no backend and no honesty regression. Owner:
`senior-frontend-engineer`, branch off `master`.
