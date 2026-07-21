# 2 — Architecture: Sector Asset-Lifecycle Trends (DIO / DSO / DPO / CCC)

**Task slug:** `sector-lifecycle-trends`
**Stage:** 2 (Principal Architect) → hand off to Senior Backend Engineer (then Frontend)
**Reads:** `1-brief.md`
**Date:** 2026-07-21

## Scope re-check — PASS (Track 1)
Structured statement-derived metrics only. No new raw/canonical concept (inventory, accounts_payable,
cost_of_revenue, accounts_receivable, revenue are all already in `normalize/mapping.py`). No free
text, no LLM, no price data, no new base dependency (DuckDB is the existing `analytical` extra, used
batch-only). No SEC-compliance change. Alpha claim cut per roadmap honesty flag #2. **No scope drift.**

## Design summary
This is a **near-exact clone of the Deliverable-1 DuPont scaffold**, one layer per stage, swapping the
four DuPont dollar legs for the five lifecycle dollar legs and the identity for the days-metrics. The
same guardrails hold: the aggregate is a **ratio of summed dollars** (not a median of ratios),
materialized **offline by a DuckDB-over-SQLite batch**, and read **cache-aside** from a plain SQLite
table on the live path (**DuckDB never on the request path** — guardrails 6/7).

The three **company-level** metrics (`dio`, `dpo`, `ccc`) are added to the metric registry for the
company page + unit tests + AC-1..4. The **sector** aggregate is computed from summed dollar legs
(`lifecycle_components`), NOT from per-company metric values — exactly as `sector_dupont` sums
`dupont_components`, so the aggregate stays identity-clean over one consistent company set.

### Resolved design decisions (the brief's three open items)
1. **CCC company-set membership → require ALL FIVE legs.** A company enters a `(group, period)`
   lifecycle aggregate only if avg-inventory, avg-accounts_payable, avg-accounts_receivable, TTM
   cost_of_revenue and TTM revenue are all present (denominators non-degenerate). One consistent set
   ⇒ `ccc = dio + dso − dpo` holds by construction on the aggregate (same discipline as
   `dupont_components`). This is the honest choice and it makes CCC an exact sum, not a cross-set
   subtraction. Documented in the `lifecycle_components` docstring.
2. **New table, not an extension.** Add `lifecycle_components` (per-company staging) +
   `sector_lifecycle` (materialized aggregate) tables + repos, parallel to the DuPont pair. Keeps the
   two aggregates independently rematerializable and the columns self-documenting.
3. **Endpoint = per-sector FY series.** New `GET /v1/sectors/{group}/lifecycle` → `SectorLifecycleSeries`.
   FY-only series (quarterly aggregates are sparse — same rationale as the DuPont series). No
   cross-sector "latest FY" grid route in this deliverable (the sector page consumes the per-sector
   series in the expand-detail; a cross-sector view is out of scope).

## Data flow (mirrors DuPont exactly)
```
raw_facts ──(ingest/lifecycle_backfill.py, pure/no-network)──▶ lifecycle_components   (per company+period, all-5-legs)
lifecycle_components + company_profiles ──(analytical/sector_lifecycle.py, DuckDB ATTACH)──▶ sector_lifecycle  (per SIC group+period)
sector_lifecycle ──(SQLiteSectorLifecycleRepository, cache-aside)──▶ GET /v1/sectors/{group}/lifecycle ──▶ sectors.js multi-line chart
```

---

## Backend — `senior-backend-engineer` (do FIRST, land endpoint + JSON contract)

### B1. Metrics — `src/secfin/normalize/metrics.py`
- **`_dio`** (Days Inventory Outstanding) — clone `_dso` exactly:
  ```
  avg, exact = ctx.avg("inventory"); cogs = ctx.ttm("cost_of_revenue")
  na if avg is None or cogs is None ("inventory or cost of revenue not reported")
  na if abs(cogs) < _NEAR_ZERO ("cost of revenue is zero/near-zero")
  value = avg / cogs * 365.0 ; approx(_INEXACT_AVG_REASON) if not exact else ok
  ```
  label `"Days Inventory Outstanding"`, unit `"days"`, basis `"TTM"`.
- **`_dpo`** (Days Payable Outstanding) — same shape with `ctx.avg("accounts_payable")` / `cost_of_revenue`.
  label `"Days Payable Outstanding"`.
- **`_ccc`** (Cash Conversion Cycle) — **compose** `_dio(ctx)`, `_dso(ctx)`, `_dpo(ctx)`:
  - if any of the three is **not** `ok`/`approximate` (i.e. `value is None`) → `ctx.na("ccc", "Cash
    Conversion Cycle", "days", "TTM", "<which leg> not available")`. **N/A propagates — a missing leg
    is NEVER treated as 0** (AC-4).
  - else `value = dio.value + dso.value − dpo.value`; status is **`approximate`** if any leg was
    `approximate` (reason `_INEXACT_AVG_REASON`), else `ok`.
  - Must return a valid MetricValue on the empty-context harvest path (`_metric_meta` runs every fn
    against an empty ctx) — the na branch already does (dio/dso/dpo all na on empty ctx).
- **Register** `("dio", _dio), ("dpo", _dpo), ("ccc", _ccc)` in `_METRICS` — place `dio`/`dpo`
  adjacent to `dso` (efficiency block), `ccc` right after. `METRIC_LABELS`/`METRIC_UNITS` auto-harvest.
- **`LifecycleComponents` NamedTuple + `lifecycle_components(facts, cik, fy, fp)`** — clone
  `DupontComponents`/`dupont_components`:
  - legs: `inventory` (avg), `accounts_payable` (avg), `accounts_receivable` (avg),
    `cost_of_revenue` (TTM), `revenue` (TTM); plus `period_end`, `approximate` (any avg fell back).
  - return **None** unless all five present and `cost_of_revenue`/`revenue` non-degenerate
    (all-5-legs membership, decision #1). Reuse `_index_concepts` / `_resolve_anchor` / `ctx.avg` /
    `ctx.ttm` — no duplicated logic.

### B2. Per-company staging store
- **`src/secfin/storage/lifecycle_component_repository.py`** — abstract, clone
  `dupont_component_repository.py`. `LifecycleComponentRow(cik, fiscal_year, fiscal_period,
  period_end, inventory, accounts_payable, accounts_receivable, cost_of_revenue, revenue,
  approximate)`. Methods: `bulk_upsert`, `clear`, `count`, `close`.
- **`src/secfin/storage/sqlite_lifecycle_component_repository.py`** — clone the DuPont sqlite impl.
  Table `lifecycle_components`, PK `(cik, fiscal_year, fiscal_period)`, own WAL connection.

### B3. Per-company backfill (pure/no-network)
- **`src/secfin/ingest/lifecycle_backfill.py`** — clone `ingest/dupont_backfill.py`. Reads `raw_facts`
  via `SQLiteRawFactRepository`, runs `lifecycle_components` over `metric_periods(facts)`, writes rows
  where not None (all-5-legs), `clear()` first. `python -m secfin.ingest.lifecycle_backfill [--limit N]`.

### B4. Analytical aggregate (DuckDB batch — never live path)
- **`src/secfin/analytical/sector_lifecycle.py`** — clone `analytical/sector_dupont.py`. DuckDB
  `ATTACH '<db>' (TYPE sqlite)`, group `lifecycle_components` JOIN `company_profiles` by
  `substr(sic,1,?)` + fiscal period, `HAVING count(*) >= min_size`. Sums: `Σinventory, Σaccounts_payable,
  Σaccounts_receivable, Σcost_of_revenue, Σrevenue`, `max(period_end)`, `count(*)`,
  **`sum(CASE WHEN approximate THEN 1 ELSE 0 END) AS approx_count`**. `aggregate_row` computes:
  - `dio = Σinv/Σcogs*365`, `dpo = Σap/Σcogs*365`, `dso = Σrec/Σrev*365`, `ccc = dio+dso−dpo`
  - guard: None if `abs(Σcogs) < _NEAR_ZERO or abs(Σrev) < _NEAR_ZERO`.
  - carry `approximate = approx_count > 0` (surfaced in the UI, AC-11).
  `run_sector_lifecycle` → `clear()` + `bulk_upsert`. `python -m secfin.analytical.sector_lifecycle`.

### B5. Materialized aggregate store
- **`src/secfin/storage/sector_lifecycle_repository.py`** — abstract, clone
  `sector_dupont_repository.py`. `SectorLifecycleRow(peer_group, fiscal_year, fiscal_period,
  period_end, peer_count, approx_count, sum_inventory, sum_accounts_payable, sum_accounts_receivable,
  sum_cost_of_revenue, sum_revenue, dio, dpo, dso, ccc)`. Methods: `bulk_upsert`, `clear`,
  `get_series(peer_group)` (FY-only, oldest first), `count`, `close`. (No `list_for_period` /
  `latest_fy_year` needed — no cross-sector grid route this deliverable; add `get_series` only.)
- **`src/secfin/storage/sqlite_sector_lifecycle_repository.py`** — clone the DuPont sqlite impl.
  Table `sector_lifecycle`, PK `(peer_group, fiscal_year, fiscal_period)`, index on `peer_group`.

### B6. API model — `src/secfin/normalize/schema.py`
- **`SectorLifecyclePoint`**: `group, group_label, fiscal_year, fiscal_period, period_end, peer_count,
  approximate: bool, dio, dpo, dso, ccc` (each of dio/dpo/dso/ccc a `float`; the aggregate always has
  all four since membership requires all legs — but keep them plain floats, and the SERIES omits a
  period entirely rather than emitting a null leg).
- **`SectorLifecycleSeries`**: `group, group_label, peer_basis, aggregation: str (a lifecycle-specific
  constant, e.g. "aggregate ratio of summed dollars — Σinventory/Σcost_of_revenue × 365, etc.; not a
  median"), caveats: list[str], points: list[SectorLifecyclePoint]`.

### B7. Route + wiring — `src/secfin/api/routes.py`, `src/secfin/api/main.py`
- `get_sector_lifecycle_repo(request)` dependency (reads `request.app.state.sector_lifecycle_repo`).
- `_sector_lifecycle_model(row)` mapper (attach `sic2_label`).
- **`_LIFECYCLE_CAVEATS`** — reuse the sector-aggregate vocabulary, adapted (NO alpha/timing language):
  - "These are AGGREGATE days-metrics (Σinventory/Σcost_of_revenue × 365, etc.) — a ratio of summed
    dollars across the sector, NOT a median of company figures."
  - "DIO/DSO/DPO use average balances; where a company reported only a period-end balance (no
    prior-period), its figure is APPROXIMATE — a point drawn from any such company is flagged."
  - "A company is included only when inventory, payables, receivables, cost of revenue AND revenue are
    all reported; a company N/A on any leg is excluded, never counted as zero."
  - "CCC = DIO + DSO − DPO on that one consistent company set; a sector missing any leg has no CCC
    (never a zero)."
  - "These describe a sector's WORKING-CAPITAL STRUCTURE — how long cash sits in inventory and
    receivables vs. how long suppliers finance it. Descriptive, not a timing signal or edge."
  - the standard SIC-coarse/dated, below-min-dropped, ~quarter-lag/restatement lines.
- **`GET /v1/sectors/{group}/lifecycle`** → `SectorLifecycleSeries`, reading
  `repo.get_series(group)` cache-aside. Docstring states the batch is the sole producer and the live
  path never runs DuckDB. **Route ordering:** declare it with its `/lifecycle` suffix; it does not
  collide with `/sectors/{group}` (extra segment) — but place it near the other `/sectors/{group}/...`
  routes and after `/sectors/spreads` (which must stay before the bare `/sectors/{group}`).
- `main.py`: `app.state.sector_lifecycle_repo = SQLiteSectorLifecycleRepository(settings.secfin_db_path)`
  in startup; `.close()` in shutdown. Mirror the `sector_dupont_repo` lines exactly.

### B8. Tests — `tests/`
- Unit (`test_metrics*.py` or a new `test_lifecycle_metrics.py`): `_dio`/`_dpo` **ok** (both balances
  present → averaged), **approximate** (period-end only → `_INEXACT_AVG_REASON`), **na** (missing
  input; zero COGS). `_ccc`: **ok** = dio+dso−dpo; **approximate** when a leg is approximate;
  **na** when exactly one leg missing (AC-4 — assert value is None, not a 0-substituted number).
  `lifecycle_components`: None unless all five legs; dollar legs correct; `approximate` propagation.
- Aggregate (`test_sector_lifecycle*.py`): `aggregate_row` → dio/dpo/dso/ccc are ratios-of-sums,
  `ccc == dio+dso−dpo`, None on degenerate denominator, `approximate = approx_count>0`.
- API (`test_*routes*` / `test_sectors*`): `GET /v1/sectors/{group}/lifecycle` returns the series
  contract, caveats present, empty `points` is a valid honest result, **no DuckDB import on the route**
  (assert by construction — the route only touches the SQLite repo).
- Run via Docker test profile (host has no pip/venv).

### B9. Docs (guardrail 3 — metric registry docs, NOT the tag map)
- `docs/DATA_MODEL.md`: document `dio`, `dpo`, `ccc` (formula, `days` unit, TTM basis, the
  `approximate` period-end-balance flag, the CCC N/A-propagation rule) alongside `dso`; document the
  `sector_lifecycle` aggregate (ratio-of-sums, all-5-legs membership).
- `docs/ROADMAP_METRICS.md`: add dio/dpo/ccc to the metric catalogue if it enumerates one.
- `CLAUDE.md` common-commands: add `lifecycle_backfill` + `sector_lifecycle` to the batch sequence
  (they run alongside dupont_backfill/sector_dupont after a fresh ingest).

---

## Frontend — `senior-frontend-engineer` (SECOND, same branch)

### F1. Chart primitive — `src/secfin/api/static/app.js`
- Add **`sectorLifecycleTrend(series, opts)`** — a **multi-line** trend (clone the structure of
  `sectorDupontTrend`, but 4 series on a shared `days` y-axis): DIO, DSO, DPO, CCC. Requirements:
  - `x` = fiscal year (`"FY"+y` ticks); `y` = days, `tickFormat` via `fmt.days`.
  - One `Plot.lineY` + `Plot.dot` per series with 4 distinct **categorical** strokes from the existing
    plot tokens (follow the `dataviz` palette approach already used in app.js — neutral, theme-aware,
    NOT good/bad coloring). A small **legend** (DIO/DSO/DPO/CCC).
  - **Break lines on missing years** (null-fill a contiguous year window exactly like
    `windowedPoints`) — never interpolate, never 0.
  - CCC can be **negative** (payables outlast inventory+receivables) — include a `ruleY([0])` baseline
    and let the y-domain span negatives honestly.
  - Export in the `ClearyFi` object (next to `sectorDupontTrend`).
- If cleaner, factor the multi-series densify into a helper; keep it CSP-safe, vendored Plot only.

### F2. Sector page — `src/secfin/api/static/sectors.js`
- In `paintDetail`, after the spreads small-multiple, add a **lifecycle trend** section: fetch
  `/sectors/{group}/lifecycle` (lazy, cached in `state.lifecycle[group]`), render via
  `sectorLifecycleTrend`. On empty `points` → honest empty state ("No lifecycle aggregate on record
  yet — sparse coverage, not zero"). On fetch failure → skip silently (enhancement, like the spreads).
- Render the lifecycle `caveats` in a `<details>` disclosure (reuse the spread-caveats pattern).
- **`approximate` affordance (AC-11):** where `point.approximate` is true, mark it — e.g. a caption
  line "Points marked ~ include companies that reported only a period-end balance (approximate)" and/or
  a small badge — using the same provenance vocabulary as the rest of the UI. Descriptive copy only:
  **no alpha/timing/edge words** (AC-10).
- A short section heading + one-line descriptive lede ("How long cash sits in inventory and
  receivables vs. how long suppliers finance it — working-capital structure, descriptive.").

### F3. Styles — `src/secfin/api/static/sectors.css`
- Legend + optional approximate-badge styling; theme-aware (light/dark tokens already in use).

### F4. e2e (AC-12)
- The Docker headless render check auto-expands a sector (`?group=`); confirm the lifecycle chart
  renders with **errors=0** and a missing line is not drawn at a 0 baseline. Eyeball the screenshot.

---

## Acceptance criteria → concrete checks
- **AC-1** `dio`/`dpo` in `METRIC_KEYS`; `compute_metrics` returns them with `unit=days`, `basis=TTM`.
  → unit test + `curl /v1/companies/{sym}/metrics`.
- **AC-2** period-end-only balance → `status=approximate`, `reason=_INEXACT_AVG_REASON`. → unit test.
- **AC-3** missing input / zero COGS → `status=na` + reason, `value is None`. → unit test.
- **AC-4** one leg missing → CCC `status=na`, `value is None` (NOT 0-substituted). → unit test.
- **AC-5** aggregate produced only by `analytical/sector_lifecycle.py`; route imports no duckdb.
  → grep the route module; test reads the SQLite repo only.
- **AC-6** series payload dio/dpo/dso/ccc are ratios-of-sums; `ccc == dio+dso−dpo` per point; a
  leg-less period is omitted, not null/0. → aggregate unit test + API test.
- **AC-7** below-min groups absent; no metric/period rendered as 0. → aggregate `HAVING` + UI empty state.
- **AC-8** `pytest` green (Docker). → QA runs it.
- **AC-9** lifecycle caveats present (SIC coarse/dated, below-min dropped, aggregate-not-median,
  N/A≠0, ~quarter lag, restatement). → inspect `_LIFECYCLE_CAVEATS` + payload.
- **AC-10** no alpha/timing/edge language anywhere. → grep copy/docstrings/docs.
- **AC-11** `approximate` visible in UI where period-end balances used. → e2e/eyeball.
- **AC-12** Docker e2e render errors=0; no 0-baseline for a missing line. → QA e2e.
- **AC-13** DATA_MODEL.md documents dio/dpo/ccc + aggregate; ROADMAP_SECTOR_ANALYTICS.md #5 done. → inspect.
- **AC-14** on the scratch re-ingested copy, dio/dpo/ccc light up at parity with dso across ~60
  sectors. → QA runs the backfills on the scratch DB and counts materialized sectors.

## Verification data (unchanged from brief)
Run the pipeline on a **scratch hydrated + re-ingested copy** (the prior task left one at
`data/granular_scratch/granular_verify.db`, 54G — reuse if present; else hydrate
`data/backups/secfin-latest.db` and run `secfin.ingest.backfill`). Sequence to materialize this
feature there: `lifecycle_backfill → sector_lifecycle` (dupont_components already materialized on that
copy from the prior task). **Prod re-ingest + these two batches are a DEFERRED DevOps step** — the live
site stays sparse until then; the pipeline ends at green QA on the scratch copy.

## Handoff → Senior Backend Engineer
Branch off `master` (`sector-lifecycle-trends`). Implement B1–B9 (backend first: metrics + staging +
backfill + analytical aggregate + store + schema + route + wiring + tests + docs), self-verify via
Docker (`pytest` + a curl of the new endpoint on the scratch DB), set `next_stage: frontend`, then the
Senior Frontend Engineer does F1–F4 on the same branch. No commit/deploy — pipeline ends at green QA.
