# Active delivery task
task_slug: balance-sheet-viz
request: Add three balance-sheet visualizations to the company hub balance-sheet view, in order — (2) 100% stacked Capital-Structure Trend bar (liabilities/debt vs equity mix, multi-period); (4) Net Working Capital Bridge (current assets vs current liabilities); (1) Structural Comparison Columns / Balance Matrix (single-period Assets vs Liabilities+Equity, with totals reconciliation as honesty check). Track-1, no new ingest, mock-first.
branch: balance-sheet-viz
next_stage: done
qa_cycles: 0
updated: 2026-07-20

## Follow-up change (post-QA, operator-requested 2026-07-20) — DONE
- Balance Matrix (#1) now renders as a 2-COLUMN TABLE ("Assets" | "Liabilities & Equity")
  instead of the stacked-bar chart; trend (#2) + working-capital (#4) unchanged. Frontend-only:
  balanceMatrix() rewritten to DOM table in app.js + .bmatrix styles in company.css. Same
  endpoint/JSON. Honesty held: residual row distinct (accent-wash+dashed+italic), bold reported
  total, ✓ balances / signed delta note, null never 0, negative signed (AAPL financing residual
  renders ($18.2B)). e2e PASS 0 errors; eyeballed AAPL + WMT (WMT $37.1B residual = a clear
  labeled row). -> 3-implementation.md §3c. Uncommitted.

## Progress
- [x] 1 Product Manager       -> 1-brief.md
- [x] 2 Principal Architect   -> 2-architecture.md  (FULL-STACK: backend then frontend)
- [x] 3 Backend  (schema +9 models, viz.py balance_viz + capital_structure_series, 2 public
      endpoints /statements/balance/viz + /viz-series, tests/test_balance_viz.py) -> 3-implementation.md §3a
      (431 passed +20; AAPL+WMT driven live, matrix reconciles delta=0, series sums to LE)
- [x] 3 Frontend (P.capitalStructureTrend + workingCapitalBridge + balanceMatrix; toggle→balance)
      -> 3-implementation.md §3b (e2e PASS 0 errors; mock signed off AAPL clean + WMT derived-liab
      + neg-equity unclamped; vizCache keyed by statement; NWC/reconciliation/residual honest)
- [x] 4 QA Tester             -> 4-qa.md  (PASS — all 18 ACs)
- [x] Follow-up: Frontend (balanceMatrix -> 2-col table) -> 3-implementation.md §3c (e2e PASS,
      AAPL+WMT eyeballed, honesty held)

## Notes / open loops
- ARCH DECISIONS: OD-1 two-way Liabilities-vs-Equity trend (signed equity, no clamp, no double-
  count). OD-2 second endpoint /statements/balance/viz-series (full-history cache-aside, FY,
  limit=6, one server helper). OD-3 one Equity block. RISK-2 reconcile A=total_assets vs
  LE=liabilities_and_equity, balanced=|delta|<=max(1,0.005*A), derived-LE fallback, missing→
  available=False, NEVER rescale. RISK-3 contra concepts (allowance/accum_deprec/ppe_gross)
  EXCLUDED from matrix (use net leaves), negative equity kept signed everywhere.
- Leaf-not-subtotal rule (income double-count guard applied to BS): segments = leaf lines;
  subtotals only as reported-total + residual base. Residual label "Other / unmapped".
- Mock-first gate before finishing frontend: AAPL (clean) + a negative-equity/buyback filer
  (verify equity<0 renders truthfully, unclamped) + WMT (residual/coverage). Per
  [[feedback-viz-mock-before-build]].
- Precedent to mirror: income-statement-viz (viz.py income_viz, /statements/income/viz,
  P.incomeBridge/commonSizeChart, wireStmtViewToggle). vizCache key MUST include statement.
- BACKEND DONE. Contract (full detail in 3-implementation.md §3a):
  GET /v1/companies/{symbol}/statements/balance/viz?year=&period= -> BalanceSheetViz
    {matrix{available, assets/financing sides{segments[],reported_total,reported_total_concept},
     reconciliation_delta, balanced, reconciliation_note}, working_capital{available,
     current_assets, current_liabilities, net_working_capital(SIGNED), asset/liability_components[]},
     caveats[]}. Public router, no key.
  GET /v1/companies/{symbol}/statements/balance/viz-series?period=FY&limit=6 -> CapitalStructureSeries
    {periods[](OLDEST->NEWEST){available, financing_total, segments[]{kind:liabilities|equity|
     residual, value, pct}}, caveats[]}.
  FRONTEND CONTRACT NOTES: null value stays null NEVER 0; residual "Other / unmapped" is sole
  balancer (segments sum to reported_total); pct NOT clamped (neg-equity: equity pct<0,
  liabilities pct>1 -> render truthfully); available=false -> render reason, not empty axis.
  vizCache key must include statement; series caches under statement+"|series".
- FINDING (resolved backend): WMT never tags aggregate Liabilities -> series derives liabilities
  = reported LE - reported equity (identity, residual=0). Not hidden; mock/QA aware.
- DONE — QA PASS on all 18 ACs (docs/delivery/balance-sheet-viz/4-qa.md). 431 pytest (+20),
  e2e PASS 0 console errors. Honesty independently verified: matrix segments sum to reported_total
  exactly (AAPL+WMT), delta recomputed==reported & balanced, contra excluded, NWC=CA-CL signed,
  series pct sums to 1 (AAPL 6/6, WMT 6/6 via derived liabilities), residual "Other/unmapped" sole
  balancer labeled, neg-equity unclamped (negeq-trend.png). Label-clip fixed (marginLeft 128).
  All work UNCOMMITTED on branch balance-sheet-viz.
- Non-blocking follow-ups (separate tasks, NOT this one): (1) extend liability-leaf coverage in
  normalize/mapping.py — WMT's financing-side "Other/unmapped" residual is sizeable; (2) live
  neg-equity filer render check once data volume grows (HD/MCD/SBUX not ingested in dev volume).
- Operator's next: commit branch + request deploy (operator-gated /devops-engineer).
- New run. Charts scoped in prior chat against normalize/mapping.py; all three use only
  existing canonical concepts (cash_and_equivalents, accounts_receivable, inventory, ppe_net,
  goodwill, intangible_assets, total_current_assets, total_assets, accounts_payable,
  debt_current, long_term_debt, total_current_liabilities, total_liabilities,
  stockholders_equity). No new ingest. Track 1 only.
- Precedent: income-statement-viz just shipped the same pattern (tested normalize/viz.py helper
  + derived /statements/.../viz endpoint + thin Plot renderer, Table/Chart toggle). Reuse it.
- Honesty hazards to carry: remainder/coverage dominance (residual = mapping gap, not truth),
  never render a missing value as 0, totals reconciliation (Assets vs Liab+Equity) is a real
  checkable invariant to surface.
