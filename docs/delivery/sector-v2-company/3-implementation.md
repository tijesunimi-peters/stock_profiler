# Implementation — v2 P2: Company view

Stage 3 (Senior Frontend Engineer). Task slug: `sector-v2-company`. Branch: `sector-v2-company` (off
`sector-v2`). **Frontend-only** — `sectorapp.js` + `sectorapp.css` + `scripts/seed_fixture.py` +
`scripts/headless_check.js`. No backend.

## What changed & why

### Sparklines + click-to-expand 8-quarter trend (REAL)
- **State:** `coHistory` (`"cik|metric"` → `MetricHistory`, cache-aside) + `coTrendOpen` (`metric` →
  bool, per-metric expand; **reset on every focal change** in `selectFocal`/`selectFocalCik`/
  `clearFocalToDefault`).
- **`ensureCompanyHistory(cik)`** (new): fetches `/companies/{cik}/metrics/{metric}/history?frequency=quarterly`
  for each `CO_METRICS`, cache-aside; marks in-flight then overwrites on arrival; a failure keeps an
  empty series → honest "no trend yet", never a fabricated line. Called from `renderCompanyView`.
- **`coDotPlotHtml` header** restructured into a left name-cluster + a right cluster
  (`.pa-dp-headright`): `coSparkHtml(metric)` + the existing focal value/percentile. `coSparkHtml` uses
  `P.sparkline(trailing8)` — returns `""` for < 2 comparable points → renders `no trend yet`; otherwise
  a `.pa-dp-spark[data-metric]` **button** (sparkline + `coTrendLabel`).
- **`coTrendLabel(pts)`** (resolves **R3**): a **neutral** descriptor — glyph (`↑`/`↓`/`→` from
  first-vs-last comparable value) + `"{n}q"`. No color, no verdict.
- **`coTrendPanelHtml(metric)`**: when `coTrendOpen[metric]`, renders `.pa-dp-trend` = a label +
  `P.trendChart(sliced)` where `sliced` = trailing-≤8 points + `signals:[]` (carries `unit`/`metric`/
  `restatement_basis`/`frequency` so the caption is correct). trendChart's own empty state covers < 2
  points. Honest gaps (na/nm `value:null`) preserved by both helpers.
- **`wireCompanyView`:** `.pa-dp-spark` click → toggle `coTrendOpen[m]` + `renderApp`.

### Two honest placeholder cards
- **`segGeoPlaceholderHtml()`** — "Segment & geographic mix" (ASC 280), the prototype's 2-col
  by-segment / by-region shape with an honest placeholder body + note. No fabricated segment/region/%/bar.
- **`filingHistoryPlaceholderHtml()`** — "Filing history & flags" with a `flags — placeholder` chip and
  an honest body (per-CIK filing history not served; flags Track-2). No fabricated filing/date/flag.
- Both appended at the end of `.pa-co-main`; the afford line now also mentions "Click a sparkline to
  open its trailing 8-quarter trend."

### Header context pill (R2)
Already real in the shipped code — `"{peer_count} peers · SIC {group}"` from `state.focalPeers`/
`focalGroup`; preserved. Sub-industry stays the F6 placeholder (not a fabricated name).

### CSS (`sectorapp.css`)
- **`.spark` + `.trend-*` styled locally** (app.css isn't loaded — same gotcha as `.plot-chart-title`
  in P1): neutral `--ink-soft` line, single `--accent` last-point dot. `.pa-dp-spark` button (hover
  bg-badge, focus-visible outline). `.pa-dp-trend` inset panel. `.pa-dp-head` → space-between with
  `.pa-dp-namewrap` / `.pa-dp-headright`. The two placeholder cards (`.pa-sg`/`.pa-fh`, dashed) + the
  seg/geo 2-col grid (stacks ≤560). **No favorability color** — verified: `--positive`/`--negative`
  appear only in `.pa-tile-delta.pos/.neg` (the Sector F4 chip), never in the Company view.

### Fixture (`seed_fixture.py`)
Added AAPL (320193 — has REAL companyfacts history; its real SIC 3571 shares the "35" group) to the
Company-view dot-cloud group as an 11th filer — **`metric_values` only, not `metric_ranks`** (so the
company-hub peer ranks from `_seed_peer_ranks` aren't clobbered). This gives `?symbol=320193` a populated
dot-cloud **and** real trailing sparklines/trend, while the synthetic `900001` stays the honest
"no trend yet" case in the same view.

### e2e (`headless_check.js`)
Added **`sectorapp-company-trend`** (`?symbol=320193`): waits for the sparklines, clicks one, captures
the expanded trend panel.

## How verified

- `pytest`: **511 passed, 6 skipped** (no backend change).
- e2e: `docker compose build api` → **HEADLESS CHECK PASS** (exit 0, every page `errors=0`). Eyeballed:
  - `sectorapp-company-trend.png` — AAPL: real sparklines (`↑ 8q`/`↓ 8q`), Net Margin's trend expanded
    (2024→2026, As-restated · quarterly), real "11 peers · SIC 35" pill, both placeholder cards.
  - `sectorapp-company.png` — synthetic 900001: every row honest "no trend yet"; dots + placeholders
    intact.

## For QA to probe

- Populated sparkline (`?symbol=320193`) vs honest "no trend yet" (`?symbol=900001`); na/nm as gaps,
  never 0; short series not padded.
- Click a sparkline → the correct metric's trend panel toggles; switching focal collapses open trends.
- Both placeholders unmistakable, no fabricated data; context pill real.
- No favorability color in Company (sparkline/trend neutral, `lower is better` text); F4 chip absent here.
- F1/F2/F3 + dot-refocus + `focalCik` persistence + honest empty / no-peer-group / dead-end states;
  Sector/Compare/Qual + `/sectors` still render.
- Mobile 390px: header/`.pa-dp-headright` wrap, seg/geo stacks, no overflow.
- **INTERACTIVE → operator hands-on manual UI verification** before commit.
