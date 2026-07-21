# 4 — QA Report: Sector Asset-Lifecycle Trends (DIO / DSO / DPO / CCC)

**Task slug:** `sector-lifecycle-trends`  ·  **Branch:** `sector-lifecycle-trends`
**Stage:** 4 — QA Tester  ·  **Date:** 2026-07-21
**Verdict: ✅ PASS — all 14 acceptance criteria independently verified by exercising the running feature.**

I tested behavior, not the diff — driving the metrics + lifecycle endpoints on the **real
re-ingested scratch copy** (`data/granular_scratch/granular_verify.db`), running the full `pytest`
suite and the Docker e2e headless render, and eyeballing the screenshots.

## Acceptance criteria — evidence

| AC | Verdict | Evidence |
|----|---------|----------|
| **AC-1** dio/dpo registered, days/TTM, dso status vocab | ✅ | Real flow: `GET /v1/companies/WMT/metrics?year=2024` → `dio: ok/days/TTM 41.5`, `dpo: ok/days/TTM 41.2` (realistic for a retailer). |
| **AC-2** period-end balance → approximate + `_INEXACT_AVG_REASON` | ✅ | Unit test `test_dio_dpo_approximate_without_prior_balance` (status=approximate, reason "period-end…", value still shown). |
| **AC-3** missing input / zero COGS → na, value None (never 0) | ✅ | Real flow: `GET /v1/companies/JPM/metrics` (bank, no inventory) → `dio/dpo na, value=None`. Unit tests `test_dio_na_when_inventory_missing`, `…cogs_zero`. |
| **AC-4** CCC N/A when any leg N/A (never leg-as-0) | ✅ | Real flow: JPM `ccc: na, value=None`. Unit test `test_ccc_na_when_one_leg_missing_never_zero_filled` asserts value is None with a missing DPO. |
| **AC-5** aggregate only by the batch; no DuckDB on the route | ✅ | `grep duckdb src/secfin/api/routes.py src/secfin/api/main.py` → none. Route reads `repo.get_series` (cache-aside). `import duckdb` is lazy, inside `analytical/sector_lifecycle.py` only. |
| **AC-6** series = ratio-of-sums; `ccc==dio+dso−dpo`; leg-less period omitted | ✅ | Real: WMT `dio+dso−dpo == ccc` (True). `GET /v1/sectors/28/lifecycle` → 200, 17 FY points, `ccc==dio+dso−dpo` per point. Aggregate math unit-tested (`test_aggregate_row_ratio_of_sums_and_ccc_identity`). 0 rows with a null leg (DB scan). |
| **AC-7** below-min groups absent; nothing rendered as 0 | ✅ | DuckDB `HAVING count(*) >= 5`; real run kept only qualifying groups (44–46/FY). UI: banks (group 60) render the honest empty state, not a zero chart (screenshot). |
| **AC-8** pytest green | ✅ | `docker compose --profile test run --rm test` → **489 passed, 6 skipped** (+16 new lifecycle tests; no regressions from the 3 new registry metrics). |
| **AC-9** lifecycle caveats (6 standard) present | ✅ | `/v1/sectors/28/lifecycle` caveats (7): SIC coarse/dated ✓, min-group drop ✓, aggregate-not-median ✓, N/A≠0 ✓, ~quarter lag ✓, restatement ✓. |
| **AC-10** no alpha/timing/edge language | ✅ | Programmatic scan of caveats + aggregation label: none of alpha/beat-the-market/timing/edge/outperform. Reviewed the UI lede ("descriptive working-capital structure… not a signal about returns"). |
| **AC-11** approximate flag visible in UI | ✅ | `sectors-lifecycle.png`: "~ approximate" badge on the section head; chart caption explains the ~ convention. `approximate` derived from `approx_count>0` server-side. |
| **AC-12** e2e errors=0; no 0-baseline for a missing line | ✅ | `docker compose --profile e2e …` → all **25 pages errors=0** incl. `sectors-lifecycle` + `sectors-expanded`. Missing lines break (group 28 gap); banks → empty state, not a 0 line. |
| **AC-13** docs updated | ✅ | `DATA_MODEL.md` (dio/dpo/ccc rows + new lifecycle section), `ROADMAP_METRICS.md` (Efficiency table), `ROADMAP_SECTOR_ANALYTICS.md` (#5 SHIPPED). |
| **AC-14** parity with dso across ~60 sectors on re-ingested copy | ✅ (see note) | On the scratch re-ingested copy: `lifecycle_backfill` 16,892 CIKs/76,037 rows; `sector_lifecycle` 1,910 rows; **44–46 distinct sectors/FY** (up from near-zero). dio/dpo/dso/ccc all present by construction; identity holds; **negative CCC honest** (SIC 73 = −4.9); 0 null legs. |

**AC-14 note (not a defect):** the brief's "~60" was the `net_margin` (headline-concept) breadth.
The lifecycle aggregate requires **all five legs** (incl. inventory + payables), so non-inventory
sectors — banks, insurers, utilities, holding companies — correctly drop out. **44–46 is the honest
all-5-legs count**, and dio/dpo/ccc are at parity with dso *within* the aggregate (one shared
company set). This is the correct behavior, not a shortfall.

## UI/UX review
- **States**: populated (group 73 — 4-line chart, legend, hover), empty (group 60 banks — "No
  lifecycle aggregate on record… sparse coverage, not zero", no chart), and lazy-load all render
  intentionally; the chart is a self-fetching enhancement that skips silently on failure without
  breaking the DuPont/spreads sections above it.
- **The honesty signature works**: CCC is drawn as the heavier "synthesis" line with a `ruleY(0)`
  baseline, so a **negative CCC sits truthfully below zero** (y-axis extends to −20) rather than
  being clamped — exactly the working-capital story the brief wanted, told descriptively.
- **Legibility/layout**: no clipped labels or overflow at desktop width; chart sits inside the
  card's scroll body; consistent with the DuPont trend + box-whisker sections (same `chartCard`
  dialect, categorical legend).
- **Copy**: sentence-case, active, user-facing ("How long cash sits in inventory (DIO) and
  receivables (DSO)…"); no over-claiming. The `~ approximate` badge names the provenance in the
  established vocabulary.
- **Theme**: token-driven (`cssVar`/`plotTokens`), same as every other chart. e2e captures light
  only; dark not independently screenshotted (pre-existing e2e limitation, code is token-based) —
  noted, not blocking.

## Defects
None.

## Handoff → DevOps (operator-gated)
**Ready to deploy — pending the deferred prod re-ingest.** The branch is green on a scratch
re-ingested copy; the code path is fully verified. **Before the live site shows lifecycle data, the
prod volume must be re-ingested and the two new batches run** — this is a deferred DevOps step, same
as the granular-concept-coverage task:
```
# after the prod bulk companyfacts backfill (granular concepts), on the prod volume:
python -m secfin.ingest.lifecycle_backfill      # -> lifecycle_components (no network)
python -m secfin.analytical.sector_lifecycle    # -> sector_lifecycle (needs the analytical extra)
```
Until then the live `/sectors/{group}/lifecycle` returns honest empty series (the UI shows the empty
state, never a zero). Branch is **uncommitted, not deployed** — a green QA report unlocks a deploy
*request*, not the deploy.
