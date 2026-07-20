# Active delivery task
task_slug: sector-overview-dupont
request: Deliverable 1 from docs/ROADMAP_SECTOR_ANALYTICS.md — sector performance overview dashboard home + DuPont (#1). Honor the honesty fixes (asset-weighted aggregate not median; SIC caveats; N/A≠0) and the deferred list.
branch: sector-overview-dupont (off master)
next_stage: done
qa_cycles: 0
updated: 2026-07-20

## Progress
- [x] 1 Product Manager       -> 1-brief.md (scope gate PASS: Track 1, SIC-aggregation is an
      existing batch pattern. 13 ACs incl. per-company DuPont identity, asset-weighted aggregate
      = product-of-drivers, shared-membership rule so N/A≠0 can't break identity, min-size drop,
      "aggregate not median" label, no-alpha/price claim, 1Y/5Y/All trend, batch-only guardrails.)
      OPERATOR DECISIONS: (1) new page + new sidebar "Home"/Sectors entry (script.js GROUPS);
      marketing `/` index UNTOUCHED. (2) NOT single-snapshot — trend chart w/ 1Y/5Y/All ranges,
      so aggregate is a MULTI-PERIOD time series.
- [x] 2 Principal Architect   -> 2-architecture.md (FULL-STACK backend→frontend, no drift.
      KEY: equity_multiplier=avg_Assets/avg_Equity (both AVERAGED) so per-company identity closes;
      aggregate needs DOLLAR components (can't recover from ratios) → 2-table pattern mirroring
      metric_values→metric_ranks. dupont_components() reuses _Ctx (no logic dup); returns None
      unless all 4 present (shared membership). New: metric+extractor (metrics.py), 2 repos
      (dupont_components staging + sector_dupont aggregate), ingest/dupont_backfill (python),
      analytical/sector_dupont (DuckDB ATTACH, sums→ratios, HAVING>=min_size), normalize/sic.py
      static SIC-2 labels, 2 endpoints /v1/sectors + /v1/sectors/{group}, GET /sectors page.
      DuckDB import ONLY in analytical/sector_dupont.py. No mapping.py change (concepts exist).)
- [x] 3 Backend  -> 3-implementation.md §3a. equity_multiplier metric + dupont_components extractor
      (metrics.py); sic.py labels; dupont_components + sector_dupont repos; ingest/dupont_backfill +
      analytical/sector_dupont (DuckDB, identity from sums); schema SectorDupont/List/Series; routes
      _SECTOR_CAVEATS (6) + get_sectors + get_sector_series; main.py wiring + /sectors page route;
      docs. pytest 467 pass (+15), ruff clean (endpoint B008 = existing FastAPI idiom). REAL-DATA
      VERIFY on hydrated backup: 31,248 comp rows, 560 sector rows; per-sector identity <=1.1e-16;
      banks em~11; /v1/sectors 200 FY2025 59 sectors; honest empties; sparse latest reachable.
      KEY REFINEMENTS from verify: (1) latest_fy_year() = latest WELL-COVERED FY (raw MAX=2026 was
      12 sparse sectors -> now 2025, 59). (2) get_series() FY-ONLY (quarterly sparse, would
      double-count). (3) caveat #6 added re near-zero/negative aggregate-equity extremes (SIC 52
      ROE~282% is HONEST + leverage-driven — surface equity_multiplier).
- [x] 3 Frontend -> 3-implementation.md §3b. sectors.html (+vendored Plot/d3) / sectors.js /
      sectors.css; app.js sectorDupontTrend builder (exported); script.js "Overview→Sectors" sidebar
      entry (operator's Home menu; marketing / untouched); seed_fixture _seed_sector_dupont (direct
      write like _seed_peer_ranks so offline e2e renders); headless_check +2 pages. Backend copy
      aligned to Σ/× glyphs. e2e ALL errors=0 (sectors + sectors-expanded); eyeballed both:
      sortable grid + honesty banner + 6-note disclosure; DuPont tree 15.4%=23.3%×0.06××11.00×
      (banks) with =/× operators + plain-English legs + "aggregated over N, not a median"; 1Y/5Y/All
      toggle; ROE trend FY2021-2025. Bug caught+fixed: sectors.html missing vendored Plot -> trend
      threw into the (console-clean) error state -> added d3+plot scripts. pytest 467 still green.
- [x] 4 QA Tester             -> 4-qa.md (PASS — all 13 ACs. pytest 467 pass; e2e all errors=0;
      real-data drive: per-company identity err ≤2.8e-17 on AAPL/WMT/JPM, sector aggregate identity
      ≤1.1e-16, banks em~11-12, honest empties. Honesty verified: aggregate-not-median label, N/A→—
      never 0, extreme ROE (AAPL 171% / SIC-52 282%) honest leverage-driven w/ caveat #6. code-review
      high: 5 findings, ALL low/non-blocking (logged in 4-qa.md). UNCOMMITTED. Deploy needs the batch
      run on prod volume to populate sector_dupont first.)

## Notes / open loops
- DONE 2026-07-20. Green QA. Branch sector-overview-dupont (off master), UNCOMMITTED, NOT deployed.
- Operator next options: (a) commit the branch; (b) request deploy via /devops-engineer (gated) —
  deploy MUST run `python -m secfin.ingest.dupont_backfill` then `python -m secfin.analytical.sector_dupont`
  (analytical extra) on the prod volume, else /sectors honestly shows empty. 5 non-blocking follow-ups
  in 4-qa.md.
- Precedent to mirror: analytical/peer_ranks.py + peer_distribution.py (DuckDB ATTACH TYPE sqlite
  over live SQLite, write back via ordinary SQLite repo; min-size drop; R7 N/A-excluded). New table
  mirrors metric_ranks / metric_distributions.
- HONESTY (roadmap-flagged, non-negotiable): (a) DuPont sector value = asset-weighted aggregate
  ΣNI/ΣRev × ΣRev/ΣAssets × ΣAssets/ΣEquity, NOT median; identity preserved; labeled "sector
  aggregate, not a median." (b) company enters aggregate only if NI+Rev+Assets+Equity all present
  (shared membership) so N/A≠0 can't break identity. (c) reuse _PEER_CAVEATS vocabulary + SIC
  coarse/dated + min-size drop + ~quarter lag + restatement. (d) NO value rendered as 0. (e) NO
  alpha/timing/market-price claim (native strength, not subtraction).
- New metric equity_multiplier (Assets/Equity) basis MUST match roe + asset_turnover so per-company
  identity net_margin×asset_turnover×equity_multiplier=roe holds. Docs: ROADMAP_METRICS.md, DATA_MODEL.md.
- Shared app-shell sidebar rendered from script.js GROUPS[]; data pages use <body class="app"
  data-shell="X"> + #appSide/#appTopbar mounts. Observable Plot already vendored (static/vendor/).
- Architect open decisions: em averaging basis; aggregate point-in-time vs avg; trend granularity
  (FY vs quarterly); SIC digit level (reuse settings.secfin_peer_sic_digits); SIC code→name map?;
  route path (/sectors). Verify needs HYDRATED Docker volume (7.2G backup; data/secfin.db is a stub).
- OUT (deferred, do not build): roadmap #2/#3/#4/#5; no dio/dpo; don't run peer_distribution.py here;
  don't touch marketing `/` landing.
