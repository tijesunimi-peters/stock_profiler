# Architecture — v2 P3: Compare view

Stage 2 (Principal Architect). Task slug: `sector-v2-compare`. Input: `1-brief.md`. Reference:
`docs/design/sector-app-prototype-v2/prototype.dc.html` ~397–468 (altitude 3).

## Verdict: FRONTEND-ONLY, Track 1 — confirmed

Both additions render aggregates the Compare view **already fetches**: `state.themeScores` (from
`GET /v1/sectors/theme-scores`, loaded once in `init`) and `state.spreads[A]`/`state.spreads[B]` (from
`GET /sectors/{group}/spreads`, loaded by `ensureCompareData`/`ensureSpreads`). **No new endpoint, no
new state fetch, no backend, no schema/mapping change, no new dependency, no SEC-compliance surface.**
Owner for the entire task: **`senior-frontend-engineer`**. Backend stage: **N/A**.

Scope re-check: PASS. Sector-vs-sector axis unchanged; no market data; no Track-2; no winner/favorability
introduced. Guardrails 1–8 untouched (nothing reaches ingest/normalize/store/serve or DuckDB).

## Files to touch (all under `src/secfin/api/static/`)

- **`sectorapp.js`** — extend `renderCompareView` and its helpers only. New: a radar SVG builder, an IQR
  strip SVG builder, and the wiring of both into the existing Compare render path. No other view changes.
- **`sectorapp.css`** — new rules under the existing "Compare view (altitude 3)" block for the radar
  card, the "reading the shape" explainer, and the in-card IQR strip. Reuse `--pa-cmp` (A=`--accent`,
  B=`--pa-b`), `--rule`, `--bg-card`, `--bg-tint`, `--mono-muted`, `--shadow` — all already defined.

No `app.js` change (see R2). No test file needs a backend fixture; existing `pytest` suite stays green
(no server change). E2e = the Docker headless render check already exercised for P1/P2.

## Existing surface the engineer builds on (read these first)

- `renderCompareView` (`sectorapp.js:1226`) → `cmpHead` + `cmpSelectorsHtml` + `cmpThemesHtml` +
  `cmpMetricsHtml` + `wireCompareView`. **Insert the radar between `cmpThemesHtml` and `cmpMetricsHtml`;
  inject the IQR strip inside each card built by `cmpMetricsHtml`.**
- Theme data helpers already present: `themeEntry(group)` (:127), `scoredThemes(entry)` (:132),
  `themeOf(entry,key)` (:1222). The canonical theme order + composite are already computed in
  `cmpThemesHtml` (:1283) — **factor the order/entries out so the scorecard and the radar share one
  source** (AC-1 requires identical numbers/order). Recommend a small `cmpThemeModel(A,B)` returning
  `{ order, eA, eB, scoreFor(entry,themeKey) }` used by both.
- Spread data: `state.spreads[g].metrics[]` items carry `metric, label, unit, peer_count, min, p25,
  median, p75, max`. `cmpMetricsHtml` (:1361) already maps A/B by metric and computes the `order` union.
- Formatters: `metricFmt(metric,v)` (:64), `fmtSpreadVal(metric,v)` (:71); direction map `CO_DIR` (:813,
  `CO_DIR[m]===0` ⇒ lower-is-better). Widths: `P.measuredWidth(el, fallback)` (STYLE_GUIDE §6 — never
  hardcode px).
- A/B color: a wrapper with class `pa-cmp-idA`/`pa-cmp-idB` sets `--pa-cmp`; children read
  `var(--pa-cmp)`. The radar/IQR SVGs must pick up A vs B color the same way (pass the color in, or wrap
  each series' marks in an element carrying the id class).

## Resolved decisions

### R1 — not-scored theme on the radar → **skip-the-vertex, never plot 0**

Draw the **shared 7-axis frame** in the canonical theme order (same order as the scorecard). Each
sector's polygon is drawn as a **closed path through only the vertices for themes THAT sector scores**,
in angular order (chord across any axis it doesn't score). **Never** place a vertex at radius 0 for a
not-scored/deferred/absent theme — that would fabricate a "zero score" dent. Any axis unscored by
either sector gets a muted `not scored` label at its outer rim (no vertex, no fill reaching it for that
side). Degenerate cases: a sector scoring **< 3** themes can't form a polygon → plot its scored themes
as **dots** on their axes (no fill) with a caption note; **neither** sector scores anything → the radar
card renders an honest empty state (reuse the scorecard's "No composite theme scores for either sector"
copy), not a collapsed polygon. This satisfies AC-2 (no fabricated 0; empty state honest).

### R2 — radar helper location → **local SVG builder in `sectorapp.js`** (not a `ClearyFi` helper)

`ClearyFi.boxWhiskerChart`/`trendChart` depend on `window.Plot` and render full chart *cards*; a 7-axis
radar with precise not-scored handling is not a Plot idiom and is used by exactly one view. Add a
self-contained `cmpRadarSvg(model, opts)` in `sectorapp.js` returning an **inline SVG string** (the same
string-builder pattern the app already uses for sparklines/dot-plots), theme-aware via CSS variables
(stroke/fill from `var(--pa-cmp)`, grid from `var(--rule)`/`var(--border)`, labels
`var(--mono-muted)`), width from `P.measuredWidth`. **No `app.js` change, no new shared API, no Plot
dependency.** (If a second view ever needs a radar, promote it then — YAGNI now.) Satisfies AC-1/AC-8.

### R3 — per-metric IQR axis normalization → **combined [min,max] of both sectors, per card**

For each metric card, the A and B IQR strips share **one axis = [min(A.min,B.min), max(A.max,B.max)]**
for that metric (mirrors `boxWhiskerChart`'s honest true-extent domain). Each present side draws a band
`p25`→`p75` (fill `var(--pa-cmp)` at low opacity, thin stroke) with a **median tick** at `median`;
optional hairline whisker `min`→`max`. **No per-side independent scaling** (that would make the two
bands non-comparable), **no cross-metric shared axis** (each card is its own metric — the caption says
"normalized per metric"). Inverted metrics: **no flipped fill** — axis is value magnitude left→right;
direction is conveyed only by the existing **text** `lower is better` marker (AC-5). Guards: if a side
lacks a spread row or has null quartiles → **draw no band for that side** + an honest `no distribution`
marker, axis taken from the present side (AC-4); if `domHi==domLo` → pad by `|v|*0.5 || 1` so the strip
doesn't collapse. Satisfies AC-3/AC-4/AC-5.

## Implementation plan (ordered — one branch `sector-v2-compare` off `sector-v2-company`)

1. **Branch.** `git checkout sector-v2-company && git checkout -b sector-v2-compare`. Record in
   `_active.md`. (Stacked; do not branch off `master` — P3 builds on P0/P1/P2's `sectorapp.*`.)
2. **Refactor the theme model.** Extract `cmpThemeModel(A,B)` (canonical `order`, `eA`, `eB`, per-theme
   score accessor, composite) from `cmpThemesHtml`; leave the scorecard output byte-identical (pure
   refactor — verify the scorecard still renders the same rows). The radar consumes this model.
3. **Radar builder + card.** Add `cmpRadarSvg(model, {width})` per R1/R2. Add a `cmpRadarHtml(A,B)`
   wrapping it in the prototype's card (title "Composite profile" · "shape across 7 themes" + the
   "Reading the shape" explainer copy from prototype:447, verbatim-in-spirit: "Neither larger area means
   better — this is profile, not rank"). Insert it in `renderCompareView` **between** `cmpThemesHtml`
   and `cmpMetricsHtml`, only when both A and B are chosen. Mount/measure after inject (the SVG needs a
   measured width — follow the existing `mountDistribution`/`ensureExpanded` post-render mount pattern
   if width must be measured from the live node; otherwise a measured-at-build width is fine).
4. **IQR strip in the metric cards.** Add `cmpSpreadStripSvg(a, b, metric, {width})` per R3 and inject
   it inside each card in `cmpMetricsHtml`, **after** the two `line(...)` median bars, under a small
   caption "band = IQR · tick = median". Preserve the existing bars, raw values, `lower is better`
   marker, and N/A handling untouched.
5. **CSS.** Add the radar card + explainer + IQR-strip rules under the Compare block in `sectorapp.css`.
   Theme-aware (no hardcoded light-only colors), responsive (radar card and the `minmax(280px,1fr)`
   metric grid already reflow; verify the radar's two-col `minmax(0,300px) 1fr` collapses to one column
   under ~560px).
6. **Self-verify (frontend).** Docker e2e headless render check; eyeball screenshots at desktop + 390px,
   light + dark: populated A-vs-B radar, IQR strips on cards, a not-scored theme handled honestly (pick a
   pair where one sector defers a theme), a metric where one sector has no distribution. `pytest` green
   (unchanged backend). Then hand to QA.

## Acceptance criteria → concrete checks

| AC | Concrete check |
|---|---|
| **AC-1** Radar real & correct | Radar axes = canonical theme order from `cmpThemeModel`; each vertex radius = that sector's theme score / 100 × R; the plotted numbers equal the scorecard rows above (same order, same values). Built from `state.themeScores`, no re-fetch (grep: no new `P.api` call in the radar path). |
| **AC-2** Radar honesty | For a pair where a sector defers a theme: that sector has **no vertex at 0** on that axis (inspect path coords); axis shows a muted `not scored` label; explainer contains "neither larger area means better". Neither-scored pair → empty-state card, no polygon. No `--positive/--caution/--negative` / red-green in the radar. |
| **AC-3** IQR real | Each card's strip: A/B band left edge = `p25`, right edge = `p75` on the combined-extent axis; median tick x = `median`. Values traceable to `state.spreads[A|B]`. Caption "band = IQR · tick = median". |
| **AC-4** IQR honesty | A metric where one sector lacks a spread row (or null quartiles) → that side draws **no band** + `no distribution` marker; the other side still plots; no zero-width band at origin; N/A stays N/A (no 0). |
| **AC-5** No winner / no favorability | grep the Compare path for `--positive`/`--caution`/`--negative`/`good`/`better`/red-green: none in radar or IQR. `lower is better` stays the existing **text** chip; no flipped fill on inverted metrics. Gap chip wording unchanged ("A +N" / "even"). |
| **AC-6** Honesty rails | No N/A→0 anywhere (radar skip-vertex, IQR no-band); composite/gap still labeled derived/provisional (unchanged `pa-cmp-derived` / `pa-provisional`); no price/mcap/valuation strings introduced; header still "vs" sector-vs-sector. |
| **AC-7** Regression | Selectors, swatches, paired scorecard + gap chips + not-scored rows, metric cards + bars + raw values, pin-to-compare (Sector `paPin`), `?a=&b=` presets, empty states (pick A / pick B / neither scored / no shared metric) all still work; Sector/Company/Qualitative + `/sectors` still render (e2e). |
| **AC-8** Responsive / theme | At 390px: radar card single-column, metric grid single-column, no horizontal overflow (body never scrolls x). Light + dark both correct (SVG uses CSS vars, not fixed hex). Widths via `measuredWidth`, no hardcoded px. |
| **AC-9** Verify | `pytest` green; Docker e2e render check passes + eyeballed per step 6. **Interactive → operator hands-on manual UI verification before commit.** |

## Handoff → Senior Frontend Engineer

Implement steps 1–6 in `sectorapp.js` + `sectorapp.css` on branch `sector-v2-compare` (off
`sector-v2-company`). The two new builders (`cmpRadarSvg` per R1/R2, `cmpSpreadStripSvg` per R3) are the
core; everything else is wiring + CSS + a pure refactor (`cmpThemeModel`) to share the theme order with
the scorecard. Keep all shipped Compare behavior byte-stable except the two insertions. No backend, no
`app.js`, no new endpoint or dependency. Self-verify via Docker e2e + eyeball (desktop/390px,
light/dark) before handoff; QA runs the AC table above and drives the live flow.
