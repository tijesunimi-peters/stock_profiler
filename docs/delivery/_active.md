# Active delivery task
task_slug: sector-theme-scores
request: Phase 0 of docs/REDESIGN_SECTOR_OVERVIEW.md — composite sector theme-scoring model. Materialized sector_theme_scores table + DuckDB-over-SQLite batch (mirror peer_ranks.py/peer_distribution.py, never live path) + cache-aside GET /v1/sectors/theme-scores. Score 5 backable themes (Profitability, Growth, Financial health, Cash & investment, Operating efficiency): equal-weight constituents, z-score of per-sector medians across qualifying sectors, cross-sector rank badge, prior-FY trend delta, per-constituent decomposition (00 §9a). Defer Accounting quality + Structure & activity as "not yet scored". Caveats; N/A never 0. Backend-only phase (no UI).
branch: sector-theme-scores (off master)
next_stage: done
qa_cycles: 0
updated: 2026-07-21

## Progress
- [x] 1 Product Manager       -> 1-brief.md (15 ACs; scope gate PASS Track 1; backend-only, no UI.
      KEY FINDING: no higherIsBetter/favorability registry exists — must be created (D1, honesty-
      critical, defaults proposed). Deferred 2 themes emit scored:false, never 0.)
- [x] 2 Principal Architect   -> 2-architecture.md (backend-only. Resolved D1-D4 + added D3/D5:
      D1 direction map -> METRIC_DIRECTION in metrics.py (incl. dio=False). D3 SCALE-FREE-ONLY rule:
      dollar levels (fcf, net_debt) EXCLUDED from scoring -> Cash&inv=fcf_margin+ocf_growth (2),
      Fin health=d/e+int_cov+current+quick (4, net_debt dropped). D2 score=round(clamp(50+15*z,
      0,100)), 50=avg, percentile line separate. D4 MIN_SECTORS_FOR_ZSCORE=3, theme needs
      >=max(2,ceil(n/2)) constituents. D5 batch is PURE-PYTHON not DuckDB (input metric_distributions
      already aggregated; offline/never-live regardless). New: normalize/themes.py, analytical/
      sector_theme_scores.py, storage/sector_theme_score_repository.py (+sqlite), parent+child tables
      sector_theme_scores/sector_theme_components, GET /v1/sectors/theme-scores, 4 schema models.
      Deferred themes injected scored:false at serve layer, not materialized. AC->check table done.)
- [x] 3 Backend  -> 3-implementation.md (branch sector-theme-scores. New: normalize/themes.py,
      analytical/sector_theme_scores.py (PURE-PYTHON, no DuckDB), storage/sector_theme_score_repo
      (+sqlite: sector_theme_scores + sector_theme_components tables), 4 schema models,
      GET /v1/sectors/theme-scores (declared BEFORE /sectors/{group}), METRIC_DIRECTION map +
      higher_is_better in metrics.py, list_for_metric_all_periods on dist repo, main.py wiring, docs
      (DATA_MODEL/ROADMAP/REDESIGN/CLAUDE). pytest 506 pass (+17, no regress). ruff clean on my
      lines (pre-existing B008/1 E501 only). REAL-DATA (AC-14) on scratch granular_verify.db: batch
      -> 21,053 scores + 75,771 components; latest FY 2025 (2026 skipped); all 5 themes populate;
      deferred=0 rows; ranks dense 0 violations; hand spot-check sector 60 profitability score 76
      reproduces; endpoint 200, banks correctly OMIT operating_efficiency (AC-6). Prod batch=DEFERRED
      DevOps.)
- [x] 4 QA Tester             -> 4-qa.md (PASS — all 15 ACs independently verified by exercising the
      running feature over the hydrated scratch DB. pytest 506 pass, ruff clean. AC-11 statics clean
      (no duckdb in api/, no raw SQL in routes). Real endpoint drive: AC-7 scored:false==exactly the
      2 deferred themes; AC-6 banks OMIT operating_efficiency (absent, not 0/scored:false); AC-4
      earliest FY 2007 all-null delta (420 legit 0.0 distinct); AC-2 debt_to_equity orientation
      correct on real data; AC-1 banks profitability 76 reproduces by hand; AC-8 0 scored w/o
      distributions; AC-9 empty-db honest 200. Batch idempotent re-run. 1 non-blocking observation
      O-1: negative-equity d/e artifact -> favorable z (Phase 2 UI copy note, not a data defect).
      No UI (backend-only). UNCOMMITTED, NOT deployed. Prod batch run = deferred DevOps.)

## Deploy note
- PASS unlocks a deploy REQUEST, not a deploy. Code deployable on sector-theme-scores branch; prod
  /v1/sectors/theme-scores stays honest-empty until DevOps runs
  `python -m secfin.analytical.sector_theme_scores` on a volume with metric_distributions populated
  (needs bulk companyfacts backfill + peer_distribution first) — same posture as sibling sector
  batches. Operator next: commit branch and/or /devops-engineer.

## Notes / open loops
- Backend-only. No frontend stage (UI is Phases 1-3 of REDESIGN_SECTOR_OVERVIEW.md, separate tasks).
- Reuse: metric_distributions (per-(peer_group,fy,period,metric) five-number summary + peer_count;
  secfin_peer_min_size=5). Clone sector_dupont.py / peer_distribution.py DuckDB-over-SQLite scaffold.
  _PEER_CAVEATS / _SECTOR_CAVEATS vocabulary in routes.py.
- ARCHITECT must resolve D2/D3/D4 and confirm D1; label the normalization method in the payload.
- DATA: real data in backup; build/verify on hydrated Docker volume (no local pip/venv). Prod batch
  = DEFERRED DevOps (like other sector-analytics batches).
- HONESTY: N/A excluded never 0; deferred themes scored:false; below-min sectors absent; DuckDB never
  live path; no good/bad claim beyond favorability/orientation.
