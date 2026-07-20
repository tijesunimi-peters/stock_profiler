# 2 — Architecture: Balance-sheet visualizations

**Task slug:** `balance-sheet-viz`
**Stage:** Principal Architect → Senior Engineer(s)
**Date:** 2026-07-20
**Brief:** `docs/delivery/balance-sheet-viz/1-brief.md`
**Precedent (reuse verbatim where possible):** `income-statement-viz` —
`src/secfin/normalize/viz.py`, `IncomeStatementViz` schema, `GET /statements/income/viz`,
`P.incomeBridge` / `P.commonSizeChart` in `static/app.js`, the Table/Chart toggle in
`static/company.js` (`wireStmtViewToggle` / `renderStmtCharts` / `paintStmtCharts`).

## Scope re-check (Track 1 — clean)

All three visuals re-shape values already produced by `build_statement(..., "balance", ...)`
from canonical concepts already in the `"balance"` group of `normalize/mapping.py`. **No new
canonical concept, no `mapping.py`/`DATA_MODEL.md` change, no new ingest, no new base
dependency, no raw SQL in the API, no DuckDB.** Nothing measured that isn't already reported.
This is the same "derived presentation view over `build_statement`" shape the income viz
established. Track 1, buildable as-is.

## Data flow (mirrors the income precedent)

```
                 (single period)                         (multi-period series)
browser  ──►  GET /statements/balance/viz          GET /statements/balance/viz-series
             ?year=&period=                         ?period=FY&limit=N
                    │                                        │
 routes.py: _statement_facts_for_cik (1 period)     _facts_for_cik (full history, cache-aside)
                    │                                        │
 build_statement(facts, cik, "balance", y, p)       build_statement per selected FY period
                    │                                        │
 normalize/viz.py:  balance_viz(stmt)               normalize/viz.py: capital_structure_series(stmts)
   → BalanceSheetViz {matrix, working_capital}        → CapitalStructureSeries {periods[]}
                    │                                        │
        Plot renderers in static/app.js  ◄───────────────────┘
   P.balanceMatrix · P.workingCapitalBridge · P.capitalStructureTrend
```

Two endpoints because **#2 is the only multi-period visual** (OD-2). The single-period viz
(matrix + working-capital) is period-scoped exactly like `/statements/income/viz`; the trend
needs the company's history, which the existing `_facts_for_cik` cache-aside path already
serves (it's what `/periods` uses). One server-side helper builds the whole series in one call
— **no N client round-trips** (OD-2 resolved in favor of the PM's lean). All honesty math stays
server-side and unit-tested; the frontend is a thin Plot renderer.

---

## Decisions locked (the brief's open items)

### OD-1 — financing decomposition for the trend (#2): **two-way, Liabilities vs Equity**
Per period the bar is split into exactly two reported segments — `total_liabilities` and
`stockholders_equity` (signed) — normalized to the reported financing total `T`. This is
guaranteed to reconcile and carries **zero double-count risk** (neither segment is a subset of
the other). A debt breakout (`debt_current`+`long_term_debt`) is **not** in v1 — it would make
debt a subset of the liabilities segment and needs an "other liabilities" residual; revisit
only if the mock shows the two-way split is uninformative. **Negative equity is kept signed**
(see RISK-3) — a company with an accumulated deficit legitimately shows equity < 0 and
liabilities > 100% of `T`; the chart must render that truthfully, never clamp.

### OD-2 — series source: **one server-side helper, `capital_structure_series`**
A dedicated `viz-series` endpoint fetches full history once (cache-aside), picks the most
recent `limit` **annual (FY)** periods via `available_periods`, builds a balance statement per
period, and returns the normalized series. Default `limit=6` (matches what the income mock
drew). Quarters excluded in v1 (FY snapshots are the clean trend; a period param allows Q
later).

### OD-3 — equity detail in the matrix (#1): **one Equity block for v1**
The financing column shows liability leaf lines + a single `stockholders_equity` block. No
retained-earnings / APIC / OCI / NCI breakout in v1 (mock-time refinement only). Any gap
between the mapped financing lines and the reported total is the labeled residual (below).

### RISK-2 — reconciliation tolerance + missing-total behavior (matrix #1)
- Two independently reported totals: **A = `total_assets`**, **LE = `liabilities_and_equity`**
  (the reported `LiabilitiesAndStockholdersEquity` tag).
- `reconciliation_delta = A − LE`. `balanced = abs(delta) <= max(_RESIDUAL_EPSILON, 0.005 *
  abs(A))` (dollar-exact normally, 0.5% relative guard for large sheets). When not balanced,
  `BalanceMatrix` carries the signed `reconciliation_delta` for an explicit annotation —
  **neither column is ever rescaled to force a match** (AC-12).
- **Missing totals:** if `total_assets` is null → `matrix.available=False` (reason names it).
  If `liabilities_and_equity` is null, fall back to `LE = total_liabilities +
  stockholders_equity` **only when both are present** (still honest — reported liabilities +
  reported equity, not a plug), and set a flag that the reconciliation is against the derived
  sum. If neither a reported nor a derivable LE exists → `available=False`.

### RISK-3 — sign / contra handling (all three)
- **Contra-assets are excluded from matrix segments**, not subtracted. The asset column uses
  **net leaf concepts** (`ppe_net` — already net of accumulated depreciation;
  `accounts_receivable` = `AccountsReceivableNetCurrent`, already net of allowance). The
  standalone contra concepts (`allowance_for_doubtful_accounts`, `accumulated_depreciation`,
  `ppe_gross`) are **not** matrix segments — including them would double-count. The residual to
  `total_assets` absorbs any remaining difference. Documented in the helper.
- **Negative equity is kept signed** everywhere. `stockholders_equity` and the per-period
  equity segment carry the reported value with its sign; the schema exposes the signed value so
  the renderer draws a negative-equity block truthfully (annotated), not `abs()`'d. Column /
  100%-bar arithmetic is signed: `total_liabilities + stockholders_equity(signed) ≈ LE`.

### Subtotal-vs-leaf rule (the income "drop the aggregate" rule, applied to the BS)
Matrix and working-capital **segment sets use leaf lines only**; the reported subtotals
(`total_current_assets`, `assets_noncurrent`, `total_current_liabilities`,
`liabilities_noncurrent`, `total_liabilities`) are used **only** as the reported-total column
and the residual base — never stacked alongside their own components. This is the exact
double-count guard the income common-size work flagged.

---

## Backend — `senior-backend-engineer` (land first)

### 1. `src/secfin/normalize/schema.py` — new models (mirror the income viz models)

```python
class BalanceMatrixSegment(BaseModel):
    kind: Literal["line", "residual"]
    canonical_concept: str | None      # None for residual
    label: str
    value: float | int                 # SIGNED (equity may be negative); residual is signed too
    unit: str
    source_tag: str | None = None      # provenance for lines; None for residual
    is_extension: bool | None = None

class BalanceMatrixSide(BaseModel):
    label: str                         # "Assets" | "Liabilities & Equity"
    segments: list[BalanceMatrixSegment]
    reported_total: float | int | None # total_assets / LE (signed)
    reported_total_concept: str | None # "total_assets" | "liabilities_and_equity" | "derived"

class BalanceMatrix(BaseModel):
    available: bool
    unavailable_reason: str | None = None
    assets: BalanceMatrixSide | None = None
    financing: BalanceMatrixSide | None = None
    reconciliation_delta: float | int | None = None   # total_assets − LE, SIGNED
    balanced: bool | None = None
    reconciliation_note: str | None = None            # e.g. "reconciled against derived L+E sum"

class WorkingCapitalComponent(BaseModel):
    kind: Literal["line", "residual"]
    canonical_concept: str | None
    label: str
    value: float | int | None          # null stays null (never 0); residual signed
    source_tag: str | None = None
    is_extension: bool | None = None

class WorkingCapitalBridge(BaseModel):
    available: bool
    unavailable_reason: str | None = None
    current_assets: float | int | None = None
    current_liabilities: float | int | None = None
    net_working_capital: float | int | None = None    # CA − CL, SIGNED
    asset_components: list[WorkingCapitalComponent] = Field(default_factory=list)
    liability_components: list[WorkingCapitalComponent] = Field(default_factory=list)

class BalanceSheetViz(BaseModel):
    cik: int
    fiscal_year: int
    fiscal_period: FiscalPeriod
    period_start: str | None = None
    period_end: str | None = None
    form: str | None = None
    filed: str | None = None
    accession: str | None = None
    matrix: BalanceMatrix
    working_capital: WorkingCapitalBridge
    caveats: list[str] = Field(default_factory=list)

class CapitalStructureSegment(BaseModel):
    kind: Literal["liabilities", "equity", "residual"]
    label: str
    value: float | int                 # SIGNED
    pct: float                          # value / financing_total (may be >1 or <0: real)

class CapitalStructurePeriod(BaseModel):
    fiscal_year: int
    fiscal_period: FiscalPeriod
    period_end: str | None = None
    available: bool
    unavailable_reason: str | None = None
    financing_total: float | int | None = None        # LE (reported or derived)
    segments: list[CapitalStructureSegment] = Field(default_factory=list)

class CapitalStructureSeries(BaseModel):
    cik: int
    fiscal_period: FiscalPeriod        # the period type of the series (FY for v1)
    periods: list[CapitalStructurePeriod] = Field(default_factory=list)  # oldest→newest
    caveats: list[str] = Field(default_factory=list)
```

### 2. `src/secfin/normalize/viz.py` — new helpers (pure, no I/O; same style as `income_viz`)

Module-level constants (define once):
```python
_MATRIX_ASSET_CONCEPTS   # leaf, net, ordered: cash_and_equivalents, marketable_securities_current,
                         # accounts_receivable, inventory, prepaid_expenses, other_assets_current,
                         # ppe_net, goodwill, intangible_assets, marketable_securities_noncurrent,
                         # operating_lease_right_of_use_asset, other_assets_noncurrent
_MATRIX_LIABILITY_CONCEPTS  # leaf, ordered: accounts_payable, accrued_liabilities,
                            # accounts_payable_and_accrued_liabilities, debt_current,
                            # deferred_revenue_current, operating_lease_liabilities_current,
                            # other_liabilities_current, long_term_debt, deferred_revenue,
                            # operating_lease_liabilities_noncurrent, other_liabilities_noncurrent
_MATRIX_EQUITY_CONCEPT = "stockholders_equity"     # one block (OD-3)
_CURRENT_ASSET_CONCEPTS / _CURRENT_LIABILITY_CONCEPTS  # the current-scoped subsets above
_BALANCE_RESIDUAL_LABEL = "Other / unmapped"
_RESIDUAL_EPSILON  # reuse the income module's 1.0
BALANCE_VIZ_CAVEATS  # see below
```

- `balance_viz(stmt) -> BalanceSheetViz`
  - `_build_matrix(stmt)`:
    - required: `total_assets` present → else `available=False` ("No reported total assets…").
    - LE = `liabilities_and_equity` value; if null, derive `total_liabilities + stockholders_equity`
      when BOTH present (`reported_total_concept="derived"`, set `reconciliation_note`); if neither
      → `available=False`.
    - Assets side: one `line` segment per `_MATRIX_ASSET_CONCEPTS` present & non-null (signed
      value), then a `residual` = `total_assets − sum(segments)` when `abs ≥ epsilon`.
    - Financing side: `line` per `_MATRIX_LIABILITY_CONCEPTS` present & non-null, then the
      `stockholders_equity` line (signed), then `residual` = `LE − sum(liab lines + equity)` when
      `abs ≥ epsilon`.
    - `reconciliation_delta = total_assets − LE`; `balanced = abs(delta) ≤ max(epsilon,
      0.005*abs(total_assets))`.
  - `_build_working_capital(stmt)`:
    - required: `total_current_assets` AND `total_current_liabilities` present → else
      `available=False` naming which is missing (do NOT sum components — AC-9).
    - `net_working_capital = CA − CL` (signed).
    - `asset_components`: `_CURRENT_ASSET_CONCEPTS` → `line` per present concept (null value stays
      `None`, never 0 — AC-10), then a `residual` to CA when `abs ≥ epsilon`. Same for
      `liability_components` to CL.
  - carries `stmt` period metadata + `BALANCE_VIZ_CAVEATS`.
- `capital_structure_series(statements: list[Statement]) -> CapitalStructureSeries`
  - for each statement (oldest→newest): compute LE (reported `liabilities_and_equity`, else
    derive from `total_liabilities + stockholders_equity` when both present). If LE missing or
    `stockholders_equity` null → `CapitalStructurePeriod(available=False, reason=…)` (a **gap**,
    AC-6), no segments.
  - else two segments — `liabilities` (`total_liabilities`, signed) and `equity`
    (`stockholders_equity`, signed) — each `pct = value / LE`; plus a `residual` segment when
    `abs(LE − (total_liabilities + stockholders_equity)) ≥ epsilon`. `pct` may exceed 1 or go
    negative — **do not clamp** (negative-equity truth).

`BALANCE_VIZ_CAVEATS` (module-level list, same spirit as `INCOME_VIZ_CAVEATS`):
1. SEC EDGAR source + filing lag.
2. Derived presentation view — same normalized values as `/statements/balance`, re-shaped; not a
   new measurement.
3. **Instant snapshot** — a point-in-time balance as of the period end, not a flow.
4. Any gap between mapped lines and the filer's reported total is shown as one explicit
   **"Other / unmapped"** block, not hidden; a large one usually means a line we haven't mapped
   yet, not a real economic bucket.
5. The Assets = Liabilities + Equity check compares the filer's **two independently reported
   totals**; a discrepancy is annotated, never forced.

### 3. `src/secfin/api/routes.py` — two endpoints (mirror `get_income_statement_viz`)

- `GET /companies/{symbol}/statements/balance/viz?year=&period=FY` →
  `response_model=BalanceSheetViz`, on `public_router` (browser-called, no API key — same as the
  income viz). Body: `_statement_facts_for_cik` → `build_statement(..., "balance", ...)` → 404 if
  no facts/accession → `balance_viz(stmt)`.
- `GET /companies/{symbol}/statements/balance/viz-series?period=FY&limit=6` →
  `response_model=CapitalStructureSeries`, `public_router`. Body: `_facts_for_cik(full history)`
  → `available_periods(facts)` filtered to `period` (FY), most-recent `limit`, oldest→newest →
  `build_statement` per period → `capital_structure_series(stmts)`. 404 only if the company has
  no facts at all; an empty/gappy series is a valid 200 (honest "not chartable"), same philosophy
  as the income viz `available=false`. Cap `limit` (e.g. ≤ 12) to bound work.
- Imports: add the new schema models + `balance_viz`, `capital_structure_series` to the existing
  `from secfin.normalize.viz import …` / schema imports.

### Backend acceptance checks (map to ACs)
- AC-4/AC-5 (trend reconcile + no double-count + labeled residual): unit test two-way split sums
  to LE; residual only when real; debt never added on top of liabilities.
- AC-6 (period gap): unit test a period with null equity/LE → `available=False`, not a bar.
- AC-8/AC-9/AC-10 (working capital sign + missing-total + null component): unit tests.
- AC-11/AC-12/AC-13 (matrix segments, reconciliation surfaced not forced, missing total →
  unavailable): unit tests incl. the `balanced=False` discrepancy path and the derived-LE
  fallback path.
- AC-15 (same values, no re-derivation): helpers read `StatementLine.value` only.
- AC-17 (`pytest` green, new helper covered): new `tests/test_balance_viz.py`.

---

## Frontend — `senior-frontend-engineer` (after backend lands, same branch)

### 4. `src/secfin/api/static/app.js` — three Plot renderers (siblings of `incomeBridge`)
Register on the `P` object next to `incomeBridge`/`commonSizeChart`:
- `P.capitalStructureTrend(series, opts)` — 100% stacked bars, one per period
  (`periods[].segments`), x = period end / FY label, y = share. Liabilities vs Equity in two
  hues from the existing chart palette (**not** green/red — semantics are structural, not
  good/bad). A period with `available=false` renders a labeled gap (hatched "n/a" slot), **never
  a full/empty bar** (AC-6). Negative-equity periods: draw the equity segment below the baseline
  / annotated, liabilities extending past 100% — truthful (AC-5/AC-7). Tooltip: segment value +
  pct.
- `P.workingCapitalBridge(wc, opts)` — horizontal, zero line centered: `current_assets` extends
  one way, `current_liabilities` the other, NWC annotated with its sign (a deficit reads as a
  deficit — AC-8). If `!wc.available`, render the `unavailable_reason` state, not an empty axis.
  Component breakdown (optional expand) uses `asset_components`/`liability_components`; a null
  component is omitted/labeled N/A, never 0 (AC-10).
- `P.balanceMatrix(matrix, opts)` — two stacked columns (Assets | Liabilities & Equity), each
  segment sized by its value; the `residual` segment gets the accent-wash + dashed treatment the
  income residual uses (visually distinct). Show both reported totals under the columns and the
  reconciliation: `balanced` → a subtle "balances" tick; else annotate `reconciliation_delta`
  (AC-12). A null line is absent, never a 0 slice (AC-11). Negative equity block rendered
  truthfully. If `!matrix.available`, the unavailable state.
- All three: `opts.width` from `P.measuredWidth`, theme-aware (reuse the income charts' color
  tokens), no console errors (AC-16).

### 5. `src/secfin/api/static/company.js` — extend the existing toggle to the balance sheet
- `wireStatementView` (line ~1227): fire `wireStmtViewToggle` for `state.statement === "income"
  || state.statement === "balance"` (not income-only).
- `statementView(...)` must emit the `.stmt-view-toggle` + `#stmt-table-wrap` / `#stmt-chart-wrap`
  scaffold for the balance sheet too (currently income-only). Cash flow and segments stay
  table-only (AC-3).
- `renderStmtCharts(stmt)` branches on `state.statement`:
  - income → existing path (unchanged).
  - balance → fetch **both** `/statements/balance/viz?year=&period=` and
    `/statements/balance/viz-series?period=FY` (the series independent of the selected period),
    cache both, then `paintBalanceCharts(wrap, viz, series)` drawing trend → working-capital →
    matrix (brief's build priority order), each in its own card with the shared caveats footer.
- **vizCache key must include the statement** (`state.statement + "|" + year + "|" + period`) —
  the current key is `year|period` only and would collide across income/balance. The series can
  cache under `state.statement + "|series"` (period-independent).
- Default mode stays **Table** (`state.stmtMode`), charts opt-in (AC-1).

### 6. `src/secfin/api/static/company.css` — reuse the income chart card styles; add only what the
matrix's two-column layout and the residual/deficit annotation need. Theme tokens only.

### Frontend acceptance checks
- AC-1/AC-2/AC-3 (toggle present on balance, re-renders on period change, absent on cash
  flow/segments), AC-7 (trend labels + non-hue encoding), AC-14 (caveats footer on the charts),
  AC-16 (no console errors, light+dark, table/audit/raw-JSON unaffected), AC-18 (Docker e2e
  headless render passes for the balance chart view).

---

## Mock-first gate (operator standing rule — before the full frontend build)

Per the brief and `[[feedback-viz-mock-before-build]]`: once the backend endpoints return real
data, render the three charts for **real tickers on the real page** and eyeball framing **before**
polishing the full build. Specifically check:
- **AAPL** — clean, well-mapped; matrix residual should be modest; trend two-way stable.
- **A negative-equity / buyback-heavy filer** (e.g. **MCD** or **HD**, or AAPL in a year its
  equity is thin) — confirm the trend renders equity < 0 / liabilities > 100% **truthfully**, not
  clamped.
- **A filer with big "Other" buckets** — confirm the "Other / unmapped" residual is labeled and,
  if it *dominates*, flag it as a mapping-extension candidate (separate task), do **not** hide it
  (RISK-1). WMT (used in the income mock) is a good second ticker.
Get framing sign-off, then finish. The backend is unaffected by the mock outcome; only chart
framing/labels are.

---

## Files touched (summary)

| Stage | File | Change | Owner |
|---|---|---|---|
| normalize | `src/secfin/normalize/schema.py` | +7 models (above) | backend |
| normalize | `src/secfin/normalize/viz.py` | +`balance_viz`, +`capital_structure_series`, +consts, +caveats | backend |
| serve | `src/secfin/api/routes.py` | +2 public endpoints, imports | backend |
| test | `tests/test_balance_viz.py` | new unit suite | backend |
| serve/UI | `src/secfin/api/static/app.js` | +3 `P.*` renderers | frontend |
| serve/UI | `src/secfin/api/static/company.js` | toggle→balance, branch fetch, cache key | frontend |
| serve/UI | `src/secfin/api/static/company.css` | matrix/deficit styles | frontend |

No `mapping.py`, no `DATA_MODEL.md`, no ingest, no storage, no new dependency. `docs/ROADMAP_UI.md`
gets a one-line "balance-sheet viz shipped" note at the end (backend or frontend, whoever closes).

## Test strategy
- **Unit (`tests/test_balance_viz.py`)** over built `Statement` fixtures (reuse the income viz
  test fixtures / `build_statement` on AAPL + WMT + a synthetic negative-equity statement):
  matrix reconcile + residual + `balanced` true/false + derived-LE fallback + missing-total
  unavailable; contra concepts excluded (no double subtract); working-capital sign + missing-CA/CL
  unavailable + null component omitted; series two-way sums to LE + negative-equity pct unclamped +
  gappy period + FY selection/limit.
- **e2e (Docker headless)** — the existing render check extended to drive the balance-sheet
  Chart toggle for a real ticker and assert the three cards render with 0 console errors (AC-18).
- `pytest` baseline 411 must stay green and grow.

## Handoff → Senior Engineer
Build order: **backend first** (schema → viz helpers → 2 endpoints → `tests/test_balance_viz.py`,
self-verify `pytest` + drive both endpoints live on AAPL & WMT and confirm the matrix reconciles /
series sums to LE), **then frontend** on the same branch (3 renderers → toggle wiring → **mock-first
framing sign-off** → finish → Docker e2e). Branch off `master` as `balance-sheet-viz`. Honesty ACs
(never-0, labeled residual, reconciliation surfaced-not-forced, signed equity) are the definition
of done.
