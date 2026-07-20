# 2 — Architecture: Cash-flow statement visualizations

**Task slug:** `cashflow-viz`
**Stage:** Principal Architect → Senior Engineer (backend first, then frontend, same branch)
**Date:** 2026-07-20
**Reads:** `docs/delivery/cashflow-viz/1-brief.md`

## Scope re-check (Track 1, no drift)

Confirmed in scope. All three views are **presentation-only re-shapes** of concepts already in
`normalize/mapping.py` — `STATEMENT_CONCEPTS["cashflow"]` (`cash_from_operations/investing/
financing`, `effect_of_exchange_rate_on_cash`, `change_in_cash`, `capital_expenditures`), plus
`net_income` from `"income"` and the two cash-level balance concepts (`cash_and_restricted_cash`,
`cash_and_equivalents`). **No new canonical concept, no mapping change, no new ingest, no new base
dependency** (Observable Plot already vendored), **no SEC-compliance change** (endpoints read the
existing cache-aside facts path via `SECClient`, process-wide throttle unchanged), **no DuckDB /
request path change**. Sankey + raw micro-bars stay OUT (brief). Nothing here touches Track 2.

This is the third instance of an established pattern (`income-statement-viz`,
`balance-sheet-viz`): a **pure, tested `normalize/viz.py` helper** → **derived, caveated public
`/statements/cashflow/viz[-series]` endpoints** → **thin Observable Plot renderers** behind the
Statements **Table/Chart** toggle. We extend it; we do not invent a new shape.

## Data-flow (unchanged stages)

```
serve (routes.py)                       normalize (viz.py, pure)         schema.py
-----------------                       ------------------------         ---------
GET .../statements/cashflow/viz    -->  cashflow_viz(cf_stmt,       -->  CashFlowViz
  _facts_for_cik (cache-aside)             end_balance, begin_balance)      { bridge, caveats }
  build_statement(cashflow, y, p)
  build_statement(balance,  y, p)   (ending cash, matching basis)
  build_statement(balance,  prior)  (beginning cash, matching basis)

GET .../statements/cashflow/viz-series --> cashflow_series(          --> CashFlowSeries
  _facts_for_cik (cache-aside)               cf_statements,               { periods[], caveats }
  per period: build_statement(cashflow)      income_statements)
              build_statement(income)      (cross-statement join on
                                            (fiscal_year, fiscal_period))
```

No storage change, no repository change, no raw SQL in the API (both endpoints go through the
existing `build_statement` + repo path, exactly as the balance viz endpoints do).

---

## Backend design (`senior-backend-engineer`) — land first

### B0. The cash-basis rule (the one genuinely new idea) — AC-6 / RISK-1 / OD-3

`change_in_cash` has two candidate tags (mapping.py, verified 2026-07-16):

| `change_in_cash.source_tag` (the gaap tag build_statement picked) | Basis it reconciles to | Balance concept to read |
|---|---|---|
| `CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffect` (modern, ASU 2016-18) | cash **incl. restricted** | `cash_and_restricted_cash` |
| `CashAndCashEquivalentsPeriodIncreaseDecrease` (legacy) | cash & equivalents only | `cash_and_equivalents` |

`StatementLine.source_tag` carries exactly the tag we mapped from (it's the audit trail — see
`schema.py:57`). So the helper reads `cf_stmt`'s `change_in_cash` line's `source_tag`, maps it to
the matching **balance** concept, and reads Beginning/Ending cash **on that basis** from the two
balance statements. **This is why a fake residual would otherwise appear** — reading
`cash_and_equivalents` while the filer reported the restricted-inclusive change mixes bases.
Mixing is what we must not do; matching is the fix.

If `change_in_cash`'s tag is neither known candidate (shouldn't happen — the mapping only emits
those two — but defensively), or the matching balance concept is absent for a period boundary, we
**do not fabricate** a level: the bridge falls back to the **relative walk** (below).

### B1. `schema.py` — new Pydantic models

Add after the balance viz models (keep the existing ones untouched). Field conventions mirror
`IncomeBridgeStep`/`CapitalStructure*`.

```python
class CashFlowBridgeStep(BaseModel):
    """One step of the cash bridge (Beginning -> CFO -> CFI -> CFF -> FX -> residual -> Ending).
    `value` is the magnitude drawn (>= 0); `direction` ("base"|"up"|"down") + `running_total`
    carry sign/position so the renderer never re-derives a sign. anchors/flows carry provenance;
    the residual ("Other / unreconciled") is computed, so source_tag is None."""
    kind: Literal["anchor", "flow", "residual"]
    canonical_concept: str | None = None   # None for residual + the derived Beginning/Ending anchors
    label: str
    value: float | int                     # magnitude, >= 0
    direction: Literal["base", "up", "down"]
    running_total: float | int
    unit: str
    source_tag: str | None = None
    is_extension: bool | None = None

class CashFlowBridge(BaseModel):
    """The single-period cash bridge. `absolute` = beginning/ending are real reported levels on
    the matching basis; when False the walk is 0-anchored (relative) and begin/end levels are
    null. `cash_basis` names which basis matched the reported change_in_cash tag."""
    available: bool
    unavailable_reason: str | None = None
    steps: list[CashFlowBridgeStep] = Field(default_factory=list)
    absolute: bool = False
    beginning_cash: float | int | None = None
    ending_cash: float | int | None = None
    reported_change: float | int | None = None       # the reported change_in_cash value
    cash_basis: str | None = None                     # "cash_and_restricted_cash" | "cash_and_equivalents"
    basis_note: str | None = None                     # set when begin+change != read ending beyond tol

class CashFlowViz(BaseModel):
    cik: int
    fiscal_year: int
    fiscal_period: FiscalPeriod
    period_start: str | None = None
    period_end: str | None = None
    form: str | None = None
    filed: str | None = None
    accession: str | None = None
    bridge: CashFlowBridge
    caveats: list[str] = Field(default_factory=list)

class CashFlowSeriesPeriod(BaseModel):
    """One period of the FCF + earnings-quality series. Every monetary field is None when its
    source line is absent (NEVER 0). free_cash_flow is None unless BOTH ocf and capex are present.
    cash_conversion is None unless net_income > 0 AND ocf present; conversion_status names why."""
    fiscal_year: int
    fiscal_period: FiscalPeriod
    period_end: str | None = None
    operating_cash_flow: float | int | None = None
    capital_expenditures: float | int | None = None   # reported positive payment
    free_cash_flow: float | int | None = None         # ocf - capex, else None
    net_income: float | int | None = None             # from the income statement
    cash_conversion: float | None = None              # ocf / net_income, else None
    conversion_status: Literal["ok", "nm", "na"] = "na"
    conversion_reason: str | None = None
    unit: str = "USD"

class CashFlowSeries(BaseModel):
    cik: int
    fiscal_period: FiscalPeriod
    periods: list[CashFlowSeriesPeriod] = Field(default_factory=list)  # oldest -> newest
    caveats: list[str] = Field(default_factory=list)
```

### B2. `normalize/viz.py` — the pure helpers

Add a cash-flow section at the end (after `capital_structure_series`), reusing `_lines_by_concept`,
`_has_value`, `_value`, `_RESIDUAL_EPSILON`.

Constants:

```python
_CASHFLOW_SECTIONS = [   # (concept, sign) walked in order; all add signed (as-reported)
    ("cash_from_operations", +1),
    ("cash_from_investing",  +1),
    ("cash_from_financing",  +1),
    ("effect_of_exchange_rate_on_cash", +1),
]
_CASHFLOW_RESIDUAL_LABEL = "Other / unreconciled"
_CHANGE_TAG_TO_BASIS = {
    "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffect": "cash_and_restricted_cash",
    "CashAndCashEquivalentsPeriodIncreaseDecrease": "cash_and_equivalents",
}
CASHFLOW_VIZ_CAVEATS = [ ... ]   # see B4
```

**`cashflow_viz(cf_stmt, end_balance, begin_balance) -> CashFlowViz`** (pure):

1. `by = _lines_by_concept(cf_stmt)`. Read the four section lines + `change_in_cash`.
2. **Required anchor:** `change_in_cash` must be present (it's the reconciliation target). If
   absent → `CashFlowBridge(available=False, unavailable_reason="No reported net change in cash
   for this period.")` (AC-7). (Also require ≥1 section present, else the walk is meaningless.)
3. **Basis:** `basis_concept = _CHANGE_TAG_TO_BASIS.get(change_line.source_tag)`. From
   `end_balance`/`begin_balance` (built balance statements) read that concept's value →
   `ending_cash`, `beginning_cash`. `absolute = beginning_cash is not None and ending_cash is not
   None and basis_concept is not None`.
4. **Build steps** (list[CashFlowBridgeStep]):
   - If `absolute`: first anchor = **Beginning Cash** (`running = beginning_cash`, direction
     "base"). Else: relative — `running = 0.0`, first anchor "Beginning (relative)" value 0.
   - For each present section (in order): signed flow; `running += signed`; step kind "flow",
     direction up/down by sign, magnitude `abs(signed)`, carry `source_tag`/`is_extension`.
     A **null section is skipped** (not a 0 step) — AC-7.
   - **Residual (AC-5, sole balancer):** `residual = reported_change - sum(section signed values)`.
     If `abs(residual) >= _RESIDUAL_EPSILON`, emit ONE `kind="residual"` step
     ("Other / unreconciled"), `running += residual`. This is the only balancer for the section
     walk — never a silent plug. (On AAPL/WMT this is ~0 because the four sections sum to the
     reported change by identity.)
   - **Ending anchor:** snap `running` to `beginning_cash + reported_change` when absolute
     (the identity), else to `reported_change` (relative). Emit anchor "Ending Cash".
5. **Basis cross-check (AC-6 note, not a forced value):** when absolute, compare the
   independently **read** `ending_cash` (from `end_balance`) against `beginning_cash +
   reported_change`. If they differ beyond `max(_RESIDUAL_EPSILON, 0.005*|ending|)`, set
   `basis_note` explaining the reported change and the period-end balance disagree on this basis
   (a filer-reporting/basis nuance) — **surfaced, never rescaled**. The walk still lands on the
   identity value so it's internally consistent.
6. Wrap in `CashFlowViz` carrying `cf_stmt`'s period metadata + `CASHFLOW_VIZ_CAVEATS`.

**`cashflow_series(cf_statements, income_statements) -> CashFlowSeries`** (pure) — OD-1/OD-2:

- Index income by fiscal key: `inc_by_key = {(s.fiscal_year, s.fiscal_period): s for s in income_statements}`.
- Order `cf_statements` oldest→newest (`sorted` by `(period_end or "", fiscal_year)`, same as
  `capital_structure_series`).
- For each cf statement build a `CashFlowSeriesPeriod`:
  - `ocf = _value(cf.line("cash_from_operations"))`; `capex = _value(cf.line("capital_expenditures"))`.
  - `fcf = ocf - capex` **only if both present**, else `None` (AC-8/AC-9). CapEx is the reported
    positive payment, so FCF = ocf − capex (a negative FCF stays negative, not clamped).
  - Cross-statement join (AC-11): `inc = inc_by_key.get((cf.fiscal_year, cf.fiscal_period))`;
    `ni = _value(inc.line("net_income")) if inc else None`. A period on cf but not income →
    `net_income = None` (no forward-fill, no cross-match).
  - **Conversion (AC-12):** if `ni is None or ocf is None`: `status="na"`,
    `reason="net income" / "operating cash flow" + " unavailable"`. Elif `ni <= 0`: `status="nm"`,
    `cash_conversion=None`, `reason="Net income <= 0 -- OCF/NI is not meaningful."` Else
    `status="ok"`, `cash_conversion = ocf / ni`.
  - Never coerce a missing monetary field to 0 (AC-10).
- `cik`/`fiscal_period` from the first statement; `caveats = CASHFLOW_VIZ_CAVEATS`.

`_value` already returns `None` for a missing/null line (never 0) — reuse it verbatim.

### B3. `api/routes.py` — two derived endpoints (public router, no key)

Mirror `get_balance_statement_viz` / `get_capital_structure_series` exactly.

```python
@public_router.get("/companies/{symbol}/statements/cashflow/viz",
    response_model=CashFlowViz, tags=["Financials"],
    summary="Cash bridge (Beginning -> CFO/CFI/CFF/FX -> Ending) view of a cash-flow statement")
async def get_cashflow_statement_viz(symbol, year, period="FY", repo, ticker_cache):
    async with SECClient() as client:
        cik = await _cik_from_symbol(client, ticker_cache, symbol)
        facts = await _facts_for_cik(repo, client, cik)      # full history: need the prior period too
    if not facts: raise 404
    cf = build_statement(facts, cik, "cashflow", year, period)
    if not cf.lines and cf.accession is None: raise 404
    end_balance = build_statement(facts, cik, "balance", year, period)
    begin_balance = _prior_period_balance(facts, cik, cf, period)   # match cf.period_start
    return cashflow_viz(cf, end_balance, begin_balance)
```

- **Uses `_facts_for_cik` (full history), not `_statement_facts_for_cik`** — the bridge needs the
  *prior* period-end balance for Beginning Cash, so a single-period fetch is insufficient. This is
  the same cache-aside full-history path the series/`/periods` already use; acceptable and cached.
- `_prior_period_balance(facts, cik, cf, period)`: pick the period whose `period_end ==
  cf.period_start` from `available_periods(facts)` (any matching period type); if none matches,
  fall back to the prior period of the same `period` type; if still none, return `None`
  (→ relative walk). Small private helper in routes.py (no raw SQL — pure over the facts list).

```python
@public_router.get("/companies/{symbol}/statements/cashflow/viz-series",
    response_model=CashFlowSeries, tags=["Financials"],
    summary="FCF breakdown + earnings-quality series (OCF vs CapEx vs FCF; NI vs OCF + conversion)")
async def get_cashflow_series(symbol, period="FY",
    limit=Query(_CAPITAL_STRUCTURE_DEFAULT_LIMIT, ge=1, le=_CAPITAL_STRUCTURE_MAX_LIMIT), repo, ticker_cache):
    async with SECClient() as client:
        cik = await _cik_from_symbol(client, ticker_cache, symbol)
        facts = await _facts_for_cik(repo, client, cik)
    if not facts: raise 404
    selected = [(y, p) for (y, p) in available_periods(facts) if p == period][:limit]
    cfs = [build_statement(facts, cik, "cashflow", y, p) for (y, p) in selected]
    incs = [build_statement(facts, cik, "income", y, p) for (y, p) in selected]
    cfs = [s for s in cfs if s.lines or s.accession is not None]
    return cashflow_series(cfs, incs)
```

Reuse the existing `_CAPITAL_STRUCTURE_DEFAULT_LIMIT`(6)/`_MAX_LIMIT`(12) or add
cashflow-scoped twins — engineer's call; keep the 6/12 defaults to match the balance trend.
Import the four new symbols (`cashflow_viz`, `cashflow_series`, `CashFlowViz`, `CashFlowSeries`).

### B4. `CASHFLOW_VIZ_CAVEATS` (AC-14)

The shared source/lag + "derived view, not a new measurement" pair, **plus** cash-flow-specific:
- the **basis note** (Beginning/Ending drawn on the basis matching the reported change_in_cash
  tag — restricted-inclusive vs equivalents-only);
- the **bridge residual** meaning ("Other / unreconciled" = gap between the summed sections and
  the reported net change; a large one signals a reporting/basis nuance, not a real bucket);
- **FCF = OCF − CapEx** (CapEx as the reported positive payment; N/A when either is missing);
- **cash conversion = OCF ÷ Net Income**, shown **"nm" when net income ≤ 0** (a negative
  denominator makes the ratio misleading).

### B5. Tests — `tests/test_cashflow_viz.py` (AC-17)

Pure-function unit tests (no network), mirroring `tests/test_balance_viz.py`:

- **Bridge identity + single residual:** synthetic cf statement where CFO+CFI+CFF+FX == change →
  residual step absent (≈0); a crafted mismatch → exactly one `kind="residual"` "Other /
  unreconciled" step, and running total lands on Beginning+change.
- **Basis selection:** change line with the modern tag → reads `cash_and_restricted_cash` from
  the balance statements; with the legacy tag → reads `cash_and_equivalents`. Wrong-basis values
  present but correct-basis absent → falls back correctly (no cross-basis read).
- **Relative-walk fallback:** `begin_balance=None` → `absolute=False`, 0-anchored walk, begin/end
  levels null, no fabricated level.
- **basis_note:** read ending ≠ beginning+change beyond tolerance → `basis_note` set; walk still
  lands on the identity.
- **Null section:** missing CFF line → skipped (no 0 step); missing `change_in_cash` →
  `available=False`.
- **Series FCF:** both present → fcf = ocf − capex (incl. a negative-FCF case, not clamped);
  capex missing (bank-like) → fcf None; ocf missing → fcf None, period still emitted.
- **Series conversion:** ni>0 → ratio; ni==0 and ni<0 → status "nm", value None; ni or ocf null →
  status "na", value None. Never 0.
- **Cross-statement join:** income statement present for some keys, absent for others → net_income
  null on the missing keys, no forward-fill / cross-match.
- **Real fixtures (mock-first gate, AC-5/RISK-1):** using the existing AAPL + WMT fixtures
  (`tests/test_real_fixtures.py` shape), assert the FY bridge residual is ≈ 0 (identity holds) and
  the residual does **not** dominate; assert the basis picked matches the reported change tag.

`pytest` baseline is **431**; target 431 + new (~20).

---

## Frontend design (`senior-frontend-engineer`) — after the endpoints land

Thin Observable Plot renderers; the server owns every honesty decision. Single accent, **no
green/red**; encode direction by bar float / position, not hue (STYLE_GUIDE §10). Theme-aware.

### F1. `api/static/app.js` — three renderers (+ export in the `P` object)

- **`cashFlowBridge(bridge, opts)`** — the near-twin of `incomeBridge` (app.js:2806). Floating
  accent bars for the four section flows; solid anchor columns for Beginning/Ending Cash; the
  residual as accent-**wash + dashed** (computed-not-reported), same treatment as the income
  residual. Honors `available=false` → honest unavailable card. When `absolute=false`, label the
  first anchor "Beginning (relative)" and note absolute levels unavailable. Surface `basis_note`
  and `cash_basis` in the card note/caption. Tooltip carries full label + exact value + source_tag.
- **`fcfBreakdown(series, opts)`** — grouped columns: for each period (oldest→newest) three bars
  OCF / CapEx / FCF. **A null field draws no bar** (gap), never a 0 bar (AC-8/AC-10). Negative FCF
  extends below the zero line (truthful). A period with `free_cash_flow == null` shows OCF/CapEx
  (where present) and an explicit "FCF N/A" marker naming the missing input.
- **`earningsQuality(series, opts)`** — paired columns Net Income / OCF per period (primary
  currency axis) + a **secondary axis** line for `cash_conversion`. Points where
  `conversion_status !== "ok"` are **suppressed (gap)** with the reason on hover — never plotted
  as 0 (AC-12). Secondary axis clearly labelled ("OCF ÷ Net Income"); the meaning (">1 = profit
  over-converts to cash") in the card note/caption (AC-13). A missing NI or OCF column for a
  period is a gap, not a 0 bar (AC-11).

Add a `CASHFLOW_SHORT_LABEL` map (Beginning Cash, CFO, CFI, CFF, FX, Ending Cash) for axis ticks,
mirroring `INCOME_SHORT_LABEL`. Export `cashFlowBridge`, `fcfBreakdown`, `earningsQuality` in the
`P` object (app.js ~3346).

### F2. `api/static/company.js` — wire cash flow into the toggle

- **Gate the toggle on cashflow** — line 1183 (`state.statement !== "income" && !== "balance"`)
  and line 1228 (`=== "income" || === "balance"`): add `"cashflow"` to both, so the Table/Chart
  toggle renders and `wireStmtViewToggle` runs for the cash-flow statement. (Note the statement
  key is `cashflow`, not `cash_flow`.)
- **`renderStmtCharts` dispatch** (line 1257): add
  `if (state.statement === "cashflow") { renderCashflowCharts(wrap, stmt); return; }`.
- **`renderCashflowCharts(wrap, stmt)`** — near-copy of `renderBalanceCharts`: fetch **two** things
  and paint once both resolve — the single-period bridge `.../statements/cashflow/viz?year=&period=`
  (cached `"cashflow|"+y+"|"+p`) and the series `.../statements/cashflow/viz-series?period=FY`
  (cached `"cashflow|series"`). Same `vizCache` discipline — keys include the statement, so
  income/balance/cashflow never collide (AC-3).
- **`paintCashflowCharts(wrap, viz, series)`** — brief order: bridge (#1, from `viz.bridge`) →
  FCF breakdown (#2, from `series`) → earnings-quality (#3, from `series`); then the caveat `<p>`
  from `viz.caveats` (same as `paintBalanceCharts`).

### F3. `api/static/company.css` — minimal

Reuse existing chart-card / caveat / residual styles. Add only what the secondary axis / "nm" gap
marker and the "FCF N/A" marker need (a small utility class or two), following STYLE_GUIDE. No new
palette entries — single accent, theme tokens already exist.

### F4. `scripts/headless_check.js` — extend (AC-18)

Add a cash-flow chart-view pass exactly as income/balance did: load a company (AAPL), select the
Cash Flow statement, click **Chart**, wait for the three cards to render, assert **0 console
errors** and that the bridge + both series cards drew.

---

## Acceptance criteria → concrete checks

| AC | Check | Owner |
|----|-------|-------|
| AC-1 | e2e: Cash Flow → Table/Chart toggle present (default Table); Chart renders 3 cards for AAPL, WMT, no errors | FE |
| AC-2 | Change period → bridge (#1) re-renders for that period; series (#2/#3) show correct periods | FE |
| AC-3 | `vizCache` keys include statement (+`\|series`); income/balance viz unchanged; charts only on cashflow | FE |
| AC-4 | Bridge steps = Beginning→CFO→CFI→CFF→FX→Ending; direction from `direction`/`running_total`, not hue | BE(steps)+FE(draw) |
| AC-5 | `cashflow_viz`: `reported_change − Σsections` = single "Other / unreconciled" residual step (sole balancer); ≈0 on AAPL/WMT (unit test + fixture) | BE |
| AC-6 | Basis = `_CHANGE_TAG_TO_BASIS[change.source_tag]`; begin/end read on that concept; `basis_note` on disagreement; relative walk when levels absent (unit tests) | BE |
| AC-7 | Null section skipped (no 0 step); missing `change_in_cash` → `available=false` reason (unit test) | BE |
| AC-8 | `free_cash_flow = ocf − capex` (both present); negative FCF stays negative; FE draws no 0 bar | BE+FE |
| AC-9 | capex or ocf missing → `free_cash_flow=None`; bank (no capex) → FCF N/A (unit test + WMT/JPM-shape) | BE |
| AC-10 | No null monetary field rendered as 0; periods-drawn stated; missing-OCF period gapped | BE+FE |
| AC-11 | Join on `(fiscal_year, fiscal_period)`; period on one statement only → other side null, no forward-fill (unit test) | BE |
| AC-12 | `conversion_status` "nm" when ni≤0, "na" when null input, "ok" else; value None unless "ok"; FE suppresses non-ok points | BE+FE |
| AC-13 | Secondary axis labelled + distinguished; ratio meaning discoverable; not color-only | FE |
| AC-14 | `CASHFLOW_VIZ_CAVEATS` present on both responses incl. basis / residual / FCF / nm notes | BE |
| AC-15 | Values are the same `build_statement` normalized values; tooltip matches table abbrev | BE+FE |
| AC-16 | e2e: 0 console errors, light+dark; existing cashflow table/audit/raw-JSON + income/balance viz unaffected | FE |
| AC-17 | `pytest` green (431 + new); coverage per B5 | BE |
| AC-18 | Docker e2e headless render passes cashflow chart view | FE |

## Files touched

**Backend (land first):**
- `src/secfin/normalize/schema.py` — +5 models (B1)
- `src/secfin/normalize/viz.py` — cash-flow section: constants, `cashflow_viz`, `cashflow_series`, `CASHFLOW_VIZ_CAVEATS` (B2)
- `src/secfin/api/routes.py` — 2 endpoints + `_prior_period_balance` helper + imports (B3)
- `tests/test_cashflow_viz.py` — new (B5)

**Frontend (same branch, after):**
- `src/secfin/api/static/app.js` — `cashFlowBridge`, `fcfBreakdown`, `earningsQuality` + exports (F1)
- `src/secfin/api/static/company.js` — toggle gating + `renderCashflowCharts`/`paintCashflowCharts` (F2)
- `src/secfin/api/static/company.css` — minimal secondary-axis / nm-gap / FCF-N/A styles (F3)
- `scripts/headless_check.js` — cashflow chart-view pass (F4)

**Docs:** no `DATA_MODEL.md` change (no new concept). The cash-basis rule is documented here + in
`CASHFLOW_VIZ_CAVEATS`; optionally add a one-line pointer in `docs/ROADMAP_UI.md` (engineer's call).

## Open decisions — resolved

- **OD-1 (series shape):** one `/statements/cashflow/viz-series` → `CashFlowSeries` with per-period
  fields covering **both** FCF (ocf/capex/fcf) and earnings-quality (net_income/cash_conversion).
  One call, one server round-trip, honesty math server-side.
- **OD-2 (cross-statement join):** one `_facts_for_cik` fetch feeds both
  `build_statement(...,"cashflow")` and `build_statement(...,"income")` per selected period; join
  on `(fiscal_year, fiscal_period)`; per-period nulls where a side is absent; never forward-fill.
- **OD-3 / AC-6 / RISK-1 (cash basis + begin/end):** detect basis from `change_in_cash.source_tag`
  (the two mapping candidates → `cash_and_restricted_cash` / `cash_and_equivalents`); Ending =
  current period-end balance on that basis; Beginning = the prior period whose `period_end` matches
  the cf `period_start`, on that basis; relative 0-anchored walk when a level is unavailable; the
  reported-change-vs-read-ending disagreement is a surfaced `basis_note`, never a rescale.
- **AC-5 (single residual):** `reported_change − Σ(present sections)`, one "Other / unreconciled"
  step, sole balancer.
- **AC-12 (ratio degrade):** `conversion_status ∈ {ok, nm, na}`; `nm` on net_income ≤ 0, `na` on a
  null input; value None unless `ok`; front-end suppresses the point (gap) with the reason on hover.

## Risks carried to the engineer

- **RISK-1 (residual/basis):** the mock-first gate — validate on **AAPL + WMT FY** that the bridge
  residual is ≈0 and Beginning/Ending land sensibly on the matched basis **before** the full
  frontend build (operator standing rule, [[feedback-viz-mock-before-build]]). A large residual =
  a basis mismatch to fix in `_CHANGE_TAG_TO_BASIS` / the begin/end read, not to hide.
- **RISK-2 (period misalignment):** join strictly on `(fiscal_year, fiscal_period)` with
  build_statement's latest-filed semantics per statement; missing side → gap.
- **RISK-3 (banks):** JPM has no capex and uses `CashAndDueFromBanks` for cash — FCF is N/A
  (AC-9), and the bridge should degrade to the relative walk / honest anchors rather than error.
  Confirm the helper is null-safe on a bank shape (unit test with a capex-less statement).

## Handoff → Senior Engineer

Backend first (`senior-backend-engineer`): B1–B5 on a fresh branch off `master`; land the two
endpoints + the pure helpers + tests; **run the mock-first check on AAPL + WMT** (bridge residual
≈0, basis matches) and record the numbers before handing to the frontend. Then
`senior-frontend-engineer`: F1–F4 on the same branch, consuming the JSON contract above; verify
with the Docker e2e headless render and eyeball AAPL + WMT (clean identity) + a bank-shape (FCF
N/A) before QA. Track 1 only; the honesty ACs are the definition of done.
