# 3 — Implementation (Backend): Income-statement viz endpoint

**Task slug:** `income-statement-viz`
**Stage:** Senior Backend Engineer → Senior Frontend Engineer
**Branch:** `income-statement-viz`
**Depends on:** `2-architecture.md`
**Date:** 2026-07-20

## What shipped (backend, B1–B4)

- **`src/secfin/normalize/schema.py`** — six derived Pydantic models: `IncomeBridgeStep`,
  `IncomeBridge`, `CommonSizeLine`, `CommonSize`, `IncomeStatementViz` (and the composition).
- **`src/secfin/normalize/viz.py`** (new) — `income_viz(stmt: Statement) -> IncomeStatementViz`,
  pure/no-I/O. Anchor-segmented waterfall + 100% common-size, with the residual as the ONLY
  balancer. Domain tables live here (`_ANCHORS`, `_SEGMENT_COMPONENTS`, `_CONTRIBUTION_SIGN`,
  `_MONETARY_INCOME_CONCEPTS`, `INCOME_VIZ_CAVEATS`).
- **`src/secfin/api/routes.py`** — new public route
  `GET /v1/companies/{symbol}/statements/income/viz?year=&period=` → `IncomeStatementViz`.
  Reuses `_cik_from_symbol` + `_statement_facts_for_cik` (identical cache-aside path) +
  `build_statement`; no raw SQL, no new SEC load pattern, no DuckDB.
- **`tests/test_income_viz.py`** (new) — 13 unit tests. Full suite: **411 passed, 6 skipped**
  (was 398 → +13). Lint clean (ruff `E,F,I,UP`; the route's `Query`/`Depends` B008 matches the
  71 pre-existing in `routes.py` — the file's established FastAPI idiom).

## The JSON contract (what the frontend consumes)

`GET /v1/companies/{symbol}/statements/income/viz?year=2025&period=FY`
(`symbol` accepts a ticker **or** a bare CIK). Response `IncomeStatementViz`:

```jsonc
{
  "cik": 320193, "fiscal_year": 2025, "fiscal_period": "FY",
  "period_start": "2024-09-29", "period_end": "2025-09-27",
  "form": "10-K", "filed": "...", "accession": "...",
  "bridge": {
    "available": true,
    "unavailable_reason": null,
    "net_income": 112010000000.0,            // reconciliation target
    "steps": [
      { "kind": "anchor", "canonical_concept": "revenue", "label": "Revenue",
        "value": 416161000000.0, "direction": "base",
        "running_total": 416161000000.0, "unit": "USD",
        "source_tag": "RevenueFromContract...", "is_extension": false },
      { "kind": "flow", "canonical_concept": "cost_of_revenue", "label": "Cost Of Revenue",
        "value": 220960000000.0, "direction": "down",
        "running_total": 195201000000.0, "unit": "USD", "source_tag": "CostOfRevenue", "is_extension": false },
      // ... anchors: gross_profit, operating_income, income_before_tax, net_income
      // residual steps (when a segment doesn't reconcile) look like:
      // { "kind": "residual", "canonical_concept": null, "label": "Other / unattributed",
      //   "value": 26097.0, "direction": "down"|"up", "running_total": ...,
      //   "unit": "USD", "source_tag": null, "is_extension": null }
    ]
  },
  "common_size": {
    "available": true, "unavailable_reason": null, "revenue": 416161000000,
    "lines": [
      { "canonical_concept": "revenue", "label": "Revenue", "value": 416161000000,
        "pct_of_revenue": 1.0, "source_tag": "...", "is_extension": false },
      { "canonical_concept": "cost_of_revenue", ..., "pct_of_revenue": 0.5309, ... },
      // a null line: "value": null, "pct_of_revenue": null   (NEVER 0)
    ]
  },
  "caveats": ["Sourced from SEC EDGAR ...", "Derived presentation view ...", "The waterfall bridges ..."]
}
```

### How to render each field (so the frontend never re-derives sign)
- **Bridge steps are ordered top-to-bottom** (revenue → net income). Draw in array order.
- `kind="anchor"` (`direction:"base"`): a solid column from **0 to `running_total`** (this is a
  reported subtotal — revenue, gross_profit, operating_income, income_before_tax, net_income).
- `kind="flow"`: a **floating** bar. `value` is the magnitude; `direction` (`up`/`down`) says
  whether it rose or fell the running total. The bar spans `[running_total_before, running_total]`
  — `running_total_before` = the previous step's `running_total`. So a `down` bar floats below the
  running line, an `up` bar above. No hue needed for sign.
- `kind="residual"` (`label:"Other / unattributed"`, `source_tag:null`): a floating bar like a
  flow step, but style it as **computed, not reported** (accent-wash + dashed/outlined per the
  design). Always label it.
- `available:false` → render the `unavailable_reason` string as the card body; **do not** draw a
  partial bridge.

## Verification (evidence)

- `docker compose --profile test run --rm test` → **411 passed, 6 skipped**.
- **Drove the real route** (TestClient over the seeded AAPL fixture, by CIK 320193, FY2025):
  - `bridge.available=true`, final `running_total == net_income` (112,010,000,000) — **reconciles**.
  - **Double-count disambiguation confirmed live:** `operating_expenses` (present, 14.9% of revenue
    in common-size) was **dropped from the bridge walk**; only R&D (8.3%) + SG&A (6.6%) = 14.9% were
    walked, and the bridge still landed exactly on net income.
  - `nonoperating_income_expense` reported as a net **expense** (−321M): flowed `down`, and shows
    −0.1% in common-size — sign preserved end-to-end.
  - `common_size.available=true`, revenue base 416,161M, all pct = value/revenue.

## ⚠️ Handoff notes for the Senior Frontend Engineer (read before the mock)

1. **The common-size lines are INDEPENDENT ratios, not a partition that sums to 100%.** The
   response deliberately includes BOTH aggregates and their parts (e.g. `operating_expenses` 14.9%
   AND `research_and_development` 8.3% + `sga_expense` 6.6%, which overlap). **A single 100%-stacked
   bar that naively stacks every line would double-count and exceed 100%.** Two honest options
   (resolve in the mock, per F0):
   - **(recommended) small-multiple of horizontal bars** — one bar per line, each `|pct|` wide
     against a shared 0–100% axis (independent ratios, no false partition); or
   - a true stacked 100% bar built from a **non-overlapping subset only** (e.g.
     cost_of_revenue + the opex parts + tax + net_income, excluding the gross_profit/
     operating_income/income_before_tax subtotals and the `operating_expenses` aggregate).
   Do **not** stack aggregates and parts together. This is the single biggest correctness trap on
   the frontend side.
2. **The bridge already handles the opex double-count** (drops `operating_expenses` when R&D/SG&A
   present) — but that logic is only in the *bridge*, not in `common_size.lines`. So point (1) is
   the frontend's responsibility for the common-size chart.
3. **AAPL reconciles cleanly (no residual step).** To see/screenshot a real residual for the mock,
   you'll want a ticker/period whose mapped components don't sum to a subtotal — or eyeball the
   unit-test fixtures in `tests/test_income_viz.py::test_residual_step_labeled_and_only_balancer`
   for the exact shape. Watch RISK-2: a large residual = a mapping gap, flag it, don't hide it.
4. `value` on every step/line is **already the display magnitude**; use the app's existing abbrev
   formatter for labels so chart figures match the table (AC-13). `running_total` can be negative
   (a loss-making period) — the anchor column and axis must handle negatives.
5. Endpoint is on `public_router` (same as `/statements/{statement}`) — reachable from browser JS
   with no API key, exactly like the statement table. Lazy-fetch it on first Chart-toggle per period.

## Next: Senior Frontend Engineer (F0–F3 on this same branch)

Mock-first gate first (F0): render AAPL FY2025 + one more shape, get framing sign-off (watch
remainder dominance + the common-size partition trap above), then build `ClearyFi.incomeBridge()` /
`ClearyFi.commonSize()` in `app.js` and the Table/Chart toggle in `company.js`.

---

# 3b — Implementation (Frontend): income-statement chart view

**Stage:** Senior Frontend Engineer → QA Tester
**Branch:** `income-statement-viz` (same branch, continued)
**Date:** 2026-07-20

## What shipped (frontend, F0–F3)

- **`src/secfin/api/static/app.js`** — two new `ClearyFi.*` Plot builders + a shared short-label map:
  - `ClearyFi.incomeBridge(bridge, opts)` — the waterfall. Anchors = solid **ink** columns from 0
    (reported landmarks); flows = floating **terracotta** bars (up/down encoded by where the bar
    floats, **no green/red**, §10); residual = **accent-wash + dashed** bar, always labeled
    "Other / unattributed". On-bar value labels; tooltip carries full label + running total. An
    `available:false` bridge renders an honest "Bridge unavailable — {reason}" card, not a partial
    chart. A `.note()` explains the dashed residual when present.
  - `ClearyFi.commonSizeChart(common, opts)` — **small-multiple horizontal bars** (one per line ÷
    revenue), deliberately NOT a stacked 100% bar (avoids the aggregate+parts double-count — see
    §handoff-1). Null-value lines render an explicit **"N/A"** marker at 0, never a 0% bar (AC-9).
    Negatives extend left of 0 (AC-11). `available:false` → "Common-size unavailable — {reason}".
  - `INCOME_SHORT_LABEL` / `incomeShortLabel()` — compact axis-tick labels (full label stays in
    tooltips) so 10–14 rotated waterfall ticks and the common-size y-axis stay legible. A real
    concept missing from the map falls back to its real API label, **never** to "Other".
- **`src/secfin/api/static/company.js`** — a **Table / Chart** segmented toggle, rendered **only for
  the income statement** (balance/cash flow keep the table-only view — AC-3). Defaults to **Table**
  (audit-first). Chart mode lazily fetches `/statements/income/viz` for the current period, caches
  it per `year|period` in `state.vizCache`, and renders the two cards + the joined `caveats` as a
  `.caveat` line. Changing the period re-renders the charts against that period (AC-2). The existing
  table, "Show your work" audit toggle, and raw-JSON toggle are untouched.
- **`src/secfin/api/static/company.css`** — `.stmt-view-toggle` (reuses `.toggle-btn` /
  `aria-pressed` accent-fill for the active segment).
- **`scripts/headless_check.js`** — two new e2e scenarios exercising the Chart view for two shapes
  (`statements-income-chart` = AAPL, `statements-income-chart-wmt` = WMT).

## Verification (evidence)

- `docker compose build api` then `docker compose --profile e2e up --abort-on-container-exit
  --exit-code-from e2e` → **exit 0; all 15 pages, 0 console errors** (incl. both new chart
  scenarios). Screenshots in `data/e2e-shots/statements-income-chart.png` (AAPL) and
  `statements-income-chart-wmt.png` (WMT).
- **Eyeballed both screenshots** (mock-first framing sign-off):
  - **AAPL FY2025** — clean bridge, no residual (reconciles): Revenue $416.2B → … → Net Income
    $112.0B. Double-count handled: `operating_expenses` absent from the bridge, present at 14.9% in
    common-size. Common-size independent bars, revenue 100%, note explains non-summing.
  - **WMT FY2026** — the **residual path**: WMT reports no gross_profit, so the bridge shows three
    dashed "Other / unattributed" bars (+$6.8B, −$481.0M, −$377.0M) and still lands exactly on Net
    Income $21.9B. Exactly the honest behavior the design intends.
  - No remainder/coverage dominance problem; labels legible after the short-label pass.
- One Plot gotcha hit and fixed during the mock: a **function** passed to a text mark's
  `dx`/`textAnchor` stringifies to `NaN` (documented in `divergingBars`) — split the common-size
  percent labels into constant-anchor pos/neg marks.

## Notes / no-dark-theme

This app has **no dark mode** (no `prefers-color-scheme`/`data-theme` block anywhere in `static/`);
the data pages commit to a single light look, as do all existing charts. The builders read tokens
via `cssVar`/`plotTokens`, staying in lockstep with that single theme — nothing to verify for dark.

## For QA to probe

- **AC-3:** toggle appears only on income; confirm Balance & Cash Flow tabs show table-only (no
  toggle), unchanged.
- **AC-2:** switch period while in Chart mode → both charts re-render for the new period (per-period
  cache; no stale chart).
- **AC-9/AC-11:** a period/filer with a null monetary line → "N/A" marker (never 0%); a negative
  non-operating line → bar left of 0 (AAPL "Non-op." shows −0.1%).
- **AC-6 / availability:** the unavailable states are hard to hit on the seeded fixtures (AAPL/WMT
  both reconcile with full anchors); the backend unit tests cover the logic
  (`tests/test_income_viz.py`). Worth a note that the UI path renders the reason string, not a
  partial chart, when `available:false`.
- Minor cosmetic: on a tiny negative common-size line (e.g. −0.1%), the % label sits close to the
  y-axis tick — legible, but flag if you consider it a collision.
- `pytest` unchanged this stage (no Python touched) — still 411 passed from the backend stage.
