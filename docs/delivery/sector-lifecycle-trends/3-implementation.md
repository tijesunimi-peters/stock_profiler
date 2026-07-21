# 3 — Implementation (Backend): Sector Asset-Lifecycle Trends

**Task slug:** `sector-lifecycle-trends`  ·  **Branch:** `sector-lifecycle-trends` (off `master`)
**Stage:** 3 — Senior Backend Engineer → hands off to Senior Frontend Engineer (same branch)
**Date:** 2026-07-21

## What shipped (backend, B1–B9)

### Metrics — `normalize/metrics.py`
- **`_dio`** (Days Inventory Outstanding) and **`_dpo`** (Days Payable Outstanding): exact clones of
  `_dso` — `avg(inventory|accounts_payable) / cost_of_revenue × 365`, `days` unit, TTM basis,
  `approximate` (reason `_INEXACT_AVG_REASON`) on a period-end-balance fallback, `na` on missing
  input or zero COGS (value `None`, never 0).
- **`_ccc`** (Cash Conversion Cycle): composes `_dio`/`_dso`/`_dpo` → `dio + dso − dpo`. **N/A
  propagates** — any leg `value is None` ⇒ `na` (never leg-as-0). `approximate` if any leg is.
  Can be negative (verified: SIC 73 services CCC = −4.9).
- Registered `dio`, `dpo`, `ccc` in `_METRICS` (adjacent to `dso`). `METRIC_LABELS`/`METRIC_UNITS`
  auto-harvest them.
- **`LifecycleComponents` + `lifecycle_components()`**: clone of `DupontComponents`/`dupont_components`;
  five dollar legs (avg inventory/payables/receivables, TTM cost_of_revenue/revenue). Returns None
  unless **all five** present + denominators non-degenerate (all-legs shared membership → aggregate
  CCC is exact).
- **No new raw/canonical concept** — all inputs already in `mapping.py` (guardrail 3 N/A to the tag map).

### Storage (new tables + repos)
- `lifecycle_component_repository.py` + `sqlite_lifecycle_component_repository.py` — table
  `lifecycle_components`, PK `(cik, fy, fp)` (per-company staging; write + housekeeping only).
- `sector_lifecycle_repository.py` + `sqlite_sector_lifecycle_repository.py` — table
  `sector_lifecycle`, PK `(peer_group, fy, fp)`, index on `peer_group`; `get_series()` FY-only,
  oldest first. Carries the 5 `sum_*` columns + `approx_count` for auditability.

### Ingest + analytical (batch/offline — never live)
- `ingest/lifecycle_backfill.py` — pure/no-network; reads `raw_facts`, writes `lifecycle_components`
  (only all-5-legs rows). Clone of `dupont_backfill.py`.
- `analytical/sector_lifecycle.py` — DuckDB `ATTACH (TYPE sqlite)` groups `lifecycle_components ⋈
  company_profiles` by SIC prefix + period, `HAVING count(*) >= min_size`; `aggregate_row` computes
  `dio=Σinv/Σcogs×365`, `dpo=Σap/Σcogs×365`, `dso=Σar/Σrev×365`, `ccc=dio+dso−dpo`, carries
  `approx_count`. `duckdb` imported lazily (base install/API never needs it). Clone of
  `sector_dupont.py`.

### Serve
- `normalize/schema.py`: `SectorLifecyclePoint` + `SectorLifecycleSeries` (aggregation label
  `_LIFECYCLE_AGGREGATION`, `approximate: bool` per point).
- `api/routes.py`: `get_sector_lifecycle_repo`, `_sector_lifecycle_model` (sets
  `approximate = approx_count > 0`), `_LIFECYCLE_CAVEATS` (7 caveats, **no alpha/timing/edge**),
  and **`GET /v1/sectors/{group}/lifecycle`** → `SectorLifecycleSeries` (cache-aside from
  `sector_lifecycle`; docstring states DuckDB batch is the sole producer). No DuckDB import on the
  route.
- `api/main.py`: wired `app.state.sector_lifecycle_repo` (startup + shutdown close).

### Docs
- `docs/DATA_MODEL.md`: dio/dpo/ccc rows in the metric table + new "Asset-lifecycle metrics & sector
  trend" section (formulas, `days` unit, `approximate` flag, CCC N/A-propagation, the ratio-of-sums
  aggregate, all-5-legs membership).
- `docs/ROADMAP_METRICS.md`: dio/dpo/ccc added to the Efficiency table.
- `docs/ROADMAP_SECTOR_ANALYTICS.md`: Deliverable #5 marked **SHIPPED**.

## The JSON contract for the frontend
`GET /v1/sectors/{group}/lifecycle` → `SectorLifecycleSeries`:
```
{
  "group": "28", "group_label": "Chemicals & Allied Products",
  "peer_basis": "SIC 2-digit",
  "aggregation": "aggregate days-metrics -- Σinventory/Σcost_of_revenue × 365 (DIO), ... not a median",
  "caveats": [ ...7 strings... ],
  "points": [
    { "group","group_label","fiscal_year","fiscal_period":"FY","period_end","peer_count",
      "approximate": bool,          // true if any contributing company used a period-end balance
      "dio": float, "dpo": float, "dso": float, "ccc": float }   // ccc == dio + dso − dpo
    ...  // FY-only, OLDEST FIRST; a missing fiscal year is ABSENT (break the line, never 0/interpolate)
  ]
}
```
Empty `points` = honest empty (group below min size for all-5-legs, or not materialized). All four
of dio/dpo/dso/ccc are always present on a point (all-5-legs membership) — there is no per-leg null.

## How I verified (Docker; host has no pip/venv)
- **`pytest` (full suite):** `docker compose --profile test run --rm test` → **489 passed, 6
  skipped** (up from 473; +16 in new `tests/test_sector_lifecycle.py` covering dio/dpo ok/approx/na,
  CCC identity + N/A-propagation + approximate, `lifecycle_components` all-legs, `aggregate_row`
  ratio-of-sums + identity + degenerate guard + approx_count, repo FY-only series, endpoint
  read/empty, and a no-alpha-language guard). No regressions from the 3 new registry metrics.
- **Real-data batch (scratch re-ingested copy `data/granular_scratch/granular_verify.db`, 54G):**
  - `lifecycle_backfill` → **16,892 CIKs, 76,037 component rows**.
  - `sector_lifecycle` (DuckDB) → **1,910 rows**, 0 errors.
- **AC-14 parity:** **44–46 distinct sectors per FY** (FY2020–2024), up from the near-zero
  pre-backfill state. dio/dpo/dso/ccc are **all present wherever the aggregate exists** (parity by
  construction — one all-5-legs company set). 0 rows with any null leg. Identity holds on every
  sampled row; **negative CCC renders honestly** (SIC 73 = −4.9). `approx_count` populated (5–19/sector).
  - **Note on "~60":** the brief's ~60 was the `net_margin` (headline-concept) breadth. Lifecycle
    requires inventory + payables, so non-inventory sectors (banks/insurers/utilities/holdings)
    correctly drop out — **44–46 is the honest all-5-legs count**, not a shortfall. dio/dpo/ccc are
    at parity with dso *within the aggregate* because they share the one company set.
- **Live endpoint (TestClient over the scratch DB):** `GET /v1/sectors/28/lifecycle` → 200, 17 FY
  points, 7 caveats, aggregation label present, `ccc == dio+dso−dpo` (140.0), `approximate: true`
  flagged, no-alpha check passes.

## What the frontend should probe / know (F1–F4)
- Consume `/v1/sectors/{group}/lifecycle` in `sectors.js` `paintDetail` (after the spreads
  small-multiple). Add `sectorLifecycleTrend` multi-line chart to `app.js` (DIO/DSO/DPO/CCC, `days`
  axis, legend, `ruleY([0])` for negative CCC, **break lines on missing FY** — reuse the
  `windowedPoints` null-fill idea, never interpolate/0).
- **`approximate` affordance (AC-11):** flag points where `point.approximate` is true (caption/badge),
  reusing existing provenance vocabulary. **Descriptive copy only — no alpha/timing/edge words (AC-10).**
- Render the `caveats` in a `<details>` disclosure (reuse the spread-caveats pattern). Honest empty
  state on `points: []` ("sparse coverage, not zero"); skip silently on fetch failure (enhancement).
- e2e: the render check auto-expands a sector (`?group=`); confirm the lifecycle chart renders
  errors=0 and a missing line is not a 0-baseline.

---

## Frontend (F1–F4) — same branch

### What shipped (UI)
- **`static/app.js` — `sectorLifecycleTrend(points, opts)`** (exported on `window.ClearyFi`): a
  multi-line Observable-Plot trend of DIO/DSO/DPO + CCC over the FY series, built on the shared
  `chartCard`/`plotTokens`/`pickCategoricalScheme` helpers (matches `sectorDupontTrend`). **CCC is
  the hero line** (heavier stroke + larger dots) — the three components are the supporting lines.
  `ruleY([0])` baseline always drawn so **negative CCC reads honestly below zero**. Lines **break on
  a coverage-gap year** (contiguous-window null-fill, never interpolated/0). Legend + a `days`
  y-axis; hover shows metric/year/days. Empty/one-point → honest empty card. Caption states
  `CCC = DIO+DSO−DPO`, the `~ approximate` convention, and the gap convention.
- **`static/sectors.js`** — `paintDetail` now fetches `/sectors/{group}/lifecycle` (lazy, cached in
  `state.lifecycle`) and renders a **"Cash conversion cycle"** section in the expand-detail (after
  the spreads): heading + **"~ approximate" badge** when any point is approximate (AC-11), a
  descriptive lede (**no alpha/timing/edge words**, AC-10), the chart, and a `<details>` caveats
  disclosure. Honest empty state on `points:[]`; skips silently on fetch failure (enhancement).
- **`static/sectors.css`** — `.detail-lifecycle*`, `.approx-badge` (theme-aware tokens only).
- **`scripts/seed_fixture.py`** — `_seed_sector_lifecycle` (offline demo rows via `aggregate_row`,
  no `analytical` extra): working-capital sectors only (banks group 60 get **no** row → empty state
  exercised), group 73 has a **negative CCC**, group 28 **skips FY2023** (gap-break), latest year
  `approx_count>0` (badge). `ccc == dio+dso−dpo` holds exactly.
- **`scripts/headless_check.js`** — added `["sectors-lifecycle", "/sectors?group=73&range=all"]` to
  exercise the real chart (negative CCC + `~` affordance); the existing `?group=60` shot now also
  covers the lifecycle empty state.

### How I verified (UI)
- **e2e headless render (`docker compose --profile e2e up --abort-on-container-exit
  --exit-code-from e2e`):** all **25 pages errors=0**, incl. `sectors-lifecycle` and
  `sectors-expanded`. "seeded sector lifecycle: 19 rows across 4 sectors."
- **Eyeballed** `data/e2e-shots/sectors-lifecycle.png` — 4-line chart, legend, **negative CCC below
  the 0 baseline** (y-axis to −20), `~ approximate` badge, caption + 7-note disclosure, no overflow,
  clean in light theme. `data/e2e-shots/sectors-expanded.png` (group 60) — **honest empty state**
  ("sparse coverage, not zero"), no chart, no zero-baseline. Theme-aware via `cssVar` tokens (same
  as every other chart).
- **`pytest`** still **489 passed** after the `seed_fixture.py` addition.

### What QA should probe (UI)
- N/A vs 0: group 60 (banks) lifecycle empty state — confirm no zero-line chart. Missing-year gaps
  break lines (group 28 FY2023). Negative CCC (group 73) sits below zero, not clamped.
- The `~ approximate` badge appears only when a point is approximate; the caveats carry no
  alpha/timing/edge language. Dark theme legibility (e2e captures light only).

## Not done (out of scope / deferred)
- **Prod-volume re-ingest + the two new batches (`lifecycle_backfill`, `sector_lifecycle`)** are a
  **deferred DevOps step** — the live site stays sparse until then. Pipeline ends at green QA on the
  scratch copy.
- No commit/push/deploy (operator-gated).
