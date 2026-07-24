# Implementation — v2 P3: Compare view

Stage 3 (Senior Frontend Engineer). Task slug: `sector-v2-compare`. Branch: `sector-v2-compare`
(off `sector-v2-company` / master head `fe3b122`). Frontend-only. Input: `2-architecture.md`.

## What shipped

The `/sector-analytics` Compare view (altitude 3, sector-vs-sector) gains the two v2-prototype
additions, both **Track-1 REAL** from data the view already fetches — no backend, no new endpoint, no
new dependency:

1. **Composite profile radar** — a 7-axis heptagonal radar (one axis per composite theme, shared
   0–100 scale) with **A and B polygons overlaid** in categorical identity color only. Sits in its own
   card between the theme scorecard and the metric-median cards, with the prototype's "Reading the
   shape" explainer ("Neither larger area means 'better' — this is profile, not rank").
2. **Overlaid per-metric IQR strip** — inside each metric-median card, under the median bars, an
   overlaid A/B spread strip (band = p25–p75, tick = median) on one axis normalized to the combined
   `[min, max]` of both sectors for that metric.

## Design decisions (as-built)

- **A/B identity carried by a non-color channel too** (STYLE_GUIDE §7 — never color alone): **A = solid
  stroke / filled vertices; B = dashed stroke / hollow vertices**, reused across both the radar and the
  IQR strip. Colors stay categorical (`--pa-cmp`: A=`--accent`, B=`--pa-b`) — no favorability tokens.
- **Radar frame** is a concentric heptagon web (rings in `--rule`, spokes in `--border`); the **50-ring
  is emphasized** (`--border-strong`, dashed) with a "50 avg" tick to reinforce "position vs peers, 50 =
  average — not a rank."
- **R1 (not-scored theme) → skip-the-vertex, never 0.** Each sector's polygon is drawn through only the
  vertices for themes THAT sector scores (chording across any gap). An axis unscored by **both** sectors
  gets a muted `· n/s` label and no vertex. A sector with **< 3** scored themes degrades to dots (no
  polygon); neither-scored → the radar card is omitted (scorecard already carries the honest empty state).
- **R2 (helper location) → local SVG builder in `sectorapp.js`** (`cmpRadarSvg`), not a `ClearyFi`
  helper. Rationale: `boxWhiskerChart`/`trendChart` are `window.Plot`-based full cards; a 7-axis radar
  with precise not-scored handling is one-view-only and not a Plot idiom. Self-contained inline SVG
  string, theme-aware via CSS vars, `viewBox`-responsive (no `app.js` change, no Plot dependency).
- **R3 (IQR axis) → combined [min,max] of both sectors, per card.** A/B share one axis so their bands
  are comparable within the card; each present side draws band `p25→p75` + median tick + a faint
  `min→max` whisker. **No per-side scaling, no cross-metric axis, no flipped fill for inverted metrics**
  (direction stays the existing text `lower is better` chip). Degenerate extent padded.

## Surfaces touched (2 files, frontend only)

- **`src/secfin/api/static/sectorapp.js`**
  - `cmpThemeModel(A, B)` — **pure refactor** extracting the canonical theme order + per-theme scored
    accessor (`null`, never 0, for deferred/absent) + derived composite out of `cmpThemesHtml`, so the
    radar's axes/numbers match the scorecard exactly. `cmpThemesHtml` rewired to consume it (output
    unchanged).
  - `cmpRadarSvg(model)` + `cmpRadarHtml(A, B)` + `cmpTruncLabel(s)` — the radar (new).
  - `cmpSpreadStripHtml(a, b)` — the overlaid IQR strip (new); injected into each card in
    `cmpMetricsHtml` after the two median bar lines.
  - `renderCompareView` — inserts `cmpRadarHtml(A, B)` between `cmpThemesHtml` and `cmpMetricsHtml`
    (only when both A and B are chosen; all shipped gating/empty states unchanged).
- **`src/secfin/api/static/sectorapp.css`** — new rules under the Compare block: `.pa-cmp-radar-*`
  (card/head/read/explainer), `.pa-radar*` (rings/spokes/poly/vtx/labels), `.pa-iqr*`
  (wrap/row/lab/band/med/whisk/none/cap), and a `@media (max-width: 620px)` that stacks the radar card.

No backend, no `app.js`, no new endpoint/state fetch, no dependency. `renderCompanyView`, the history
fetching, and all other views untouched.

## How I verified

- **Docker e2e headless render check** (`docker compose --profile e2e up …`). All five Compare pages
  render **`errors=0`**: `sectorapp-compare` (a=73&b=60, both scored → full radar + IQR),
  `sectorapp-compare-nab` (a=73 only → pick-B empty state, no radar), `sectorapp-compare-na`
  (a=73&b=28 → `B no distribution` on ROA/rev-growth/earnings-growth), `sectorapp-compare-pin` (pin→pick
  flow). Eyeballed `sectorapp-compare.png`: radar with A(solid)/B(dashed) polygons; Accounting quality
  & Structure & activity axes correctly `· n/s` with no vertex (both unscored); Operating efficiency has
  an A-only vertex (A=38, B not scored); "Reading the shape" copy present; IQR strips + `band = IQR ·
  tick = median` on every card; Debt-to-Equity keeps the text `LOWER IS BETTER` chip (no flipped fill);
  scorecard/gap-chips/pin all intact.
- **390px mobile** (one-off Puppeteer capture): **no horizontal overflow** (`scrollWidth == clientWidth
  == 390`), `errors: 0`; radar card stacks (radar above, explainer below), metric cards single-column.
- **Light-only app.** `style.css` defines no `prefers-color-scheme`/dark tokens — the "paper terminal"
  is a single warm theme, so AC-8's "dark" is inapplicable. All new SVG uses `var()` tokens exclusively
  (no hardcoded hex), so it is theme-agnostic if a dark theme is ever added.
- **`node --check`** on `sectorapp.js` passes; every CSS token used is defined.
- **pytest:** no Python touched → suite unaffected (P2 baseline: 511 passed, 6 skipped). QA to re-run.

## ⚠︎ Pre-existing baseline note for QA (NOT this task)

The overall e2e run currently reports **HEADLESS CHECK: FAIL** — but the failures are **only** on the
**Company view** P2 cases (`sectorapp-company`, `-refocus`, `symbol=900001`): the async metric-history
fetches now return **502 Bad Gateway** (8 and 13 errors), because `900001`'s history is a cache-miss
that hits the network-less SEC path in the e2e env (P2's QA run happened to get 200/0-points). **I
reproduced the identical failure on the clean base with my changes stashed** — so it is a pre-existing
Company-view/environment baseline issue, independent of P3, and out of this task's scope. **Every
Compare page is `errors=0`.** Flagging so QA/operator can decide whether to address the P2 502 case
separately (e.g. seed `900001` history, or exempt it) — I did not touch unrelated P2 code to "fix" it.

## Handoff → QA Tester

Verify against `1-brief.md`'s AC table (mapped to checks in `2-architecture.md`). Probe: the radar's
not-scored axes (pick a pair where one/both sectors defer a theme — never a 0 vertex), the IQR `no
distribution` case (`a=73&b=28`), no favorability color anywhere (radar + IQR categorical only; the
`lower is better` chip stays text), the scorecard/gap-chips/pin/`?a=&b=`/empty-state regressions, and
390px reflow. **Interactive view → the operator hands-on manual UI verification gate applies** before
commit. Note the pre-existing Company-view 502 baseline above when reading the e2e exit code — it is not
a P3 regression.
