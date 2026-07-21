# Active delivery task
task_slug: sector-lifecycle-trends
request: Deliverable #5 from docs/ROADMAP_SECTOR_ANALYTICS.md — DIO/DSO/DPO asset-lifecycle trends on the sector page. Add canonical metrics dio + dpo (mirroring _dso), derive CCC = dio+dso−dpo (N/A if any leg N/A), materialize a per-(SIC group, period) sector aggregate via the sector_dupont DuckDB-over-SQLite batch pattern, expose a per-sector FY-series endpoint, and render a multi-line lifecycle trend in the sector-page expand-detail. CUT the alpha claim; carry standard sector caveats; N/A never 0; Track 1. Verify on a scratch re-ingested copy (prod re-ingest deferred to DevOps).
branch: sector-lifecycle-trends (off master)
next_stage: done
qa_cycles: 0
updated: 2026-07-21

## Progress
- [x] 1 Product Manager       -> 1-brief.md (14 ACs; scope gate PASS Track 1; alpha claim cut;
      no new raw concept — mapping already has inventory/accounts_payable/cost_of_revenue.
      3 design decisions flagged for architect: all-legs membership for CCC, new table vs extend,
      endpoint shape. No AskUserQuestion needed. Verify on scratch re-ingested copy; prod = DevOps.)
- [x] 2 Principal Architect   -> 2-architecture.md (near-exact clone of the DuPont D1 scaffold.
      3 decisions RESOLVED: (1) require ALL 5 legs for CCC membership -> ccc=dio+dso-dpo exact on one
      set; (2) NEW tables lifecycle_components + sector_lifecycle (+ repos) not an extension;
      (3) endpoint = GET /v1/sectors/{group}/lifecycle FY-series. Company metrics dio/dpo/ccc added
      to registry (mirror _dso; ccc composes+propagates N/A). Aggregate = ratio-of-sums via DuckDB
      batch analytical/sector_lifecycle.py, cache-aside read, DuckDB never live. approx_count carries
      the period-end-balance flag. Frontend: new multi-line sectorLifecycleTrend in app.js consumed
      in sectors.js expand-detail. Files B1-B9 backend, F1-F4 frontend. ACs mapped to checks.)
- [x] 3 Backend  -> 3-implementation.md (dio/dpo/ccc metrics mirror _dso; ccc composes+propagates
      N/A; lifecycle_components all-5-legs; sector_lifecycle DuckDB ratio-of-sums batch; new repos +
      tables; GET /v1/sectors/{group}/lifecycle cache-aside (no DuckDB on route); schema + main
      wiring; docs. pytest 489 pass (+16 new, no regress). REAL-DATA verify on scratch re-ingested
      copy: lifecycle_backfill 16,892 CIKs/76,037 rows; sector_lifecycle 1,910 rows; AC-14 parity
      44-46 sectors/FY (up from ~0), dio/dpo/dso/ccc all present, identity holds, negative CCC honest
      (SIC73 -4.9), 0 null legs. Endpoint 200 w/ 17 FY points, caveats, no-alpha check pass. NOTE:
      ~60 in brief was net_margin breadth; 44-46 is the honest all-5-legs count (non-inventory
      sectors correctly excluded). Prod re-ingest + 2 new batches = DEFERRED DevOps.)
- [x] 3 Frontend -> 3-implementation.md (appended). app.js sectorLifecycleTrend (multi-line
      DIO/DSO/DPO + CCC-as-hero-line, ruleY(0) so negative CCC honest, break-on-gap, legend, days
      axis); sectors.js paintDetail fetches /sectors/{group}/lifecycle -> "Cash conversion cycle"
      section w/ ~approximate badge + descriptive lede (no alpha) + caveats disclosure + honest
      empty; sectors.css; seed_fixture _seed_sector_lifecycle (banks=empty, 73=negative CCC, 28=gap,
      latest year approx); headless_check +sectors-lifecycle shot. e2e 25 pages errors=0; eyeballed
      lifecycle (neg CCC below 0, badge) + expanded (banks empty state). pytest 489 green.
- [x] 4 QA Tester             -> 4-qa.md (PASS — all 14 ACs independently verified by driving the
      running feature. Real flow on scratch re-ingested copy: WMT dio 41.5/dpo 41.2/dso 4.8/ccc 5.1
      days (ok, identity holds); JPM bank dio/dpo/ccc na value=None (N/A never 0). AC-5 no duckdb on
      route. AC-8 pytest 489. AC-9 6/6 caveats. AC-10 no-alpha scan clean. AC-11 ~approx badge in
      screenshot. AC-12 e2e 25 pages errors=0. AC-13 docs. AC-14 44-46 sectors/FY (honest all-5-legs
      count; ~60 was net_margin breadth), negative CCC honest. No defects. UNCOMMITTED, NOT deployed.)

## Deploy note
- Green QA 2026-07-21. Branch sector-lifecycle-trends (off master), UNCOMMITTED, NOT deployed.
- DEFERRED DevOps step (same pattern as granular-concept-coverage): after the prod bulk companyfacts
  backfill, on the PROD volume run: `lifecycle_backfill` -> `sector_lifecycle`. Until then live
  /sectors/{group}/lifecycle returns honest empty series (UI shows empty state, never 0).
- Scratch DB data/granular_scratch/granular_verify.db (54G, now also has lifecycle_components +
  sector_lifecycle) retained from the prior task; remove at wrap-up if disk is needed.

## Notes / open loops
- Full-stack task. Backend first (mirror _dso; reuse sector_dupont scaffold — DuckDB-over-SQLite
  batch, never live path), then frontend.
- DATA: granular inputs (inventory/accounts_payable/cost_of_revenue) lit up market-wide by the
  granular-concept-coverage backfill, but PROD re-ingest is DEFERRED DevOps. Verify on scratch
  hydrated+re-ingested copy (data/backups/secfin-latest.db). Prior task left a re-ingested scratch
  DB at data/granular_scratch/granular_verify.db (54G) — reuse it if still present.
- HONESTY: cut alpha/timing/edge language; descriptive working-capital structure only. CCC N/A if
  any leg N/A (never 0). Standard sector caveats + approximate flag visible on period-end balances.
