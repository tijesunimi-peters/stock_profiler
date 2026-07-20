# 4 — QA Report: Balance-sheet visualizations

**Task slug:** `balance-sheet-viz`
**Branch:** `balance-sheet-viz` (uncommitted)
**Verdict:** ✅ **PASS** — all 18 acceptance criteria met; honesty contract verified independently.
**Date:** 2026-07-20

## How I verified
- **pytest (Docker):** `docker compose --profile test run --rm test` → **431 passed, 6 skipped**
  (baseline 411 + 20 new in `tests/test_balance_viz.py`).
- **Live endpoints (Docker api :8000):** recomputed the honesty math from raw JSON for AAPL &
  WMT — did **not** trust the server's own flags.
- **e2e headless (Docker):** `docker compose --profile e2e up --exit-code-from e2e` →
  **HEADLESS CHECK: PASS, errors=0** on all 17 pages incl. both balance-chart pages and the
  (unaffected) income viz. Eyeballed `data/e2e-shots/statements-balance-chart*.png` and
  `negeq-trend.png`.
- **Diff review:** +1036 / −48 across 7 files; scanned for null→0 coercion and pct clamping.

## Per-AC verdict

| AC | What | Verdict | Evidence |
|----|------|---------|----------|
| AC-1 | Table/Chart toggle on Balance, chart renders AAPL/WMT no errors | ✅ | e2e both pages errors=0; screenshot shows toggle (default Table) + 3 cards |
| AC-2 | Period change re-renders #4/#1; trend #2 period-independent | ✅ | `wireStmtViewToggle` re-renders on re-entry in chart mode; `vizKey=statement\|year\|period`, series cached period-independent |
| AC-3 | Charts only on Balance (+Income); cash flow/segments table-only | ✅ | Guard `company.js:1183` returns `tableInner` unless income\|balance |
| AC-4 | Trend segments normalized to reported financing total | ✅ | AAPL 6/6 & WMT 6/6 periods `pct_sum == 1.0` |
| AC-5 | No double-count; residual sole balancer, labeled | ✅ | kinds=[liabilities,equity] (two-way); residual only when real; `test_series_two_way…`, `…residual_when_total_exceeds…` |
| AC-6 | Missing-total period → gap, not 0%/100% bar | ✅ | `test_series_gappy_period…` (available=false, empty segments); frontend draws `n/a` slot |
| AC-7 | Segments labeled + non-hue encoding | ✅ | Legend (Liabilities=ink, Equity=accent), 100% dashed ref line; screenshot |
| AC-8 | NWC = CA − CL, signed | ✅ | Recomputed: AAPL −$23.405B, WMT −$15.538B, both `NWC == CA-CL` True |
| AC-9 | Missing current total → unavailable naming it, not summed | ✅ | `test_working_capital_unavailable_when_current_total_missing` |
| AC-10 | Component residual labeled; null never 0 | ✅ | Live: residuals `"Other / unmapped"` (concept/tag null); `test_working_capital_null_component_stays_null` |
| AC-11 | Matrix segments sized by value; null omitted not 0-height | ✅ | Segments = present leaves; `test_matrix_asset_segments_are_leaves_plus_residual` |
| AC-12 | Both reported totals shown; reconciliation surfaced, not forced | ✅ | Recomputed delta == reported (0.0), `balanced` correct; columns keep own totals; `test_matrix_discrepancy_surfaced_not_forced` |
| AC-13 | Side residual labeled; missing required total → unavailable | ✅ | Live residuals labeled; `test_matrix_unavailable_when_total_assets_missing`, `…no_financing_total` |
| AC-14 | Caveats on charts incl. instant-snapshot | ✅ | Live `caveats` len=5 incl. "instant snapshot"; footer in screenshot |
| AC-15 | Same normalized values, no re-derivation | ✅ | Helpers read `StatementLine.value` only; frontend draws JSON verbatim |
| AC-16 | No console errors, theme-aware, table/audit/raw-JSON + income viz unaffected | ✅ | e2e errors=0 on every page incl. income-chart, statements-balance (audit toggle), company |
| AC-17 | pytest green (+ helper coverage) | ✅ | 431 passed (+20) |
| AC-18 | Docker e2e passes balance chart view | ✅ | HEADLESS CHECK: PASS |

## Honesty contract (independently confirmed)
- **Never null→0:** live working-capital components carry real values; residuals labeled;
  null-preservation unit-tested. Diff scan found no data-value `|| 0` (the one `|| 0` at
  `app.js:3271` is a y-axis extent fallback, not a rendered value).
- **Residual = sole balancer, labeled, distinct:** `sum(segments) == reported_total` exactly for
  both AAPL & WMT sides; residual `kind="residual"`, `canonical_concept=null`, `source_tag=null`,
  rendered accent-wash + dashed.
- **Reconciliation surfaced, not forced:** recomputed `total_assets − liabilities_and_equity`
  equals the reported `reconciliation_delta`; `balanced` matches; the discrepancy path keeps both
  columns' reported totals (unit test) — no rescaling.
- **Contra-assets excluded:** `accumulated_depreciation`/`ppe_gross`/`allowance_for_doubtful_accounts`
  absent from matrix asset segments (live check True; `test_matrix_excludes_contra_assets…`).
- **Negative equity unclamped:** `negeq-trend.png` (synthetic series through the **production**
  `capitalStructureTrend` renderer, 0 console errors) shows equity below the zero line and
  liabilities past 100% against the dashed 100% reference; backend `test_series_negative_equity_pct_unclamped`.
- **`available=false` → reason, not empty chart:** frontend guard clauses render
  `unavailable_reason`; backend availability unit-tested.

## Notes / non-blocking observations
- **Negative-equity real-filer coverage:** verified via a synthetic series through the real
  renderer + backend unit test, because this dev volume has no cached negative-equity ticker
  (HD/MCD/SBUX not ingested). The rendering path is production code; the numbers are synthetic.
  Fully covered, but a live neg-equity filer would be a nice belt-and-suspenders check once the
  data volume grows.
- **WMT financing-side "Other / unmapped" residual** is sizeable (WMT's sparse liability leaves +
  untagged aggregate `Liabilities`). Shown honestly (labeled wash block). **Flagged as a
  mapping-extension candidate** — extend liability-leaf coverage in `normalize/mapping.py` as a
  *separate* task; not a defect here.
- **Single-bar trend** in the e2e screenshots is a fixture artifact (trimmed fixtures carry one FY
  of balance totals); live AAPL/WMT return 6 periods (curl-verified). Not a bug.

## Compliance
- SEC User-Agent + process-wide throttle intact — observed a live **429** during rapid curl
  probing (the throttle working as designed). No rate-limiter changes. No new base dependency;
  DuckDB untouched; no raw SQL in the API. Both endpoints on `public_router` (browser-called, no
  key) — consistent with the income viz precedent.

## Handoff → DevOps
**Ready to deploy** (operator-gated). Full-stack change complete on branch `balance-sheet-viz`,
uncommitted: 431 pytest green, e2e PASS with 0 console errors, all 18 ACs met, honesty contract
independently verified. A green QA report unlocks a deploy *request* — not the deploy itself.
Operator's next options: commit the branch, then request a deploy (`/devops-engineer`).
