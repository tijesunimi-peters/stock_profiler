# Architecture — v2 P2: Company view

Stage 2 (Principal Architect). Task slug: `sector-v2-company`. **Verdict: FRONTEND-ONLY** —
`sectorapp.js` + `sectorapp.css` + `scripts/headless_check.js`. **No backend / no schema / no new
endpoint.** Branch off `master`, stacked on `sector-v2`. Owner: **`senior-frontend-engineer`**.
Reference: brief `1-brief.md`; v2 prototype altitude 2 (`prototype.dc.html` ~276–393).

## Scope re-check (architect)

Track 1, buildable, no drift. The only "real" addition (sparklines + 8-quarter trend) consumes an
**already-served** endpoint (`GET /companies/{symbol}/metrics/{metric}/history`); the segment/geo and
filing blocks are **honest placeholders** (no endpoint / Track-2). No CIK/unit/provenance concern (read
path only). No SEC-compliance, DuckDB, or single-process impact. Confirmed frontend-only.

## Data flow

- **Sparkline + trend (REAL):** `GET /companies/{cik}/metrics/{metric}/history?frequency=quarterly` →
  `MetricHistory { points:[{period_end, value, status}], signals, unit, metric }`. `points` are
  oldest-first; na/nm carry `value: null` (gap points — the endpoint never interpolates or zero-fills).
  The client slices the **trailing ≤8 quarters** for both the row sparkline and the expand panel.
- Everything else on the view already flows from `/companies/{symbol}/peers` (rail + composite + context
  pill) and `/sectors/{group}/{metric}/companies` (dot-clouds) — unchanged.

## Reused `window.ClearyFi.*` helpers (both exported, both return HTML strings, both honesty-safe)

- **`P.sparkline(points)`** — `points: [{value, status}]`; draws a self-scaling polyline, **breaks at
  na/nm gaps (never interpolates)**, dots the last point, and **returns `""` when < 2 numeric points**
  (no fake trend). Used in each dot-plot row header. Emits `<svg class="spark">` with **no inline
  stroke** → `.spark` is styled in app.css, which this page does NOT load → **must be styled locally**
  in `sectorapp.css` (same gotcha as `.plot-chart-title` in P1).
- **`P.trendChart(history)`** — `history: {points, signals, unit, metric}`; renders the full trend SVG +
  caption, with a built-in **honest empty state** ("Not enough history to chart") when < 2 comparable
  points. Used in the click-to-expand panel. Emits `.trend-chart`/`.trend-plot`/`.trend-svg`/
  `.trend-yaxis`/`.trend-xaxis`/`.trend-caption`/`.trend-signal*`/`.trend-empty` — **all app.css →
  style the ones we render locally** in `sectorapp.css`.

## Plan — `static/sectorapp.js`

- **State:** add `coHistory: {}` (`"cik|metric"` → `MetricHistory`, cache-aside) and `coTrendOpen: {}`
  (`metric` → bool, the per-metric expand state; **reset on focal change** so an open trend doesn't
  carry to a different filer). Reset `coTrendOpen = {}` in `selectFocal`, `selectFocalCik`,
  `clearFocalToDefault`.
- **`ensureCompanyHistory(cik)`** (new, mirrors `ensureCompanyData`): for each `CO_METRICS` metric, if
  `state.coHistory[cik+"|"+m]` unset, `P.api("/companies/"+cik+"/metrics/"+m+"/history?frequency=quarterly")`
  → cache → re-render when the focal still matches. On failure, cache `{points:[]}` (honest — no
  sparkline, never a fake line). Call it wherever the focal is set (`selectFocal` `.then`,
  `selectFocalCik` `.then`, `resolveDefaultFocal`, and on Company-view entry in `setView`).
- **`dpRowHtml(metric, g)` header (line ~1024):** to the right of the metric name (+ the existing
  "lower is better" text marker), add a **header-right cluster**: `P.sparkline(trailing8)` +
  `trendLabel(hist)` + the focal's value (moved/duplicated from `dpFocalHtml` into the header per the
  prototype). The sparkline element is a **button** (`.pa-dp-spark[data-metric]`) — clicking toggles the
  trend. If history isn't loaded yet or `sparkline()` returns `""` → render an honest `no trend yet`
  affordance (never a flat line). Keep the focal **diamond on the track** as-is (the accent marker).
- **Trend expand panel:** when `state.coTrendOpen[metric]`, append below the plot+caption a
  `.pa-dp-trend` box: a "Trailing 8-quarter trend" label + `P.trendChart(sliced)` + a caption. `sliced`
  = a history object with `points` sliced to the **trailing ≤8** and **`signals: []`** (so the window
  and the signals can't disagree; keeps the panel minimal like the prototype). trendChart's own empty
  state covers < 2 points.
- **`trendLabel(hist)`** (new, resolves **R3**): a **neutral** descriptor — a mono glyph (`↑`/`↓`/`→`
  from the sign of last−first present value over the trailing window) + `"{n}q"` (e.g. `↑ 8q`). **No
  color, no verdict.** < 2 present points → `"no trend yet"`.
- **Header context pill (resolves R2):** the existing `pa-co-ctx` becomes the **real** pill —
  `"{peer_count} peers · SIC {group}"` from `state.focalPeers`/`state.focalGroup` (real). The
  **sub-industry stays the F6 placeholder** and is NOT rendered as a fabricated name inside the pill.
  Keep the breadcrumb (crumb › name · ticker) + the `FY{year}` filing-basis line.
- **Two placeholder cards** appended at the end of `pa-co-main` (after the dot-plots + afford line):
  - **`segGeoPlaceholderHtml()`** — the prototype's "Segment & geographic mix" card: header + a 2-col
    ("By segment" / "By region") shape with an **honest placeholder body** ("ASC 280 segment/geographic
    revenue isn't ingested yet — to be defined; no figures shown"). **No fabricated segment/region/%/bar.**
  - **`filingHistoryPlaceholderHtml()`** — the "Filing history & flags" card: header (+ a single
    placeholder flag chip slot, labeled placeholder) + the prototype's form/desc/date row **shape** with
    an honest placeholder body ("Per-CIK filing history isn't served yet — to be defined; no filings
    shown"). **No fabricated filing/form/date/flag.**
- **`wireCompanyView`:** wire `.pa-dp-spark[data-metric]` clicks → toggle `state.coTrendOpen[m]` +
  `renderApp()`; keep the existing dot-refocus, focal-select, and back-button handlers.

## Plan — `static/sectorapp.css`

- **`.spark`** (local): `width`/`height` (~108×26), `fill:none; stroke: var(--ink-soft); stroke-width:1.5;
  overflow:visible`; the last-point `circle` fill `var(--accent)` (the one accent). Neutral — no
  favorability color.
- **`.trend-*`** (local, only the classes trendChart emits): port from app.css adapted to the paper
  tokens — `.trend-chart`, `.trend-plot`, `.trend-svg` (stroke `--ink-soft`, fill none), `.trend-yaxis`/
  `.trend-xaxis` (mono, muted), `.trend-caption` (mono 10px muted), `.trend-empty` (muted). If signals
  aren't rendered (we pass `signals:[]`), `.trend-signal*` can be skipped.
- **`.pa-dp-head`**: make it a space-between row (name-cluster left · sparkline+label+value right); wrap
  gracefully at narrow widths.
- **`.pa-dp-trend`**: the expand box — `bg-tint`, `--border-tint`, radius, padding; the label mono
  uppercase muted; caption mono muted.
- **Placeholder cards**: reuse `.pa-card`/`.pa-ph`/`.pa-ph-body` from P1; the seg/geo 2-col grid stacks
  ≤560; the filing rows use the prototype's `64px 1fr 96px`-style grid (placeholder body, no real rows).
- **Mobile ≤900/≤560**: `.pa-co-body` already stacks (rail static); the `.pa-dp-head` cluster wraps; the
  seg/geo 2-col + filing grid collapse to 1-col; no horizontal overflow.

## `scripts/headless_check.js`

- Existing `sectorapp-company` / `sectorapp-company-default` / `sectorapp-company-refocus` now also show
  the row sparklines + the two placeholder cards (fixture already seeds `metric_values` history? — if
  the seeded fixture lacks multi-quarter history, sparklines honestly render `"no trend yet"`, which is a
  valid state to capture; **the engineer seeds ≥2 quarters of history for the focal's metrics in
  `seed_fixture.py`** so at least one populated sparkline + an expanded trend are captured).
- **Add `sectorapp-company-trend`**: on the populated Company view, click a metric's `.pa-dp-spark` and
  capture the expanded 8-quarter trend panel.

## Acceptance criteria → concrete checks

| AC | Check |
|----|-------|
| AC-1 | Each populated dp row header shows `P.sparkline` for the focal (trailing ≤8q) + a neutral trend label; no history → "no trend yet", never a flat/zero line. |
| AC-2 | na/nm periods are gaps in the sparkline + trend (helper breaks at gaps; `value:null` never 0); short series not padded; expand caption states the window + gap exclusion. |
| AC-3 | Clicking `.pa-dp-spark[data-metric]` toggles the per-metric `.pa-dp-trend` (trendChart on trailing-8 slice); fetch cached in `coHistory`; failure → trendChart empty state, plots intact. |
| AC-4 | `.pa-co segment/geo` card renders the 2-col shape with a placeholder body; grep: no fabricated segment/region/%/bar; ASC-280 not-ingested label present. |
| AC-5 | Filing-history card renders the form/desc/date shape + flag slot as placeholder; grep: no fabricated filing/form/date/flag; "to be defined" present. |
| AC-6 | Header: breadcrumb (crumb › name · ticker) + real context pill (`N peers · SIC g`) + `FY{year}` basis; no fabricated sub-industry name. |
| AC-7 | `sectorapp.css`/`js` have **no** `--positive`/`--caution`/`--negative` in the Company view; sparkline/trend neutral (stroke `--ink-soft`, dot `--accent`); "lower is better" stays text; F4 chip color absent from Company. |
| AC-8 | N/A never 0 (dp cells + sparkline gaps); composite/rail stay labeled derived; placeholders unmistakable; no price/mcap. |
| AC-9 | F1 default focal, F2 breadcrumb dropdown, dot-refocus, `focalCik` persistence (Company→Sector→Company), honest empty / no-peer-group / dead-end-recovery states all still work; Sector/Compare/Qual + `/sectors` render. |
| AC-10 | `pytest` green (no backend); e2e passes + eyeballed (`sectorapp-company` sparklines + 2 cards, `sectorapp-company-trend` expanded, mobile 390px no overflow). Interactive → operator manual UI verification. |

## Handoff → Senior Frontend Engineer

Frontend-only, branch off `master` stacked on `sector-v2`. Build per the plan above: the per-metric
sparkline + click-to-expand trend (reuse `P.sparkline`/`P.trendChart`; slice trailing 8; honest gaps;
**style `.spark` + `.trend-*` locally** — app.css isn't loaded), the two honest placeholder cards, and
the real header context pill; preserve all shipped Company behaviors. Seed ≥2 quarters of history for the
focal in `seed_fixture.py`. NO favorability color (except the F4 Sector chip, which must not appear
here). Verify: `pytest` green, `docker compose build api` → e2e, eyeball `sectorapp-company*` +
`sectorapp-company-trend` + mobile, confirm the other views + `/sectors`. **Interactive → QA verdict
"PASS — pending operator manual UI verification."**
