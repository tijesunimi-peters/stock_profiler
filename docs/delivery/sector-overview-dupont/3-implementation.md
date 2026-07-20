# 3 — Implementation: Sector Overview + DuPont

**Branch:** `sector-overview-dupont` (off `master`) · **Stage:** Senior Engineer (3 of 4)

---

## §3a — Backend (DONE, self-verified) — `senior-backend-engineer`

### What shipped

**normalize**
- `normalize/metrics.py`: new metric **`equity_multiplier`** = `avg(total_assets)/avg(stockholders_equity)`
  (both averaged, so the per-company DuPont identity closes on the existing bases), `na` when equity
  absent/≈0, `approximate` when an average falls back to period-end. Registered as the 27th metric.
  New extractor **`dupont_components(facts, cik, year, period) -> DupontComponents | None`** — the four
  DuPont dollar inputs on the metric-engine bases (reuses `_Ctx`/`ttm`/`avg`, no logic dup); returns
  `None` unless all four legs present + no degenerate denominator (shared-membership).
- `normalize/sic.py`: `SIC2_MAJOR_GROUP_NAMES` + `sic2_label(code)` — static, public-domain SIC-2
  major-group titles; unknown code → bare code (honest fallback).

**storage** (two repos, mirroring `metric_rank_repository`)
- `dupont_component_repository.py` + `sqlite_…`: table `dupont_components` (per-company staging; write
  + housekeeping only — DuckDB reads it directly).
- `sector_dupont_repository.py` + `sqlite_…`: table `sector_dupont` (the aggregate). Serving reads:
  `list_for_period(year, period)` (grid, ordered by roe desc), `get_series(group)` (**FY-only**,
  oldest first — quarterly aggregates are sparse and would double-count), `latest_fy_year()`
  (**latest *well-covered* FY**, not raw MAX — skips a barely-filed newest year).

**ingest / analytical** (the batch pipeline — offline, never the request path)
- `ingest/dupont_backfill.py` (Python, no network): per-company `dupont_components` → `dupont_components`
  table. Mirrors `metrics_backfill.py`. `python -m secfin.ingest.dupont_backfill [--limit N]`.
- `analytical/sector_dupont.py` (DuckDB `ATTACH … (TYPE sqlite)`): sums the components per
  `(SIC-2, fiscal_year, fiscal_period)`, `HAVING count>=min_size`, ratios **from the sums** (identity
  by construction), writes back via the SQLite repo. Pure `aggregate_row(...)` factored out for unit
  testing without DuckDB. `python -m secfin.analytical.sector_dupont`. **DuckDB import lives ONLY
  here (lazy)** — nowhere in `api/`.

**api**
- `schema.py`: `SectorDupont`, `SectorList`, `SectorSeries` (+ shared `_SECTOR_AGGREGATION` label).
- `routes.py`: `_SECTOR_CAVEATS` (6, reusing the `_PEER_CAVEATS` vocabulary), `get_sector_dupont_repo`
  provider, and two public endpoints (see contract). Cache-aside point reads only.
- `main.py`: `app.state.sector_dupont_repo` wired in the lifespan (+ closed); `GET /sectors` serves the
  page (added in §3b).

**docs**: `ROADMAP_METRICS.md` (equity_multiplier row), `DATA_MODEL.md` (equity_multiplier in the metric
table + a "DuPont & sector aggregates" subsection). No `mapping.py` change (no new concept).

### JSON contract (what the frontend consumes)

**`GET /v1/sectors?year=<int?>&period=<FY|Q1..Q4>`** → `SectorList`
```jsonc
{
  "fiscal_year": 2025,                 // defaults to latest WELL-COVERED FY (skips barely-filed year)
  "fiscal_period": "FY",
  "peer_basis": "SIC 2-digit",
  "aggregation": "asset-weighted sector aggregate (…) -- not a median",  // show verbatim
  "caveats": [ "…", … ],               // 6 strings; render all
  "sectors": [
    { "group": "35", "group_label": "Industrial & Commercial Machinery & Computer Equipment",
      "fiscal_year": 2025, "fiscal_period": "FY", "period_end": "2025-12-31", "peer_count": 42,
      "net_margin": 0.12, "asset_turnover": 0.83, "equity_multiplier": 2.4, "roe": 0.238,
      "sum_net_income": …, "sum_revenue": …, "sum_avg_assets": …, "sum_avg_equity": … }
  ]  // ordered by roe desc; [] is a valid honest result (render empty state, NOT zeros)
}
```
`roe == net_margin * asset_turnover * equity_multiplier` holds to machine epsilon.

**`GET /v1/sectors/{group}`** → `SectorSeries` (group is the 2-digit code, e.g. `35`)
```jsonc
{ "group": "35", "group_label": "…", "peer_basis": "SIC 2-digit",
  "aggregation": "…not a median", "caveats": [ … ],
  "points": [ { …SectorDupont…, "fiscal_year": 2021 }, … ] }  // FY-only, OLDEST FIRST; [] = honest empty
```

### Frontend notes discovered during verification (real 8.7K-company data)
- **Grid default** already handled server-side (FY2025, 59 sectors on the current backup). Don't
  re-implement "latest year" in JS — just call `/v1/sectors` with no `year`.
- **Trend = the FY `points` only.** `get_series` already returns FY-only, oldest→newest. Plot ROE
  (and optionally the three drivers). The **1Y / 5Y / All** toggle filters this FY series by a
  trailing window (1Y ≈ the latest 1–2 annual points — thin is honest, gaps render as gaps, NEVER 0).
- **Extreme aggregates are real and honest.** A sector with near-zero/negative aggregate equity
  (e.g. SIC 52 Building Materials — Home Depot's buyback deficit) shows ROE ~282% and a huge
  `equity_multiplier`. Caveat #6 explains it. **Surface `equity_multiplier` prominently in the tree
  and grid** so the extreme ROE is visibly leverage-driven, not read as profitability. Consider not
  leading the page copy with the raw #1-by-ROE without the decomposition beside it.

### How verified
- `pytest` in Docker: **467 passed, 6 skipped** (15 new in `tests/test_sector_dupont.py`).
- Ruff: new files/tests clean (E/F/I/UP/B); the 5 endpoint `B008` are the FastAPI `Depends/Query`
  idiom — identical to the 89 pre-existing instances repo-wide (accepted pattern), not new.
- **Full pipeline on the hydrated backup** (copied `secfin-latest.db`, `.[analytical]`):
  `dupont_backfill` → 31,248 component rows; `sector_dupont` → 560 rows.
  - **Per-sector identity holds to ≤1.1e-16** (roe vs product of drivers) across top rows.
  - Banks (SIC 60) `equity_multiplier` 10.9–11.4× (correct bank leverage); series [2021,2022,2024,2025].
  - Live endpoints driven: `/v1/sectors` 200 (FY2025, 59 sectors, 6 caveats, label present);
    `/v1/sectors/60` 200 (Depository Institutions, 4 FY points); `/v1/sectors/99` 200 empty (honest);
    `/v1/sectors?year=2026` 200 (12 sparse sectors — the barely-filed year, reachable explicitly).
  - Temp 7.2G verify DB removed.

**→ Frontend (§3b) continues on this branch.**

---

## §3b — Frontend (DONE, self-verified) — `senior-frontend-engineer`

### What shipped
- **`static/sectors.html`** — app-shell page (`data-shell="sectors"`), loads vendored `d3.min.js` +
  `plot.umd.min.js` (the trend needs `window.Plot`), plus `app.js` / `sectors.js`.
- **`static/sectors.js`** — the page controller:
  - Fetches `GET /v1/sectors` → renders a **sortable overview grid** (Sector, Companies, ROE, Net
    margin, Asset turnover, Equity multiplier; default ROE desc; click any header to re-sort).
  - Row click / Enter / Space **expands** a sector → lazy-fetches `GET /v1/sectors/{group}` and
    paints the **DuPont identity tree** (the signature) + the **ROE trend**.
  - Honesty banner (`aggregation` label + "not a ranking of quality"), the 6 caveats in a
    disclosure, both **verbatim** from the API. A missing value → "—", never 0. Empty grid /
    empty series → explicit empty states.
  - `?group=<2-digit>&range=<1y|5y|all>` deep-links an expanded sector (drives the e2e).
- **`static/app.js`** — new shared builder **`sectorDupontTrend(points, opts)`** (exported on
  `window.ClearyFi`): a single ROE line over the FY series, `y` as %, gap-aware (a null year
  BREAKS the line — never interpolated, never 0). ROE-only by design (drivers are on different
  scales; the tree carries them). Pages don't call `Plot.plot` directly — this is the builder.
- **`static/sectors.css`** — grid + DuPont tree + trend controls; token-driven (theme-aware by
  construction, no hardcoded colors bar white-on-accent badge text). Table scrolls on narrow
  screens (`overflow-x`); the tree stacks at ≤560px.
- **`script.js`** — new sidebar group **"Overview → Sectors"** (`/sectors`); the operator's
  "Home" menu. Marketing `/` index untouched.
- **`scripts/seed_fixture.py`** — `_seed_sector_dupont` writes demo `sector_dupont` rows **directly**
  via the SQLite repo (mirrors the existing `_seed_peer_ranks`), built with `aggregate_row` so the
  identity holds — lets the offline e2e (base install, no DuckDB) render the grid + tree + trend.
  5 sectors × 2021-2025 (chemicals skips 2023 → exercises the trend gap-break).
- **`scripts/headless_check.js`** — added `sectors` (grid) and `sectors-expanded`
  (`?group=60&range=5y` → tree + trend) pages.
- Backend copy aligned to the Σ/× glyphs (`_SECTOR_AGGREGATION`, `_SECTOR_CAVEATS[0]`) so the
  banner reads "ΣNI/ΣRev × ΣRev/ΣAssets × ΣAssets/ΣEquity", not spelled-out "Sigma".

### How verified
- `docker compose build api` → `docker compose --profile e2e up …`: **all pages errors=0**,
  including `sectors` and `sectors-expanded`.
- **Eyeballed both screenshots** (`data/e2e-shots/sectors.png`, `sectors-expanded.png`):
  - Grid: sidebar "Sectors" current; masthead "Fiscal year 2025 · SIC 2-digit · 5 sectors";
    aggregation banner + 6-note disclosure; ROE-desc sort; banks read 0.06× turnover / 11.00×
    leverage.
  - Expanded (Depository Institutions): DuPont tree **15.4% = 23.3% × 0.06× × 11.00×** with the
    `=`/`×` operators, ROE box accented, plain-English leg descriptions, "aggregated over 44
    companies · not a median" meta; **1Y / 5Y / All** toggle; ROE trend line FY2021→2025.
  - Banner Σ/× glyphs render cleanly.
- Bug caught + fixed during verify: `sectors.html` initially omitted the vendored Plot/d3, so the
  trend threw inside the fetch `.then` and surfaced as the (console-error-free) "Couldn't load
  this sector's detail" state — added the two vendor `<script>`s.
- `pytest` still **467 passed, 6 skipped**; ruff introduces no new violations (the one `schema.py`
  E501 is a pre-existing `BalanceMatrixSegment` line; endpoint `B008` = the repo-wide FastAPI idiom).

### What QA should probe
- **Dark theme**: page is token-driven; spot-check the grid + tree + banner render legibly in dark
  (the e2e default is light).
- **N/A ≠ 0**: an empty grid (`?year=1999`) and an empty series (`/sectors/99`) must show empty
  states, not zeros; a trend coverage-gap year must break the line, not plot 0.
- **Extreme aggregates**: on real data SIC 52 shows ~282% ROE (near-zero aggregate equity) — the
  tree's huge equity multiplier should make it read as leverage-driven; caveat #6 explains it.
- **Sort + expand** across columns; **overflow** on a narrow viewport (table scroll, tree stack).
- Copy contains **no alpha/price/timing** claim.

**→ QA Tester.**
