# Active delivery task
task_slug: sector-app-company
request: Phase 2 of docs/REDESIGN_SECTOR_APP.md — COMPANY view (altitude 2) of the paper-terminal Sector Analytics app (/sector-analytics). FULL-STACK: new read endpoint (per-company values for a sector+metric, from metric_values ⨝ company_profiles by SIC; cache-aside, DB behind repo, no raw SQL in API, no DuckDB) then the frontend. Full dot-cloud (each peer a clickable dot at its value, IQR band + median, focal = accent diamond, click-to-refocus); search-driven focal (⌘K); left percentile rail + composite rank. NO favorability color. focalTicker persists across views. Fixture seeds per-company metric_values + SIC for a group.
branch: sector-app-company (stacked on sector-app-shell / Phase 1)
next_stage: done
qa_cycles: 0
updated: 2026-07-22

## Progress
- [x] 1 Product Manager       -> 1-brief.md (14 ACs; scope gate PASS Track 1; FULL-STACK. Full dot-
      cloud (new endpoint) + search-driven focal. R1-R5 for architect.)
- [x] 2 Principal Architect   -> 2-architecture.md (full-stack, backend first. Resolved R1-R5: R1
      company_profiles HAS name -> endpoint returns cik+name, state focalCik (int), search resolves
      ticker->cik, no fabricated tickers. R2 left rail = DERIVED per-theme percentile (avg of
      constituent metric percentiles from /peers, invert lower-is-better), 5 themes + 2 not-scored;
      composite card = derived composite percentile (labeled), NOT a fabricated rank. R3 KEY insight:
      new endpoint returns all peers' RAW values -> IQR band + median computed CLIENT-SIDE from the
      values, so dot-plot needs ONLY the new endpoint (freed from _SPREAD_METRICS); metric set =
      net_margin/revenue_growth_yoy/roe/roa/debt_to_equity/fcf_margin/inventory_turnover/current_ratio
      + higher_is_better map for inversion + 'lower is better' text marker. R5 one-metric-per-call GET
      /v1/sectors/{group}/{metric}/companies. Backend: new SectorCompanyRepository (+sqlite) joining
      metric_values ⨝ company_profiles on SIC prefix LEFT JOIN metric_ranks (SQL in storage, exclude
      value NULL + status not ok/approx, below-min -> empty); SectorCompanyValue(List) schema;
      endpoint 404 unknown metric + honest empty; main wiring; pytest. Frontend: suggest.js + search
      wiring + ?symbol= preset, Company view (derived rail + composite card + per-metric dot-plots
      client-computed IQR + focal accent diamond + click-refocus), fixture seeds a SIC group >= min
      size + resolvable ticker, e2e shots. Files named. AC->check done.)
- [x] 3 Backend  -> 3-implementation.md (branch sector-app-company STACKED on Phase 1 3e4bfc6. New
      SectorCompanyRepository (+sqlite): list_for_group_metric joins metric_values ⨝ company_profiles
      LEFT JOIN metric_ranks, excludes value NULL/status-not-ok/approx + filters SIC prefix, ORDER BY
      value; latest_fy helper. SectorCompanyValue(List) schema. GET /v1/sectors/{group}/{metric}/
      companies -> 404 unknown metric, below-min/no-values -> honest empty companies:[], caveats +
      higher_is_better (METRIC_DIRECTION). main.py wired. 5 pytest tests (join excludes N/A+other-
      group, ordered, populated endpoint, below-min empty, 404, lower-is-better flag). Docs DATA_MODEL
      + CLAUDE. pytest 511 pass (+5, no regress); ruff clean; contract verified (populated/empty/404).
      NO DuckDB, no raw SQL in routes, DB behind repo. Frontend consumes the JSON contract in 3-impl.)
- [x] 3 Frontend -> 3-implementation.md (appended). Company view in sectorapp.js: suggest.js search
      + ?symbol= preset -> selectFocal (resolve via /companies/{sym}/peers -> cik+group+percentiles);
      derived per-theme rail (avg constituent percentiles, invert lower-is-better) + composite card
      (labeled derived, not a rank); 8-metric dot-plots (client-computed IQR+median from endpoint
      values, neutral jittered dots, focal accent diamond, "lower is better" text marker, dot-click
      selectFocalCik recompute); focalCik persists. sectorapp.css dot-plot/rail styles (no color).
      seed_fixture _seed_app_company_group (10 SIC-35 filers + values + ranks, one N/A pair excluded,
      focal ?symbol=900001). headless_check +3 company shots. pytest 511 pass; e2e PASS errors=0;
      EYEBALLED empty/populated(rail+composite P10+8 dot-plots+focal diamond+lower-is-better+9-filers
      N/A-excluded)/refocus(dot-click->Machinery Co 5 recompute). No favorability color. /sectors +
      Sector view intact.)
- [x] 4 QA Tester             -> 4-qa.md (PASS — all AC-1..AC-14 met. pytest 511 pass/6 skip (new
      endpoint 5/5); e2e PASS errors=0 + eyeballed; scripted driving 19/19 PASS. Confirmed: N/A
      excluded never 0 (fcf 9 vs net_margin 10), d/e percentile favorability-inverted (0.70x->P56),
      NO favorability color (computed styles neutral+accent-only), dot-click refocus recomputes,
      focal persists Company->Sector->Company, mobile 390px overflow=0, /sectors untouched, no
      DuckDB/raw-SQL in routes. Pre-existing note (out of scope): app-wide Google-Fonts CDN load is
      Phase-1/whole-app, not introduced here. Ready to deploy (operator-gated).)

## Notes / open loops
- FULL-STACK. Backend (senior-backend-engineer): new read endpoint GET /v1/sectors/{group}/{metric}/
  companies (per-company {cik, value, percentile, label}); new repo method joining metric_values ⨝
  company_profiles on SIC prefix (SQL in storage only); cache-aside; N/A·N/M excluded never 0; honest
  empty below-min/no-values; 404 unknown metric; pytest. THEN frontend (senior-frontend-engineer):
  Company view in sectorapp.js (search-driven focal, dot-plots, left rail + rank, dot-click refocus),
  fixture seeding, e2e -- SAME branch.
- Reuse: metric_values (per-cik value), metric_ranks (per-cik percentile+z), company_profiles (cik->
  SIC), /companies/{symbol}/peers + /peers/{metric}/distribution + /metrics, METRIC_DIRECTION
  (higher_is_better), normalize/themes.py (constituent map for R2).
- HONESTY: NO favorability color (dots neutral, focal accent diamond, "lower is better" text marker);
  percentiles favorability-adjusted (invert lower-is-better) + exclude N/A·N/M; real filers only; N/A
  never 0; honest empties (no company picked / metric no distribution / below min size).
- Verify: pytest (endpoint) + e2e (empty state, populated dot-plots + focal diamond, dot-click
  refocus, mobile). Branch continues the sector-app (Phase 1 = sector-app-shell 3e4bfc6).
