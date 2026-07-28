# e2e baseline on `master` (commit 02a76c9) — captured 2026-07-27, BEFORE any P4 code

Captured per AC-28 so the criterion is **measured, not asserted**. Grep BOTH `errors=` and
`FAILED` — a shot that throws prints `FAILED`, not `errors=N`, so an errors-only filter hides it.

```
shots rendered or failed : 37
shots that THREW (FAILED): 0
shots with errors > 0    : 2
verdict                  : HEADLESS CHECK: FAIL
```

## The only two shots with errors (pre-existing, NOT P4's)

| shot | errors |
|---|---|
| sectorapp-company | 8 |
| sectorapp-company-refocus | 14 |

Cause: CIK-900001 502s on the synthetic fixture. Count drifts run to run (8 and 12–14 recorded
previously; this run: 8 and 14). **P4 passes AC-28 if it introduces no NEW failing shot and no
shot moves from 0 errors to >0.**

## Full shot roster at baseline
```
[company] 0
[company-path-view] 0
[company-path-unknown] 0
[sectors-path-group] 0
[shell-drawer-narrow] 0
[statements-balance] 0
[statements-income] 0
[statements-income-chart] 0
[statements-income-chart-wmt] 0
[statements-balance-chart] 0
[statements-balance-chart-wmt] 0
[statements-cashflow-chart] 0
[statements-cashflow-chart-wmt] 0
[statements-segments] 0
[trend] 0
[institutional] 0
[institutional-nolocation] 0
[manager] 0
[compare] 0
[trajectories] 0
[screen] 0
[coverage] 0
[components] 0
[sectorapp] 0
[sectorapp-decomp] 0
[sectorapp-dist-all] 0
[sectorapp-qual] 0
[sectorapp-insider-na] 0
[sectorapp-filings] 0
[sectorapp-company-default] 0
[sectorapp-company] 8
[sectorapp-company-refocus] 14
[sectorapp-company-trend] 0
[sectorapp-compare] 0
[sectorapp-compare-nab] 0
[sectorapp-compare-na] 0
[sectorapp-compare-pin] 0
```
