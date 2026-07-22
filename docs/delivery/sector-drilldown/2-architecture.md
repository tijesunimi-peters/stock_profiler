# Architecture — Peer strip · biggest-shifts · theme drill-down (Phase 3)

Stage 2 (Principal Architect). Designs against `1-brief.md`. **Frontend-only** (single stage).
Owner: `senior-frontend-engineer` (owns `static/` + the `scripts/` fixture/e2e edits). No
`src/secfin/` change. Branch **stacks on Phase 2 (`sector-scorecard`)**.

Scope re-check: **Track 1, in-architecture.** UI over shipped endpoints + client-side standardization
of already-fetched series. No new dependency, no request-path change. The Track-2 "what's moving"
feed and the threshold-alert layer are out (brief). All three surfaces read data **already in
`state`** — no new fetches beyond what Phases 1–2 already issue.

Data already in `state` (Phase 1–2): `state.themeScores` (all sectors' theme scores),
`state.series[group]` (DuPont FY points: `roe/net_margin/asset_turnover/equity_multiplier/
fiscal_year`), `state.lifecycle[group]` (FY points: `dio/dso/dpo/ccc/fiscal_year`),
`state.groupSpreads[group]` (per-sector box-whisker over `_SPREAD_METRICS`), `state.decompTheme`.

---

## Decisions resolved

### R1 — drill-down coverage (theme → distribution-backed constituents)
`/sectors/{group}/spreads` covers only `_SPREAD_METRICS` = {net_margin, roe, roa, asset_turnover,
revenue_growth_yoy, earnings_growth_yoy, current_ratio, quick_ratio, debt_to_equity,
interest_coverage}. Intersecting with each theme's constituents:

| Theme | Distribution-backed constituents | Coverage |
|-------|----------------------------------|----------|
| Profitability & returns | net_margin, roa, roe | 3 / 6 |
| Growth | revenue_growth_yoy, earnings_growth_yoy | 2 / 4 |
| Financial health | debt_to_equity, interest_coverage, current_ratio, quick_ratio | **4 / 4** |
| Cash & investment | — | **0 / 2 → honest empty** |
| Operating efficiency | asset_turnover | 1 / 6 |

The drill-down renders a box tile per **backed** constituent and states it explicitly ("Showing the
N of M constituents with a peer distribution"). A theme with **0 backed** (Cash & investment) shows
the honest empty ("No peer distribution for this theme's constituents yet — sparse coverage, not
zero. See the composite decomposition on the score for the full constituent set."). **Never a zero
box.** Broadening `_SPREAD_METRICS` is a separate backend/data task — out of scope.

### R2 — standardized YoY change (biggest-shifts)
For a metric's FY series `v[0..n]` (oldest→newest): changes `c[i] = v[i] − v[i−1]`. Require
**≥ 3 changes** (≥ 4 FY points). `z = (c_latest − mean(c)) / pstdev(c)`; if `pstdev(c) < 1e-9`
(degenerate — no historical variation) the metric is **omitted** (can't standardize). Candidates =
the 4 DuPont metrics + 4 lifecycle metrics; rank by **|z|**, take the **top 3–5** with `|z| ≥ 0.5`
(a floor so a flat metric isn't force-ranked). Each row shows the **raw latest change** (signed,
formatted per metric) as the headline + a `text.muted` basis "`+Nσ` vs its own history". If no metric
qualifies → honest empty band ("Not enough history to flag a standardized move yet.").

### R2b — display-only direction map (favorability), mirrors Phase 0 `METRIC_DIRECTION`
```
SHIFT_DIRECTION = {
  roe: true, net_margin: true, asset_turnover: true,     // higher is better
  dio: false, dso: false, dpo: false, ccc: false,        // lower is better
  equity_multiplier: null,                                // NEUTRAL (leverage -- no favorability color)
}
```
Favorable = `(change>0 && dir===true) || (change<0 && dir===false)`; unfavorable = opposite;
`dir===null` → neutral (no color, a `·`/flat glyph). Glyph = ▲ favorable / ▼ unfavorable / ▬ neutral.
Reuses the Phase 2 favorability tokens (`--positive/--caution/--negative`). This is a display-only
map keyed by metrics the API already returns (like `PERCENT_SPREAD`) — not re-derived server logic.

### R3 — tile double-affordance (body vs score)
The whole tile is a clickable **expand** region (sets `focusTheme` → peer strip + drill-down); the
inner **score `<button>`** opens the decomposition and **`stopPropagation()`s** so it doesn't also
expand. Legibility: the tile gets `cursor:pointer` + a hover lift + an `sc-focused` state (a
left/top accent ring) when it is the focused theme; the score keeps its own `:hover`/`focus-visible`.
A11y: the tile is `role="button"` `tabindex="0"` (Enter/Space expands); the score button stays a real
button. Deferred (not-yet-scored) tiles are **not** expandable (no focus affordance). A tile that is
both focused (drill-down) and score-open (decomposition) is allowed — they're independent panels.

### R4 — default + persistence of `focusTheme`
`state.focusTheme` defaults to the **first scored theme** of the selected sector (the first
`themes[]` entry with `scored:true`). It **persists across sector switch** (`00 §11.2`); on switch,
if the new sector **scores** `focusTheme`, keep it; else **fall back** to that sector's first scored
theme (best-effort preservation) so the peer strip/drill-down always have a valid subject. Cleared to
that default when theme scores load.

### R5 — fixture (`scripts/seed_fixture.py`)
Extend `_SPREAD_DEMO` so **group 73** has distributions for the metrics backing Profitability
(net_margin, roa, roe), Growth (revenue_growth_yoy, earnings_growth_yoy) and Financial health
(debt_to_equity, interest_coverage, current_ratio, quick_ratio) → a **populated** drill-down.
**Cash & investment** needs no seeding — its constituents aren't in `_SPREAD_METRICS`, so its
drill-down is inherently the **honest-empty** case. The DuPont + lifecycle 5-year series already
cover the shifts band. (Group 73's theme scores + constituents are already seeded in Phase 2.)

---

## Layout — `static/sectors.html`

New mounts between `#scorecard` and `#aggregation`:
```
#masthead → #sectorbar → #scorecard → #peerstrip → #shifts → #drilldown → #aggregation → #view → #disclosure
```
`#view` (DuPont tree + trend + kept per-sector spreads + lifecycle) is unchanged, below.

## `static/sectors.js` — additions (all reading cached state)

- `state.focusTheme` (R4). Set default in `renderScorecard()` once `themeScores` loads; preserve/
  fall back in `selectSector()`.
- **Tile expand:** `scoreTile` gains `role="button"`/`tabindex`/`data-focus-theme` + an `sc-focused`
  class when `theme===focusTheme`; a tile-level click/keydown handler sets `focusTheme` and calls
  `renderPeerStrip()` + `renderDrilldown()`. The score `<button>` handler adds `e.stopPropagation()`.
- `renderPeerStrip()` — mount `#peerstrip`. From `state.themeScores.sectors`, collect
  `{group, group_label, score, selected}` for sectors whose `focusTheme` entry is `scored:true`
  (omit others). Sort by score desc. Render a row of thin bars (height ∝ score/100), selected =
  `accent`, others neutral (`border-strong`/muted), each with a `title` (label + score). Caption:
  "`<theme_label>` · N sectors · FY`<year>`". **No navigation handler.** Honest empty if <2 sectors
  score it.
- `renderShifts()` — mount `#shifts`. Compute standardized changes (R2) over `state.series[group]`
  (roe/net_margin/asset_turnover/equity_multiplier) + `state.lifecycle[group]` (dio/dso/dpo/ccc);
  top 3–5 by |z|. Rows: metric label + signed raw change (formatted) + favorability color/glyph
  (R2b) + `+Nσ vs its own history`. Header "Biggest shifts" + basis hint. Idempotent: reads whatever
  of series/lifecycle is cached; **also invoked** from the series fetch `.then` (in `renderBody`) and
  the lifecycle fetch `.then` (in `paintLifecycle`) so it fills in as data arrives; loading skeleton
  until at least the DuPont series is present; honest empty if nothing qualifies.
- `renderDrilldown()` — mount `#drilldown`. Constituents of `focusTheme` = the theme-scores entry's
  `constituents[].metric` for `state.group` (if the sector scores it). Intersect with the metrics
  present in `state.groupSpreads[group].metrics`; render a `boxWhiskerChart` per match (reuse the
  `drawDetailSpreads` box rendering) + a "showing N of M constituents with a distribution" caption;
  honest empty (R1 copy) if no match or the sector doesn't score `focusTheme`. Idempotent; **also
  invoked** from the `paintDetailSpreads` fetch `.then`. Header names the focused theme.
- Wire `renderPeerStrip()`/`renderShifts()`/`renderDrilldown()` into `render()` and `selectSector()`
  (after `renderScorecard()`), and into the three fetch `.then`s above so they fill in incrementally.

Metric formatting for shifts: reuse the Phase 2 `metricFmt` (percent/days/×) + `P.fmt`. Metric
labels: reuse `state.groupSpreads`/theme constituent labels where available, else a small label map.

## `static/sectors.css` — additions
`.peerstrip` (row of bars + caption), `.ps-bar`/`.ps-bar.sel`; `.shifts` band + `.shift-row`
(name/delta/glyph, favorability via the Phase 2 tokens); `.drilldown` panel + reuse `.detail-spreads`
box styling; `.sc-tile` gets `cursor:pointer` + hover + `.sc-focused` ring; mobile reflow for all
three (bars shrink, shift rows stack, drill-down boxes full-width).

## Files to touch (all frontend / harness)
`static/sectors.html` (3 mounts); `static/sectors.js` (peer strip + shifts + drill-down + focusTheme
+ tile-body handler); `static/sectors.css`; `scripts/seed_fixture.py` (`_SPREAD_DEMO` group-73
metrics); `scripts/headless_check.js` (shots). Update `docs/REDESIGN_SECTOR_OVERVIEW.md` Phase 3
status. **No `src/secfin/` change.**

e2e shots: existing `sectors` (73) now shows scorecard + peer strip + shifts + default-focused
(Profitability) drill-down. **Add:** `sectors-drilldown-fh` (`/sectors?group=73`, click the Financial
health tile body → populated 4-box drill-down + peer strip on financial_health) and
`sectors-drilldown-empty` (`/sectors?group=73`, click Cash & investment tile body → honest-empty
drill-down).

---

## AC → concrete check

| AC | Check |
|----|-------|
| AC-1 | e2e/drive: `#peerstrip` renders bars for the focused theme; selected sector bar uses `accent` (computed style); caption "… · N sectors · FY2025". |
| AC-2 | Drive: click a peer-strip bar → selected sector unchanged (no nav handler). |
| AC-3 | Drive: a sector that doesn't score the focused theme has **no** bar (bar count == #sectors scoring it). |
| AC-4 | Drive: `#shifts` has 3–5 rows, each name + signed change + glyph + "±Nσ" basis. |
| AC-5 | Drive: a `+dso`/`+ccc` shift is `negative` (unfavorable); a `+roe` is `positive`; `equity_multiplier` row (if present) has **no** favorability color. |
| AC-6 | Unit-ish: a metric with <3 changes or zero-variance is absent from `#shifts`; force a short series (fixture) → still ≥0 rows, no fabricated shift; empty band renders its honest copy. |
| AC-7 | e2e `sectors-drilldown-fh`: click Financial health tile body → 4 box tiles + peer strip re-points to financial_health. |
| AC-8 | e2e `sectors-drilldown-empty`: Cash & investment → honest empty drill-down (copy present, no boxes); Profitability → 3 boxes (roic/gross/operating omitted, never zero). |
| AC-9 | Drive: clicking the **score** opens the decomposition and does **not** change `focusTheme` (stopPropagation); clicking the tile body expands without opening the decomposition. |
| AC-10 | Drive: the "Metric spread across <sector>" panel still exists in `#view` (kept). |
| AC-11 | Drive: focus Financial health, switch sector (73→60) → still Financial health focused (banks score it); focus Operating efficiency, switch to banks (which omit it) → falls back to banks' first scored theme (documented best-effort). |
| AC-12 | Drive: fresh load `/sectors` → `focusTheme` = first scored tile (Profitability); peer strip + drill-down reflect it. |
| AC-13 | Grep rendered page: no zeros for omitted bars/metrics/boxes; no "buy"/"sell"/alpha; peer strip + shifts carry basis text; favorability color only on shift rows + score band (Phase 2). |
| AC-14 | DOM order: `#scorecard` → `#peerstrip` → `#shifts` → `#drilldown` → `#aggregation` → `#view`. |
| AC-15 | Drive at 390px: peer strip / shifts / drill-down reflow, no clipped labels, `scrollWidth==clientWidth`. |
| AC-16 | `docker compose build api` → e2e PASS (errors=0), shots eyeballed; `pytest` green; fixture yields a populated FH drill-down + empty C&I drill-down. |

---

## Handoff → `senior-frontend-engineer`

Continue the branch chain (new branch `sector-drilldown` **off `sector-scorecard`**). **Invoke
`/frontend-design:frontend-design` first** for the peer-strip bar treatment + the tile double-
affordance legibility (R3), within the ClearyFi system + the Phase 2 favorability tokens. Order:
(1) `sectors.html` mounts; (2) `sectors.js` `focusTheme` + tile-body handler + `renderPeerStrip` +
`renderShifts` (standardization + direction map) + `renderDrilldown` + wire into `render`/
`selectSector`/the three fetch `.then`s; (3) `sectors.css`; (4) `seed_fixture.py` `_SPREAD_DEMO`
group-73 metrics; (5) `headless_check.js` shots; (6) docs. Self-verify: `pytest` green, then
`docker compose build api` + e2e, and **eyeball** the shots (peer strip, shifts, FH drill-down,
empty C&I drill-down, focus-persist across a sector switch, mobile).
