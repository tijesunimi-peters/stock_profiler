# Active delivery task
task_slug: sector-box-whisker-spreads
request: Deliverable #3 from docs/ROADMAP_SECTOR_ANALYTICS.md — box-and-whisker liquidity/solvency spreads on the sector page. ~80% built: run analytical/peer_distribution.py to populate the empty metric_distributions table, then add a box/strip viz of per-SIC-group five-number summaries (min/p25/median/p75/max) to the /sectors surface, reusing the existing /peers/{metric}/distribution API pattern. Honor honesty rules: SIC caveats + N/A excluded never 0 + percentile/spread is POSITION not a good/bad verdict (reuse _PEER_CAVEATS).
branch: sector-box-whisker-spreads (off master)
next_stage: done
qa_cycles: 0
updated: 2026-07-20

## Progress
- [x] 1 Product Manager       -> 1-brief.md (scope gate PASS: Track 1, reuses existing
      peer_distribution batch + metric_distributions table + company-anchored distribution route.
      OPERATOR DECISION: ship BOTH framings — (1) cross-sector box/whisker (metric selector, one
      box per SIC-2 sector) + (2) per-sector box/strip panel in the expand detail. 11 ACs. Metric
      set = current_ratio, quick_ratio, debt_to_equity, interest_coverage. NO new page/metric/table
      — extend /sectors in place. Honesty: reuse _PEER_CAVEATS (spread=POSITION not verdict, N/A
      excluded never 0, SIC coarse, min-size drop), no alpha claim.)
- [x] 2 Principal Architect   -> 2-architecture.md (FULL-STACK backend→frontend, no drift. NO new
      metric/concept/table → guardrail 3 N/A. Reuse peer_distribution.py batch + metric_distributions.
      B: +2 repo read methods (list_for_metric cross-sector, list_for_group per-sector) on
      MetricDistributionRepository (no raw SQL in API — guardrail 5); 4 schema models (SectorSpread/
      List, MetricSpread/SpreadProfile); 2 endpoints /v1/sectors/spreads (cross) + /v1/sectors/{g}/
      spreads (per) reusing _PEER_CAVEATS + _LIQUIDITY_SOLVENCY_METRICS (current_ratio, quick_ratio,
      debt_to_equity, interest_coverage). CRITICAL: declare /sectors/spreads BEFORE /sectors/{group}
      (else group="spreads") + ordering regression test. Run batch on hydrated volume (AC-1). F: one
      shared boxWhiskerChart Plot builder (cross=shared axis, per=small-multiple independent axes,
      extreme-tail honest domain), metric selector, seed _seed_metric_distributions (omit one
      group,metric for empty-state honesty) + headless entry. Docs: ROADMAP_SECTOR_ANALYTICS #3.)
- [x] 3 Backend  -> 3-implementation.md §3a. +3 repo reads (list_for_metric/list_for_group/
      latest_fy_year) on MetricDistributionRepository (no raw SQL in API); 4 schema models;
      2 endpoints /v1/sectors/spreads + /v1/sectors/{g}/spreads (declared spreads BEFORE {group},
      regression-tested); _SPREAD_CAVEATS reuses _PEER_CAVEATS. pytest 473 pass (+6), ruff clean.
      RAN BATCH on hydrated 7.2G copy (4380 rows). MID-STAGE OPERATOR DECISION: real data shows
      liquidity/solvency metrics near-empty (current/quick/int=1 sector, debt_to_equity=0) —
      granular concepts sparse market-wide (AssetsCurrent 68 ciks vs Assets 8665). Operator chose
      BROADEN metric set: _SPREAD_METRICS = profitability (net_margin/roe/roa/asset_turnover/rev+
      earnings growth, POPULATED ~60 sectors) + liquidity/solvency (offered, honest empties that
      fill in later). Verified live: net_margin 63 boxes, roe 60, current_ratio 1, debt_to_equity 0.
      NOTE for FE: net_margin has extreme real tails (bank box min -134.76) → axis clip+caption,
      never clip data.
- [x] 3 Frontend -> 3-implementation.md §3b. boxWhiskerChart Plot builder (app.js, exported):
      horizontal boxes, whisker/IQR/median, honest tail-CLIP (▸ markers + "nothing clipped from
      data" caption), long-label truncation w/ full name in tooltip, empty≠0. sectors.js: cross-
      sector section (#spreads mount, grouped metric selector Profitability/Liquidity+Solvency,
      ?metric= deep-link, caveats disclosure) + per-sector small-multiple in expand detail (omit-
      never-0). sectors.html #spreads mount; sectors.css. seed _seed_metric_distributions (grp 28
      omits L/S; interest_coverage extreme tails for clip). headless +3 (spreads/clip/empty).
      e2e ALL 22 pages errors=0; eyeballed sectors/expanded/clip/empty — all honesty paths confirmed.
      Fixed mid-verify: y-label left-clip (marginLeft 204 + truncate 28). pytest 473 green. Docs:
      ROADMAP_SECTOR_ANALYTICS #3 SHIPPED + granular-coverage follow-up noted.
- [x] 4 QA Tester             -> 4-qa.md (PASS — all 11 ACs, AC-3 verified against the operator's
      broadened-set revision. pytest 473 pass; e2e all 22 pages errors=0; real-data batch (4380 rows)
      + endpoint drive. Honesty verified: empty≠0, tail-clip "nothing clipped from data", spread=
      position-not-verdict, caveats present, peer_count shown. code-review high: 3 findings ALL
      low/non-blocking. UNCOMMITTED. Deploy MUST run peer_distribution.py on prod volume first.)

## Notes / open loops
- DONE 2026-07-20. Green QA. Branch sector-box-whisker-spreads (off master), UNCOMMITTED, NOT deployed.
- Operator next options: (a) commit the branch; (b) request deploy via /devops-engineer (gated) —
  deploy MUST run `python -m secfin.analytical.peer_distribution` (analytical extra) on the prod
  volume to populate metric_distributions, else /sectors spreads honestly show empty.
- KEY MID-BUILD FINDING (operator-resolved): on the hydrated volume the liquidity/solvency metrics
  are near-empty market-wide (granular concepts AssetsCurrent 68 ciks / LongTermDebt 34 vs Assets
  8665). Operator chose "broaden metric set": spread selector = profitability (net_margin/roe/roa/
  asset_turnover/rev+earnings growth, populated ~60 sectors) + liquidity/solvency (offered, honest
  empties). Follow-up task noted in ROADMAP_SECTOR_ANALYTICS.md: granular-concept coverage re-ingest.
- Scratch verification db (data/spread_verify.db, 7.2G copy) REMOVED at wrap-up.
- 3 low/non-blocking code-review follow-ups in 4-qa.md.
