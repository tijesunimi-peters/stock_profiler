# 3 — Implementation: Balance-sheet visualizations

**Task slug:** `balance-sheet-viz`
**Branch:** `balance-sheet-viz` (off `master`)
**Architecture:** `docs/delivery/balance-sheet-viz/2-architecture.md`

---

## §3a — Backend (DONE)

### What changed

1. **`src/secfin/normalize/schema.py`** — added 9 models (the architecture's "7" plus the two
   sub-models it inlined): `BalanceMatrixSegment`, `BalanceMatrixSide`, `BalanceMatrix`,
   `WorkingCapitalComponent`, `WorkingCapitalBridge`, `BalanceSheetViz`,
   `CapitalStructureSegment`, `CapitalStructurePeriod`, `CapitalStructureSeries`. Same shape
   conventions as the income viz models: signed `value`, `kind` discriminators, provenance on
   `line` segments and `None` on `residual`s, explicit `available`/`unavailable_reason` states.

2. **`src/secfin/normalize/viz.py`** — added `balance_viz(stmt)` (→ `_build_matrix` +
   `_build_working_capital`) and `capital_structure_series(statements)`, plus module constants
   (`_MATRIX_ASSET_CONCEPTS`, `_MATRIX_LIABILITY_CONCEPTS`, `_MATRIX_EQUITY_CONCEPT`,
   `_CURRENT_ASSET_CONCEPTS`, `_CURRENT_LIABILITY_CONCEPTS`, `_BALANCE_RESIDUAL_LABEL`,
   `_RECON_REL_TOLERANCE`) and `BALANCE_VIZ_CAVEATS`. Pure, no I/O; reuses the income module's
   `_RESIDUAL_EPSILON`, `_has_value`, `_lines_by_concept`.

3. **`src/secfin/api/routes.py`** — two new `public_router` endpoints (no API key, browser-called,
   same as the income viz), imports wired.

4. **`tests/test_balance_viz.py`** — 20 unit tests. Suite total **431 passed** (was 411; +20).

### JSON contract (for the frontend stage)

**`GET /v1/companies/{symbol}/statements/balance/viz?year=&period=FY`** → `BalanceSheetViz`
```
{ cik, fiscal_year, fiscal_period, period_end, form, filed, accession,
  matrix: {
    available, unavailable_reason,
    assets:    { label, segments[], reported_total, reported_total_concept },
    financing: { label, segments[], reported_total, reported_total_concept },
    reconciliation_delta,   # total_assets - LE, SIGNED
    balanced,               # |delta| <= max(1, 0.005*|total_assets|)
    reconciliation_note     # set only when LE was derived (filer didn't tag the combined total)
  },
  working_capital: {
    available, unavailable_reason,
    current_assets, current_liabilities, net_working_capital,  # NWC = CA - CL, SIGNED
    unit, asset_components[], liability_components[]
  },
  caveats: [...] }
```
- `segments[]` element: `{ kind: "line"|"residual", canonical_concept|null, label, value (SIGNED),
  unit, source_tag|null, is_extension|null }`. `residual` = the labeled "Other / unmapped" gap;
  it is the ONLY balancing term, so `sum(segment.value) == reported_total` exactly.
- `*_components[]` element: `{ kind, canonical_concept|null, label, value|null, source_tag|null,
  is_extension|null }`. **A null `value` stays null — never 0.**
- `available=false` on a view (missing required reported total) returns **200**, not an error —
  an honest "can't chart this". Render the `unavailable_reason`, never an empty axis.

**`GET /v1/companies/{symbol}/statements/balance/viz-series?period=FY&limit=6`** →
`CapitalStructureSeries` (limit 1–12, default 6)
```
{ cik, fiscal_period,
  periods: [ { fiscal_year, fiscal_period, period_end, available, unavailable_reason,
               financing_total, segments: [ {kind:"liabilities"|"equity"|"residual", label,
                                             value (SIGNED), pct} ] } ],   # OLDEST -> NEWEST
  caveats: [...] }
```
- `pct = value / financing_total`, **NOT clamped**: a negative-equity period truthfully shows
  `equity.pct < 0` and `liabilities.pct > 1`. Frontend must render that (equity below baseline /
  liabilities past 100%), never clamp to [0,1].
- A period with `available=false` is an explicit **gap** — render a hatched "n/a" slot, never a
  full/empty bar.
- Empty `periods` is a valid 200.

### Honesty invariants enforced (definition of done)
- **Never coerce null to 0** — `_value()` returns `None` for absent lines; working-capital
  components carry `value=None` through.
- **Residual is the only balancer**, labeled `"Other / unmapped"`, `source_tag=None`; segments +
  residual reconcile to the reported total exactly.
- **Reconciliation surfaced, not forced** — `reconciliation_delta`/`balanced` carry the truth; a
  discrepancy keeps both columns' own reported totals (no rescale). Verified by
  `test_matrix_discrepancy_surfaced_not_forced`.
- **Contra-assets excluded** (`allowance_for_doubtful_accounts`, `accumulated_depreciation`,
  `ppe_gross`) — net leaves already embed them; `test_matrix_excludes_contra_assets_no_double_subtract`.
- **Negative equity kept signed** everywhere (matrix segment + series pct); never `abs()`'d.
- **Leaf-not-subtotal** — segments are leaf lines; subtotals feed reported_total + residual only.

### Notable finding (resolved) — derived liabilities for the trend
Driving WMT live surfaced that **WMT never tags the aggregate `Liabilities` (`total_liabilities`)
concept** — it reports `LiabilitiesAndStockholdersEquity` + `StockholdersEquity` only. The first
cut required `total_liabilities`, so WMT's entire capital-structure trend (the highest-priority
chart) came back as a wall of gaps. Fixed honestly: the liabilities segment is now the reported
aggregate when present, **else derived as `reported LE − reported equity`** — an identity between
two reported numbers (not a plug; residual is then exactly 0). This mirrors the matrix's derived-LE
fallback in reverse. WMT now charts all periods (liabilities ~68%→65%, a visible slight
deleveraging). Covered by `test_series_derives_liabilities_when_aggregate_untagged`. **This is a
framing/coverage note the frontend mock and QA should be aware of**, not a hidden behavior — the
value shown equals total liabilities by the accounting identity.

### Verification (evidence)
- `docker compose --profile test run --rm test bash -c "... pytest -q"` → **431 passed, 6 skipped**.
  `pytest tests/test_balance_viz.py -q` → **20 passed**.
- Live-drove both endpoints (rebuilt `api` image, `docker compose up -d api`):
  - **AAPL `/balance/viz` FY2024**: matrix `available`, assets total `364.98B` == financing
    `364.98B` (`liabilities_and_equity`), `balanced=true`, `delta=0`; asset segments (incl. a
    labeled `22.6B "Other / unmapped"` residual) sum to the reported total exactly; working
    capital `available`, `NWC=-23.4B` (AAPL genuinely runs negative WC — kept signed, not
    flipped).
  - **AAPL `/balance/viz-series` FY×6 (2020→2025)**: every period `available`, each two-way split
    sums to 1.0.
  - **WMT `/balance/viz` FY2024**: `balanced`, `delta=0`, both sides reconcile to `252.4B`;
    `NWC=-15.5B` signed.
  - **WMT `/balance/viz-series` FY×4**: all periods `available` after the derived-liabilities fix,
    pct sums 1.0, liabilities 0.685→0.65.

### Files touched (backend)
`src/secfin/normalize/schema.py`, `src/secfin/normalize/viz.py`, `src/secfin/api/routes.py`,
`tests/test_balance_viz.py`. No `mapping.py`/`DATA_MODEL.md`/ingest/storage/dependency change.
No frontend touched. Not committed.

### Handoff → Senior Frontend Engineer
- Consume the two endpoints above. Build order per the brief: **trend (#2) → working-capital (#4)
  → matrix (#1)**, each its own card behind the balance sheet's Table/Chart toggle (default
  Table), shared `caveats` footer.
- Watch the honesty contract: render `available=false` states (don't fake an axis); **never draw a
  null component as 0**; render **unclamped** negative-equity/`>100%` periods truthfully;
  distinctly style the `"Other / unmapped"` residual (accent-wash + dashed, like the income
  residual).
- **vizCache key must include the statement** (`state.statement + "|" + year + "|" + period`); the
  series caches under `state.statement + "|series"` (period-independent).
- **Mock-first gate before finishing** (operator standing rule): AAPL (clean), a
  negative-equity/buyback filer (confirm unclamped truthful render), and WMT (derived-liabilities
  trend + any dominant "Other / unmapped" residual on the matrix — flag if it dominates, don't
  hide). Get framing sign-off, then finish, then Docker e2e.

---

## §3b — Frontend (DONE)

### What changed
1. **`src/secfin/api/static/app.js`** — three Observable Plot renderers registered on
   `window.ClearyFi` (siblings of `incomeBridge`/`commonSizeChart`), all thin (server owns the
   honesty math), single terracotta accent + ink, no green/red:
   - `capitalStructureTrend(series, opts)` — one 100% stacked bar per period (oldest→newest),
     Liabilities (ink) vs Equity (accent) as a share of the reported financing total, legend +
     100% dashed reference line. **Percentages are not clamped** — Plot stacks a negative-equity
     segment below the zero line and liabilities past 100%. Unavailable periods render an explicit
     `n/a` gap slot in the timeline.
   - `workingCapitalBridge(wc, opts)` — horizontal diverging bar, centred zero line; current
     assets (ink) extend right, current liabilities (accent) left, each broken into its mapped
     components (null components omitted, never a 0-bar; server residual = accent-wash). Reported
     totals labelled at each bar end; NWC stated **with its sign** in the note.
   - `balanceMatrix(matrix, opts)` — two stacked columns (Assets | Liabilities & Equity), each
     segment a reported leaf line; equity = ink (distinct from accent liabilities in the same
     column), residual = accent-wash. Both independently reported totals labelled atop the
     columns; reconciliation surfaced in the note (`✓ Balances` tick, or the signed delta) —
     **never rescaled**. Negative segments stack below 0 truthfully.
2. **`src/secfin/api/static/company.js`** — `wireStmtViewToggle` now fires for `balance` as well
   as `income`; `statementView` emits the Table/Chart scaffold for the balance sheet too (cash
   flow + segments stay table-only). `renderStmtCharts` branches: for balance it calls
   `renderBalanceCharts`, which fetches **both** `/statements/balance/viz` (current period) and
   `/statements/balance/viz-series?period=FY` (period-independent), caches both, and
   `paintBalanceCharts` draws trend → working-capital → matrix (brief priority order) with the
   shared caveats footer. **vizCache key now includes the statement**
   (`statement|year|period`; series under `statement|series`) — fixes the income/balance collision.
   Default mode stays Table.
3. **`scripts/headless_check.js`** — added `statements-balance-chart` (AAPL) and
   `statements-balance-chart-wmt` pages; the income-chart toggle handler extended to drive the
   balance Chart toggle too.
4. **No CSS change** — reuses the shared `chartCard` chrome (`.plot-chart*`, in `app.css`); the
   matrix is a single two-band Plot SVG. One margin bump inside `workingCapitalBridge`
   (marginLeft 108→128) so the "Current liabilities" y-label isn't clipped.

### Verification (evidence)
- **Docker e2e headless render check**: **HEADLESS CHECK: PASS**, `errors=0` on both new
  balance-chart pages (AAPL, WMT) and every existing page (income viz unaffected).
- **Mock-first framing sign-off** (eyeballed `data/e2e-shots/`):
  - **AAPL** (`statements-balance-chart.png`): trend Liabilities ~84% / Equity ~16% (sums 100%);
    working-capital **NWC −$17.7B deficit shown signed**; matrix **✓ Balances** (both reported
    totals $359.2B agree).
  - **WMT** (`statements-balance-chart-wmt.png`): **derived-liabilities trend renders** (~62% /
    ~38%) — the untagged-aggregate fix working end to end; NWC −$22.6B signed; matrix balances but
    shows a **sizeable labelled "Other / unmapped" residual on the financing side** (WMT's sparse
    liability leaves) — honest, not hidden. *Flagged as a mapping-extension candidate* (extend the
    liability-leaf coverage in `normalize/mapping.py`), a separate task.
  - **Negative equity** (`negeq-trend.png`, synthetic series through the real renderer, 0 console
    errors): a FY with equity < 0 draws **liabilities past 100% and equity below the zero line**
    against the dashed 100% reference — truthful, **unclamped**. Confirms the honesty contract for
    the buyback-heavy case (no cached HD/MCD/SBUX in this dev volume).
- Renderers are token-driven (`plotTokens()`/`cssVar`), theme-aware like the verified income charts.

### Notes for QA
- Switching PERIOD in Chart mode re-renders #4/#1; the trend (#2) is period-independent by design
  (a company-wide series). Table/audit/raw-JSON toggles and the shipped income viz must be
  unaffected.
- The **single-bar trend** in the e2e screenshots is a *fixture* artifact (trimmed fixtures carry
  one FY of balance totals); live AAPL/WMT return 6/4 periods (curl-verified in §3a). Not a bug.
- Honesty checks to re-confirm: null component never a 0-bar; residual labelled + accent-wash;
  reconciliation surfaced not forced; negative equity unclamped; `available=false` shows the
  reason, not an empty axis.

### Files touched (frontend)
`src/secfin/api/static/app.js`, `src/secfin/api/static/company.js`, `scripts/headless_check.js`.
No Python touched. Not committed.

### Handoff → QA Tester
Branch `balance-sheet-viz`. Full-stack change complete: 431 pytest green (+20), e2e PASS with 0
console errors, all three charts framing-signed-off on AAPL/WMT + the negative-equity case. Verify
the ACs in `1-brief.md` (A–F), especially the honesty set and that the income viz + table
affordances are unaffected.

---

## §3c — Balance Matrix as a 2-column table (post-QA follow-up)

**Operator change request (2026-07-20):** render the Balance Matrix (#1) as a 2-column **table**
instead of the stacked-bar chart. The trend (#2) and working-capital bridge (#4) stay charts.

### What changed (frontend only)
- **`src/secfin/api/static/app.js`** — `balanceMatrix(matrix, opts)` rewritten to build a DOM
  table (no Observable Plot). Same `chartCard` shell + title + reconciliation `card.note(...)`;
  `card.body` now holds a `.bmatrix` two-column grid. Left column **Assets**, right column
  **Liabilities & Equity** (equity kept in the right column, signed — a literal
  assets-vs-liabilities table can't reconcile). Each column: one row per reported leaf line
  (label + right-aligned `usd()` value), then the **"Other / unmapped"** residual as a distinct
  row, then a bold **Total** row = the side's `reported_total`. Endpoint/JSON unchanged.
- **`src/secfin/api/static/company.css`** — added `.bmatrix*` styles: two-column grid that wraps
  to one column under 560px (inside `.plot-chart-body`, already `overflow-x:auto`); residual row =
  `--accent-wash` bg + dashed `--accent` rule + italic muted text (reads as computed-not-reported);
  total row = 2px `--ink` top border + bold. All theme-aware via CSS tokens.

### Honesty contract held
- Null never 0 (only present lines emitted; residual carries its computed signed value).
- **Negative values signed** — verified live: AAPL's financing residual renders **($18.2B)** with
  accounting parens (not abs'd); the negative-equity path (equity < 0) uses the same `usd()`
  formatter.
- Residual labeled + distinct; reconciliation surfaced via `card.note` (✓ Balances / signed delta
  + `reconciliation_note`), never rescaled; `available===false` → `unavailable_reason` state.

### Verification
- Rebuilt `api`; **e2e HEADLESS CHECK: PASS**, `errors=0` on `statements-balance-chart` (AAPL) and
  `statements-balance-chart-wmt`, and all other pages (charts #2/#4 + income viz unaffected).
- Eyeballed `data/e2e-shots/statements-balance-chart*.png`:
  - **AAPL** — clean 2-column table; Assets $359.2B / Liabilities & Equity $359.2B; residual rows
    ($22.0B assets, ($18.2B) financing) styled distinct; "✓ Balances".
  - **WMT** — same; the larger financing residual ($37.1B) is now a clearly labeled table row
    (more legible than the prior wash block); both totals $284.7B; "✓ Balances".
  - No overflow/clipping; trend + working-capital charts above unchanged.
- No Python touched; `pytest` unaffected (431). Not committed.

### Files touched
`src/secfin/api/static/app.js`, `src/secfin/api/static/company.css`. (`scripts/headless_check.js`
already covered the balance-chart pages from §3b.)
