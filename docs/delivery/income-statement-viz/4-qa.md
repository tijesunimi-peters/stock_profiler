# 4 — QA Verdict: Income-statement visualizations (Waterfall + 100% common-size)

**Task slug:** `income-statement-viz`
**Branch:** `income-statement-viz`
**Stage:** QA Tester → (gate)
**Date:** 2026-07-20
**Verdict:** ✅ **PASS** — ready to deploy (deploy remains operator-gated).

## How verified

1. **Full suite** — `docker compose --profile test run --rm test` → **411 passed, 6 skipped**
   (was 398 pre-change; +13 in `tests/test_income_viz.py`).
2. **e2e headless render** — `docker compose --profile e2e up --abort-on-container-exit
   --exit-code-from e2e` → **exit 0; all 15 pages, 0 console errors**, incl. the two new chart
   scenarios (`statements-income-chart` AAPL, `statements-income-chart-wmt` WMT).
3. **Independent endpoint drive** (QA's own harness, NOT the shipped tests) — hit
   `/statements/income/viz` for **AAPL (6 periods) + WMT (5 periods) = 11 filings**, and for each
   independently recomputed the checks below. All 11 passed. (Note: the harness initially tripped
   the keyless per-IP rate limiter — 429s — which is the API's own protection working; re-run paced
   at 0.8s/req for full coverage.)
4. **Eyeballed** both chart screenshots (`data/e2e-shots/statements-income-chart*.png`).
5. **Diff review** (8-angle `code-review`, high) — no correctness bugs; 1 low-severity latent
   robustness note (below).

## Acceptance criteria — pass/fail

| AC | Verdict | Evidence |
|----|---------|----------|
| AC-1 reachable on income Statements tab, renders | ✅ | e2e `statements-income-chart` rendered AAPL FY2025 Chart view, 0 errors; screenshot shows both cards. |
| AC-2 period change re-renders both charts | ✅ | Per-period `state.vizCache`; `wireStmtViewToggle` re-draws on re-entry. Verified logic + independent harness rendered every period distinctly. |
| AC-3 income-only (balance/cashflow unchanged) | ✅ | Toggle rendered only for income; `statements-balance` e2e unchanged (0 errors, no toggle). Independent check: `GET /statements/balance/viz` → **404** (income-only endpoint). |
| AC-4 waterfall reconciles to reported net income | ✅ | **Independently recomputed final running_total vs net_income across all 11 filings — abs diff < $1 every time.** AAPL FY2025 → $112.0B; WMT FY2026 → $21.9B. |
| AC-5 residual = only balancer, labeled "Other / unattributed" | ✅ | WMT (no gross_profit) shows 3 dashed residual bars; every residual step has `label="Other / unattributed"` and `source_tag=null`; flow steps unaltered. Backend `test_residual_step_labeled_and_only_balancer`. |
| AC-6 missing required anchor → unavailable, not partial | ✅ | Backend `test_missing_required_anchor_unavailable` (drop revenue, then net_income → `available:false`, `steps=[]`, reason names the anchor); FE renders the reason string, not a chart. (Fixtures all reconcile, so the UI unavailable path is logic-verified, not visually triggered — acceptable.) |
| AC-7 anchor vs flow vs residual visually distinct + labeled | ✅ | Screenshot: anchors = solid ink columns from 0; flows = terracotta floating bars; residual = accent-wash + dashed. Each labeled with concept + value. Single accent, no green/red (§10). |
| AC-8 common-size pct == value/revenue, matches table | ✅ | **Independently recomputed `value/revenue` for every line across all 11 filings — matched to 1e-9.** Screenshot values match table abbrevs. |
| AC-9 null line → N/A, never 0% | ✅ | Independent harness: every null-value line has `pct_of_revenue is None` (never 0). FE renders a labeled "N/A" marker at 0, never a bar. (No null monetary line on AAPL/WMT fixtures, so the visual N/A marker isn't exercised in the screenshots — logic + backend `test_common_size_null_is_none_not_zero` cover it.) |
| AC-10 no/zero revenue base → unavailable | ✅ | Backend `test_common_size_no_revenue_base_unavailable` (revenue null AND revenue==0 → `available:false`, `revenue:null`, no divide-by-zero). |
| AC-11 negatives represented truthfully | ✅ | AAPL `nonoperating_income_expense` is a net expense: flows **down** in the bridge, shows **−0.1%** in common-size (sign preserved, not abs()'d). Backend `test_signs`. |
| AC-12 charts carry the shared caveat | ✅ | 3 `caveats` present on every one of 11 filings; FE renders them as a `.caveat` block under both cards + per-card notes. Screenshot confirms. |
| AC-13 chart figures == table abbreviated values | ✅ | FE reuses the same server values via `usd`/`fmt.pct` (no re-derivation); AAPL Revenue $416.2B, Net Income $112.0B match the table. |
| AC-14 0 console errors; toggles intact | ✅ | e2e 0 console errors; Table/audit/JSON toggles untouched (inside `tableInner`). (No dark theme exists in this app — light-only, like all charts; N/A.) |
| AC-15 pytest green (398+); residual + missing-anchor covered | ✅ | 411 passed; `tests/test_income_viz.py` 13 tests incl. residual, missing-anchor, opex double-count, signs. |
| AC-16 e2e render check passes for chart view | ✅ | exit 0; both chart scenarios rendered 0 errors. |

## Honesty contract

- **Reconciliation is exact, never fudged** — independently verified on 11 real filings; the
  residual is the sole balancer and is explicitly labeled with null provenance.
- **Double-count handled** — `operating_expenses` dropped from the bridge walk when R&D/SG&A
  present (AAPL: absent from bridge, present at 14.9% in common-size); confirmed in screenshot +
  `test_opex_double_count_dropped`.
- **No missing value shown as 0** — null → `None`/"N/A", verified independently.
- **Derived + caveated** — endpoint docstring + response caveats label it a derived presentation
  view; per-share/ratio concepts excluded from both views.
- **Compliance** — no SEC client change, no new base dependency, no raw SQL in the API (reuses
  `_statement_facts_for_cik` + `build_statement`), CIK passed as `int`, single-process safe.

## Non-blocking finding (from the diff review)

- **[low, latent] `app.js` commonSizeChart row filters** assume the server invariant *value-null ⟺
  pct-null*. `bars` filters on `pct_of_revenue`, `naRows` on `value`; if the backend ever returned
  a line with a value but null pct, that line would occupy a blank y-axis row (no bar, no N/A).
  **Not currently triggerable** — `normalize/viz.py` guarantees `pct is None iff value is None`. A
  belt-and-suspenders fix (filter `naRows` on `pct_of_revenue` too) would harden it, but it is not
  a defect against any reachable state. Does not block.

## Handoff → DevOps (operator-gated)

**Ready to deploy.** The branch `income-statement-viz` is green on pytest (411) and e2e (exit 0),
with the honesty contract independently verified on real filings. All work is **uncommitted** on
the branch. Operator's next options: commit the branch, then request a deploy (`/devops-engineer`).
No migration, no backfill, no config change required — the endpoint is read-only over the existing
cache-aside facts path.
