# 3 — Implementation

**Task slug:** `sector-box-whisker-spreads` · **Branch:** `sector-box-whisker-spreads` (off `master`)

---

## §3a — Backend (senior-backend-engineer) — COMPLETE, verified on hydrated data

### Mid-stage operator decision (coverage gap → broadened metric set)
Self-verifying the batch on the **hydrated volume** exposed a data reality the brief's "~80% built,
just run the batch" premise didn't anticipate: the four liquidity/solvency metrics are **near-empty
market-wide**. The ingest has the *headline* concepts broadly (`Assets` 8,665 ciks, `StockholdersEquity`
8,295, `NetIncomeLoss` 8,295) but the *granular* ones only for tens (`AssetsCurrent` 68,
`LiabilitiesCurrent` 67, `LongTermDebt` 34, `InterestExpense` 49, `OperatingIncomeLoss` 64). After
running the batch, FY2025 qualifying-sector coverage was: `current_ratio` 1, `quick_ratio` 1,
`interest_coverage` 1, **`debt_to_equity` 0** — versus `net_margin` 63, `roa` 61, `asset_turnover`
61, `roe` 60. AAPL computes `current_ratio` fine, so this is an upstream data-coverage gap, **not**
a metric bug.

**Operator chose (AskUserQuestion): "Broaden metric set."** Keep the box-whisker endpoints + charts
exactly as designed, but drive them from a **spread set** = broadly-covered fundamentals (populated
today) **plus** the liquidity/solvency ratios (offered, rendering honest empty states that light up
as coverage improves). The roadmap #3 "liquidity/solvency" intent is preserved as the second family;
the surface is useful now.

### What changed
- **`api/routes.py`**
  - `_SPREAD_METRICS = _SPREAD_METRICS_PROFITABILITY + _SPREAD_METRICS_LIQUIDITY_SOLVENCY`
    - profitability/efficiency (broad coverage): `net_margin, roe, roa, asset_turnover,
      revenue_growth_yoy, earnings_growth_yoy`
    - liquidity/solvency (coverage-limited): `current_ratio, quick_ratio, debt_to_equity,
      interest_coverage`
  - `_SPREAD_CAVEATS = _PEER_CAVEATS + [box-is-a-spread-not-a-verdict, coverage-limited-note]`
    (reuses the peer vocabulary verbatim per AC-6; **does not** mutate `_PEER_CAVEATS`).
  - **`GET /v1/sectors/spreads`** — cross-sector: all qualifying SIC groups' five-number summary
    for one metric+period. Validates `metric ∈ _SPREAD_METRICS` (else **404**). `year` defaults to
    the metric's latest materialized FY. Declared **before** `/sectors/{group}` (route-ordering; a
    regression test guards it). Returns `SectorSpreadList` with `_SPREAD_CAVEATS`.
  - **`GET /v1/sectors/{group}/spreads`** — per-sector: a box per offered metric for one group+
    period; a metric below min size / N/A is **absent, never a 0 box**. Returns `SectorSpreadProfile`
    with `_SPREAD_CAVEATS`. Metrics returned in offered order (profitability first).
- **`normalize/schema.py`** — `SectorSpread`, `SectorSpreadList`, `MetricSpread`,
  `SectorSpreadProfile` (five-number fields; `peer_count` on every box for transparency, AC-9).
- **`storage/metric_distribution_repository.py`** (+ SQLite impl) — three new reads on the existing
  interface (**no raw SQL in the API**, guardrail 5): `list_for_metric(metric,year,period)`,
  `list_for_group(group,year,period)`, `latest_fy_year(metric)`. The point `get()` is unchanged.
- **No** new metric / table / concept → **no `mapping.py` / `DATA_MODEL.md` change** (guardrail 3
  N/A). DuckDB batch (`analytical/peer_distribution.py`) unchanged and **still batch-only**
  (guardrail 6/7); the endpoints read the operational SQLite table cache-aside.

### JSON contract for the frontend
- `GET /v1/sectors/spreads?metric=<m>&year=<y>&period=FY`
  → `{ metric, label, unit, fiscal_year, fiscal_period, peer_basis, caveats[], spreads:[
      { group, group_label, peer_count, min, p25, median, p75, max } ] }`
  Empty `spreads` = honest empty (expected for the coverage-limited metrics). 404 if metric not in
  the offered set.
- `GET /v1/sectors/{group}/spreads?year=<y>&period=FY`
  → `{ group, group_label, fiscal_year, fiscal_period, peer_basis, caveats[], metrics:[
      { metric, label, unit, peer_count, min, p25, median, p75, max } ] }`
  A metric with no qualifying box is **omitted** (never a 0 box); empty `metrics` = honest empty.
- The offered metric list + its two families is a **UI concern** — the frontend hardcodes the
  selector (like `sectors.js`'s `COLS`); group them by category ("Profitability & efficiency" /
  "Liquidity & solvency"), and let a metric's empty payload carry the coverage message (do **not**
  hardcode a "coverage-limited" label that goes stale as coverage improves).

### Verification (evidence)
- `docker compose --profile test run --rm test` → **473 passed, 6 skipped** (was 467; +6 in
  `tests/test_sector_spreads.py`: repo reads, cross-sector incl. metric validation + qualifying-only,
  **route-ordering regression**, per-sector absent-metric-never-0, honest empties).
- `ruff check --select E,F,I,UP` clean on the changed files (the one remaining E501 is pre-existing
  `schema.py:215`; B008 on the endpoints is the established FastAPI `Depends()` idiom, pervasive on
  `master` — 89 pre-existing in routes.py).
- **Ran the batch on a scratch copy of the 7.2G hydrated backup**
  (`data/spread_verify.db`; `python -m secfin.analytical.peer_distribution`, analytical extra) →
  4,380 distribution rows in ~2s. Drove the real endpoints (TestClient over the ASGI app) against
  it: `net_margin` 63 boxes, `roe` 60, `asset_turnover` 61 (populated); `current_ratio` 1,
  `debt_to_equity` 0 (honest sparse/empty); `roe` now 200 (offered), `gross_margin`/bogus → 404;
  per-sector 73 → 8 metrics present, debt_to_equity/interest_coverage honestly omitted; `caveats`
  count 6.

### ⚠️ Handoff notes for the Senior Frontend Engineer (same branch)
1. **Extreme real-world tails (architecture decision 3 — now confirmed live).** `net_margin` on
   real data has genuine outliers (e.g. Depository Institutions box: `min −134.76`, `max 20.83`,
   `median 1.589`). A naive shared x-domain will flatten most boxes to invisibility. Default to the
   true `[min,max]` (honest), but be ready to **clip the drawn extent with an explicit "N sectors'
   whiskers extend beyond the axis" caption + out-of-range arrows** — **never clip the reported
   five-number values.** This is essential for the cross-sector chart to be readable.
2. **Selector = both families.** Offer all `_SPREAD_METRICS`; group them "Profitability & efficiency"
   (populated) and "Liquidity & solvency" (may be empty today). Default selection to a covered
   metric (e.g. `net_margin`) so the page lands populated.
3. **Pass the grid's resolved year** on the cross-sector fetch (`state.data.fiscal_year`) so the
   page is internally consistent; the sparse newest year is thereby avoided.
4. **Per-sector small-multiple**: metrics have incompatible scales → one mini box per metric with
   its own x-domain (do NOT share one axis across metrics).
5. **Seed for offline e2e**: add `_seed_metric_distributions(db_path)` to `scripts/seed_fixture.py`
   (direct SQLite write like `_seed_sector_dupont`) covering the demo SIC groups (35/60/28/73/52) ×
   at least `net_margin` + a couple LS metrics × FY2025, and deliberately omit one (group,metric)
   to exercise the omit-never-0 path. Add a `headless_check.js` entry (e.g.
   `["sectors-spreads", "/sectors?metric=net_margin"]`).
6. **Honesty**: `caveats` rendered verbatim in a disclosure; N/A → `—`/empty/omitted box, never 0;
   ordering captioned "descriptive, not a ranking of quality"; no alpha/price claim.

### Scratch artifact to clean up at end of delivery
`data/spread_verify.db` (7.2G, root-owned scratch copy of the hydrated backup) — remove via a
container (`docker compose run --rm test rm /app/data/spread_verify.db`) before wrap-up. Not
committed (`data/` is gitignored).

---

## §3b — Frontend (senior-frontend-engineer) — COMPLETE, e2e verified + screenshots eyeballed

Design direction (via `/frontend-design`): the box-whisker is a **precision instrument native to
the sector page** — hairline whiskers, a filled IQR box in a single neutral accent (no good/bad
color; a spread is position, not a verdict), a bold median tick, mono numerics. Honesty is the
signature: extreme tails get an explicit out-of-range marker + caption, never clipped data.

### What changed (all in `src/secfin/api/static/` + 2 scripts)
- **`app.js`** — new shared builder `boxWhiskerChart(boxes, opts)` (exported on `window.ClearyFi`).
  Horizontal boxes on a shared x-axis; `Plot.ruleY` whisker + `Plot.barX` IQR (accent, clipped) +
  `Plot.tickX` median. Reuses `plotTokens`/`cssVar`/`chartCard`/`unitFmt`/`PERCENT_METRICS`.
  **Honest tail-clipping**: view = true `[min,max]` unless whiskers dwarf the IQR core (`domSpan >
  4×coreSpan`), then clip the DRAWN extent to core±pad, mark spilled rows `▸/◂`, and caption
  "…nothing is clipped from the data" — the reported min/max stay in the row + tooltip. Long SIC
  names truncated for the y-tick (full name in the `Sector` tooltip channel). Empty `boxes` →
  empty state, never a zero box.
- **`sectors.js`** — (1) cross-sector section (new `#spreads` mount): a grouped metric selector
  ("Profitability & efficiency" populated / "Liquidity & solvency" coverage-limited), default
  `net_margin`, `?metric=` deep-link honored; fetches `/v1/sectors/spreads?metric=&year=<grid
  year>`, caches per metric, paints `boxWhiskerChart`; renders the returned `caveats` in a "How to
  read these spreads" disclosure; honest empty state when no sector qualifies. (2) Per-sector
  panel appended in `paintDetail`: fetches `/v1/sectors/{group}/spreads`, renders a small-multiple
  (one mini box per offered metric, own axis — scales differ) with a mono min/median/max readout;
  a metric with no box is omitted (never 0); loads lazily, skips silently on failure.
- **`sectors.html`** — added `<div id="spreads">` mount (vendored d3+Plot already present).
- **`sectors.css`** — spread section header/lede, grouped `.segmented` picker, per-sector panel.
- **`scripts/seed_fixture.py`** — `_seed_metric_distributions()` (direct SQLite write, like
  `_seed_sector_dupont`): demo SIC groups × `net_margin`/`roe`/`current_ratio`/`debt_to_equity` +
  a long-tailed `interest_coverage` (extreme maxima → exercises clipping). Group `28` deliberately
  has no L/S rows → per-sector omit path.
- **`scripts/headless_check.js`** — 3 new checks: `sectors-spreads` (debt_to_equity cross-sector),
  `sectors-spreads-clip` (interest_coverage → clipping), `sectors-spreads-empty` (quick_ratio →
  empty state). Existing `sectors` (default net_margin) + `sectors-expanded` (per-sector panel).

### Verification (evidence)
- `docker compose build api` then `docker compose --profile e2e up --exit-code-from e2e` →
  **all 22 pages errors=0**, incl. `sectors`, `sectors-expanded`, `sectors-spreads`,
  `sectors-spreads-clip`, `sectors-spreads-empty`. `pytest` still **473 passed, 6 skipped**.
- **Screenshots eyeballed** (`data/e2e-shots/`):
  - `sectors.png` — grid + cross-sector `net_margin` boxes ordered by median, %-axis, grouped
    selector, caption + 6-note disclosure. (Fixed a y-label left-clip mid-verify: bumped
    `marginLeft` to 204 + truncate at 28 chars; labels now fully legible.)
  - `sectors-expanded.png` — group 60 detail: DuPont tree + trend (D1, intact) **+** the new
    per-sector small-multiple (net margin / ROE / current ratio / debt-to-equity, each own axis +
    "N companies · min · median · max" readout).
  - `sectors-spreads-clip.png` — `interest_coverage`: boxes readable, `▸` out-of-range markers,
    caption "3 sectors reach beyond the axis … nothing is clipped from the data."
  - `sectors-spreads-empty.png` — `quick_ratio`: honest empty state "… it is not zero."
- Theme: the static app is single-theme (no `prefers-color-scheme`/`data-theme` anywhere); the
  builder uses only theme tokens (`accent`/`ink`/`inkSoft`/`trackBorder`/`bg-card`), same as
  `sectorDupontTrend`, so it follows the shell if a theme is ever added.

### For QA to probe
- Honesty: empty≠0 (`sectors-spreads-empty`), omit-never-0 in the per-sector panel (group 28 in
  seed has no L/S metrics), clip caption + `▸` (`sectors-spreads-clip`), ordering caption
  ("descriptive, not a ranking of quality"), no alpha/price copy.
- The `?metric=` deep-link + selector state; the per-sector panel loading on expand.
- On REAL data the L/S metrics are near-empty (operator-accepted) — the profitability metrics
  carry the populated view; verify against the hydrated volume (`data/spread_verify.db`) or a fresh
  batch run.
