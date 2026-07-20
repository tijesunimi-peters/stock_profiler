# Active delivery task
task_slug: income-statement-viz
request: Add Waterfall (revenue→net income bridge, w/ explicit Other-unattributed bucket) and 100% common-size horizontal bar to the company hub Statements tab (income statement); honesty guardrails, Track-1 only, mock-first.
branch: income-statement-viz
next_stage: done
qa_cycles: 0
updated: 2026-07-20

## Progress
- [x] 1 Product Manager       -> 1-brief.md
- [x] 2 Principal Architect   -> 2-architecture.md  (FULL-STACK: backend then frontend)
- [x] 3 Backend  (normalize/viz.py + schema + /statements/income/viz endpoint)  -> 3-implementation.md
      (411 passed +13; endpoint driven live on AAPL FY2025, reconciles; double-count drop confirmed)
- [x] 3 Frontend (ClearyFi.incomeBridge + commonSizeChart in app.js; Table/Chart toggle)  -> 3-implementation.md §3b
      (e2e exit 0, 0 console errors; mock eyeballed AAPL clean + WMT residual path; label pass done)
- [x] 4 QA Tester             -> 4-qa.md  (PASS — all 16 ACs)

## Notes / open loops
- DONE — QA PASS on all 16 ACs (docs/delivery/income-statement-viz/4-qa.md). Reconciliation
  INDEPENDENTLY verified on 11 real filings (AAPL 6 + WMT 5); residual = sole balancer labeled
  "Other / unattributed"; opex double-count dropped from the walk; null→N/A never 0. 411 pytest,
  e2e exit 0. One NON-BLOCKING latent finding (commonSizeChart row filters assume value-null⟺
  pct-null; backend guarantees it). All work UNCOMMITTED on branch income-statement-viz.
  Operator's next: commit + request deploy (operator-gated).
- Architecture decision: honesty math (bridge residual + common-size) lives in a tested
  normalize/viz.py helper + a derived GET /statements/income/viz endpoint; frontend is a thin
  Plot renderer. Anchor-segmented bridge always reconciles to reported net income; residual =
  the ONLY balancer, labeled "Other / unattributed".
- Known hazards for the mock (RISK-1/2/3): remainder dominance (COGS), large residual = mapping
  gap not truth, opex double-count (drop operating_expenses when R&D/SG&A present).
- Presentation surface (OD-1): Table/Chart toggle on income view only, defaults to Table.
- Palette constraint: single terracotta accent, NO green/red — waterfall encodes up/down by
  position (floating bars), not hue; residual = accent-wash + dashed.
- BACKEND DONE. Contract: GET /v1/companies/{symbol}/statements/income/viz?year=&period= ->
  IncomeStatementViz {bridge{available,net_income,steps[]}, common_size{available,revenue,lines[]},
  caveats[]}. Public router, no key. Steps ordered top->bottom; kind=anchor(base col from 0)/
  flow(floating, direction up|down)/residual(Other/unattributed, source_tag=null).
- FRONTEND TRAP (in 3-implementation.md §handoff-1): common_size.lines are INDEPENDENT ratios
  incl BOTH aggregates AND parts (operating_expenses AND R&D+SG&A) -> do NOT naive-stack into one
  100% bar (double-counts). Use small-multiple bars, or a non-overlapping subset. Bridge already
  drops the opex aggregate; common_size does NOT.
