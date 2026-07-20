# Active delivery task
task_slug: cashflow-viz
request: Add cash-flow statement visualizations to the company hub Statements→Cashflow tab (Table/Chart toggle), mirroring income + balance-sheet viz. Three views — (1) Cash Bridge waterfall Beginning→CFO→CFI→CFF→FX→Ending (identity-reconciled, single explicit residual); (2) FCF breakdown multi-period grouped columns OCF vs CapEx vs FCF(=CFO−CapEx); (3) Earnings-quality combo multi-period Net Income vs OCF + cash-conversion line (OCF/NI, cross-statement join). Track-1, no new ingest, mock-first. OUT: Sankey cash pipeline, raw diverging micro-bars.
branch: cashflow-viz (STACKED on balance-sheet-viz, NOT master — master lacks balance_viz/
  capital_structure_series which this feature extends; operator gates merge order at commit)
next_stage: done
qa_cycles: 0
updated: 2026-07-20

## Progress
- [x] 1 Product Manager       -> 1-brief.md (scope gate PASS: Track 1, no new ingest; Sankey +
      micro-bars OUT; 18 ACs incl. identity-reconcile, single residual, cash-basis match,
      FCF=OCF−CapEx N/A-on-missing-capex, OCF/NI nm-on-NI≤0, N/A-never-0)
- [x] 3 Backend -> 3-implementation.md §3a (5 schema models, viz.py cashflow_viz + cashflow_series,
      2 endpoints + _prior_period_balance, tests/test_cashflow_viz.py). 452 passed (+21), 6 skip.
      MOCK-FIRST PASS: bridge residual=0 on AAPL/WMT/JPM (identity holds); AAPL FCF 98.767B conv
      0.995; WMT FCF 14.923B conv 1.90; JPM FCF=None (no capex) conv -2.59. Live endpoints 200 OK.
      Off-by-one fixed (period_start = prior period_end + 1 day → tolerant date match). NOTE for QA:
      trimmed fixtures have 1 FY period each so bridge is RELATIVE (absolute=false) on fixture/e2e
      data; drive a ≥2-FY company on the live Docker volume to confirm absolute=true + matched basis.
- [x] 3 Frontend -> 3-implementation.md §3b (app.js cashFlowBridge + fcfBreakdown + earningsQuality;
      company.js cashflow gating+dispatch+render/paint; headless_check.js +2 pages; no company.css
      change). e2e PASS 0 errors AAPL+WMT; eyeballed both (bridge relative walk reconciled, FCF
      breakdown, earnings-quality NI/OCF + conversion 1.00×/1.90× on dashed 1× line). Bug caught+fixed:
      Plot faceting → single band scale (composite period|metric keys) so the conversion line
      connects + overlay marks position. Axis-label clip fixed. pytest 452 still green.
- [x] 2 Principal Architect   -> 2-architecture.md (FULL-STACK: backend then frontend; no drift)
      KEY DECISIONS: cash basis from change_in_cash.source_tag → cash_and_restricted_cash (modern
      ASU-2016-18 tag) vs cash_and_equivalents (legacy); begin/end from prior+current BALANCE
      statements on matched basis; relative-walk fallback. Cross-stmt join: one _facts_for_cik
      feeds build_statement(cashflow)+build_statement(income) per period, join on fiscal key.
      Bridge endpoint uses _facts_for_cik (FULL history — needs prior-period balance). 5 new
      schema models, viz.py cashflow_viz + cashflow_series, 2 endpoints, tests/test_cashflow_viz.py.
- [ ] 2 Principal Architect   -> 2-architecture.md
- [ ] 3 Backend  (full-stack expected: backend then frontend)
- [ ] 3 Frontend
- [x] 4 QA Tester             -> 4-qa.md (PASS — all 18 ACs; pytest 452, e2e 0 errors; honesty
      contract verified live: AAPL/WMT bridge residual=0 identity, JPM bank FCF=N/A, conversion
      nm/na/ok. 2 non-blocking follow-ups logged. Stray scratch files removed. UNCOMMITTED.)

## Notes / open loops
- New run (operator picked "all three" + "full /deliver pipeline", 2026-07-20).
- Precedent to mirror EXACTLY: income-statement-viz + balance-sheet-viz — tested pure
  normalize/viz.py helpers + derived caveated /statements/{stmt}/viz (+ /viz-series for
  multi-period) endpoints on the public router, thin Observable Plot renderers behind the
  Statements Table/Chart toggle (vizCache key MUST include statement). Reuse wireStmtViewToggle.
- Data is already normalized: STATEMENT_CONCEPTS["cashflow"] has cash_from_operations/investing/
  financing, effect_of_exchange_rate_on_cash, change_in_cash, capital_expenditures,
  depreciation_amortization, dividends_paid, share_repurchases, proceeds_from_*, repayments_of_debt,
  acquisitions_net_of_cash, income_taxes_paid, interest_paid, and working-capital deltas. Net income
  lives on the INCOME statement (concept net_income) — the combo needs a cross-statement read.
- Honesty hazards: (a) bridge residual = mapping/reporting gap, must be single explicit labeled
  term, never a silent plug; CFO+CFI+CFF+FX should = change_in_cash by identity. (b) beginning/
  ending cash come from the balance sheet (cash_and_equivalents / cash_and_restricted_cash) at
  period boundaries — pick one basis consistently; ASU-2016-18 restricted-cash mismatch is a real
  reconciliation risk to surface. (c) capex reported as positive payment; FCF = CFO − CapEx.
  (d) cash-conversion ratio undefined/misleading when NI<=0 — must degrade honestly, not show 0.
  (e) never render a missing value as 0. Per [[feedback-viz-mock-before-build]] validate bridge
  reconciliation + residual-dominance on AAPL + WMT BEFORE the full build.
- OUT (flag, do not build): Sankey cash pipeline (implies complete sources→uses decomposition we
  don't map); raw diverging micro-bars of line items (working-capital deltas carry us-gaap natural
  sign, not cash-flow presentation sign).
