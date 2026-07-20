# 2 — Architecture: Income-statement visualizations (Waterfall + 100% common-size bar)

**Task slug:** `income-statement-viz`
**Stage:** Principal Architect → Senior Engineer(s)
**Depends on:** `1-brief.md`
**Date:** 2026-07-20

## Scope re-check (Track 1, buildable)

Confirmed Track 1: both charts are pure derivations over data we already normalize and serve
on `GET /v1/companies/{symbol}/statements/income`. No free text, no LLM, no new external data,
no new base dependency (Observable Plot is already vendored). No new store, no DuckDB, no SEC
client change. Read-only, cache-aside over the same facts as `/statements`. **No scope drift.**

## Central decision — where the honesty math lives: **backend `normalize/` helper + a derived endpoint**

The residual/sign/reconciliation logic (AC-4, AC-5, AC-6) and the common-size divide (AC-8–AC-11)
are **honesty-critical** and must have exactly **one source of truth** with real unit tests. This
repo's test culture is `pytest`; there is **no JS unit-test harness** (JS is only exercised by the
Docker e2e headless render). Porting the residual math into `company.js` would leave the most
error-prone logic in the product covered only by an e2e smoke test — unacceptable for the ACs that
are the definition of done.

**Therefore:** a pure function in `normalize/` computes the bridge + common-size from an
already-built `Statement`, unit-tested in `pytest`; a small **derived, caveated** endpoint exposes
it; the frontend is a **thin Plot renderer** that draws exactly what the endpoint returns and never
recomputes a number. This matches the established "derived-with-status-and-provenance" pattern
(metrics, 13F flows) and keeps the normalize layer as the moat.

Rejected alternative (client-side compute in `company.js`): smaller diff, but no unit tests on the
residual/missing-anchor math, and it would duplicate domain sign-knowledge in JS. Rejected.

## Data flow

```
existing:  facts (cache-aside) --build_statement--> Statement(income)  --> table (unchanged)
new:       Statement(income)   --income_viz()------> IncomeStatementViz --> /statements/income/viz
                                     (normalize/viz.py, pure, tested)          |
                                                                               v
                              company.js "Chart" toggle --lazy fetch--> ClearyFi.incomeBridge()
                                                                        ClearyFi.commonSize()  (app.js, Plot)
```

`build_statement` already resolves the comparative-column trap, restatements, and provenance; the
viz helper consumes its output, so it inherits all of that for free and adds no new period logic.

---

## Backend (owner: `senior-backend-engineer`) — land first

### B1. Schema — `src/secfin/normalize/schema.py`

Add derived-view models (Pydantic v2), each carrying provenance where a step is backed by a real
reported line:

```python
class IncomeBridgeStep(BaseModel):
    kind: Literal["anchor", "flow", "residual"]     # anchor=reported subtotal, flow=reported component, residual=Other/unattributed
    canonical_concept: str | None                    # None for residual steps
    label: str                                       # "Revenue", "Cost of Revenue", "Other / unattributed", ...
    value: float                                     # magnitude drawn (>= 0); direction carries the sign
    direction: Literal["up", "down", "base"]         # base = anchor column drawn from 0; up/down = floating flow
    running_total: float                             # cumulative position AFTER this step (anchors == their reported value)
    unit: str                                        # always the monetary unit (USD); charts are monetary-only
    source_tag: str | None = None                    # provenance for anchor/flow; None for residual
    is_extension: bool | None = None                 # provenance for anchor/flow; None for residual

class IncomeBridge(BaseModel):
    available: bool                                  # False when a required anchor is missing (AC-6)
    unavailable_reason: str | None = None            # e.g. "No reported Revenue for this period"
    steps: list[IncomeBridgeStep]                    # empty when available is False
    net_income: float | None                         # the reconciliation target; final running_total must equal this

class CommonSizeLine(BaseModel):
    canonical_concept: str
    label: str
    value: float | None                              # raw reported value (None = N/A, NEVER coerced to 0 — AC-9)
    pct_of_revenue: float | None                     # value / revenue, sign preserved; None when value is None
    source_tag: str
    is_extension: bool

class CommonSize(BaseModel):
    available: bool                                  # False when revenue missing or zero (AC-10)
    unavailable_reason: str | None = None
    revenue: float | None                            # the base
    lines: list[CommonSizeLine]

class IncomeStatementViz(BaseModel):
    cik: int
    fiscal_year: int
    fiscal_period: FiscalPeriod
    period_start: str | None
    period_end: str | None
    form: str | None
    filed: str | None
    accession: str | None
    bridge: IncomeBridge
    common_size: CommonSize
    caveats: list[str]                               # same source/lag caveats the table carries (AC-12)
```

### B2. The derivation — new module `src/secfin/normalize/viz.py`

Pure, no I/O. One public entry: `income_viz(stmt: Statement) -> IncomeStatementViz`. Two private
builders. **All domain constants live here as module-level tables** (canonical knowledge, not a
company-specific hack — guardrail 4 is about not hard-coding *per-company* fixes in `statements.py`;
a concept-level sign convention is exactly the kind of canonical rule that belongs in `normalize/`).

**Monetary filter (both views):** operate ONLY on USD monetary income-statement concepts. Exclude
per-share / share-count / ratio concepts: `eps_basic`, `eps_diluted`, `dividends_per_share`,
`shares_basic`, `shares_diluted`, `effective_tax_rate`. (Filter by concept membership in an explicit
`MONETARY_INCOME_CONCEPTS` set — do not infer from `unit` strings.)

**Bridge algorithm (guarantees AC-4 + AC-5):**

1. **Anchor chain**, in canonical order, keeping only anchors present with a non-null value:
   `ANCHORS = [revenue, gross_profit, operating_income, income_before_tax, net_income]`.
   **Required endpoints:** if `revenue` or `net_income` is absent → `available=False`,
   `unavailable_reason` names the missing anchor, `steps=[]` (AC-6).
2. **Segment components** — each non-anchor monetary component belongs to the segment bracketed by
   the two nearest present anchors around its canonical position:
   - revenue → gross_profit: `cost_of_revenue`
   - gross_profit → operating_income: `research_and_development`, `sga_expense`, `operating_expenses`
   - operating_income → income_before_tax: `interest_expense`, `interest_income`,
     `nonoperating_income_expense`
   - income_before_tax → net_income: `income_tax_expense`
   If an interior anchor is absent, its two adjacent segments **merge** (components bracket to the
   nearest present anchors). `revenue`/`net_income` can't merge away — they're required.
3. **Double-count disambiguation (canonical rule, unit-tested both ways):**
   - If `operating_expenses` is present **and** (`research_and_development` or `sga_expense`) is
     present, **drop `operating_expenses`** from the walk (it's the aggregate of the parts). If only
     `operating_expenses` is present, use it.
   - `current_income_tax_expense` / `deferred_income_tax_expense` are **never** walked (sub-parts of
     `income_tax_expense`); use `income_tax_expense` only.
4. **Contribution sign** (effect on the running total, walking down the statement) —
   `CONTRIBUTION_SIGN`:
   `cost_of_revenue`, `research_and_development`, `sga_expense`, `operating_expenses`,
   `interest_expense`, `income_tax_expense` → **subtract** (`-value`);
   `interest_income` → **add**; `nonoperating_income_expense` → **add its as-reported signed value**
   (it's a net line that can be + or −). Anchors are not contributions; they set the running total
   to their reported value.
5. **Residual per segment (the plug that makes it honest):**
   `residual = (anchor_next.value − anchor_prev.value) − Σ(contribution_i in segment)`.
   Emit an explicit `kind="residual"`, `label="Other / unattributed"` step **iff** `|residual|`
   rounds to a nonzero figure at display scale (use `abs(residual) >= 1.0` in raw units as the
   epsilon — sub-dollar noise is dropped). Its `direction` follows its sign. **No step's height is
   ever chosen to force the total** — the residual is the *only* balancing term and it is labeled
   as such (AC-5).
6. **Running totals:** start at 0; the first anchor (`revenue`) is a `base` step with
   `running_total = revenue`. Then within each segment emit the flow steps (each moving the running
   total by its signed contribution) followed by the segment residual, then the next anchor as a
   `base` column whose `running_total` **equals its reported value** by construction. The **final
   running_total equals reported `net_income`** exactly (AC-4) — assert this in a test.
7. `value` on each step is the **magnitude** (`abs`) for bar height; `direction` + `running_total`
   carry the sign and position so the frontend never re-derives sign.

**Common-size algorithm (AC-8–AC-11):**
- `available=False` with reason if `revenue` is null **or** `revenue == 0` (AC-10; no divide-by-zero,
  no fabricated base).
- Else one `CommonSizeLine` per monetary concept present (canonical order): `value` = raw reported
  value (may be `None`), `pct_of_revenue = value / revenue` **with sign preserved** (`None` when
  `value is None` — AC-9/AC-11; never coerce to 0). Include `revenue` itself (100%). Provenance
  (`source_tag`, `is_extension`) carried from the statement line.

**Caveats:** reuse the exact wording the table/`/statements` convention uses (SEC EDGAR source,
filing lag, rounded display / exact on click). Define once, share.

### B3. Endpoint — `src/secfin/api/routes.py`

New route on the same public router, mirroring `get_statement`'s plumbing:

```
GET /v1/companies/{symbol}/statements/income/viz?year=&period=
    -> IncomeStatementViz   (tags=["Financials"], derived/presentation view)
```

- Resolve CIK, `_statement_facts_for_cik(...)` (identical cache-aside path — **no new SEC load
  pattern**), `build_statement(facts, cik, "income", year, period)`, then `income_viz(stmt)`.
- **404 parity with `get_statement`:** if the statement has no lines and no accession (no filing for
  the period), 404 with the same message shape. A filing that exists but yields
  `bridge.available=False` returns **200** with the unavailable reason (that's data honesty, not an
  error).
- Docstring: explicitly label this a **derived presentation view** over `/statements/income`; the
  numbers are the same normalized values, re-shaped — not a new measurement. No raw SQL (guardrail 5);
  reads through the repo via the existing helper.

### B4. Backend tests — `tests/`

New `tests/test_income_viz.py` (pure, no network — construct `Statement` fixtures):
- `test_bridge_reconciles_to_net_income` — final `running_total == net_income` for a full AAPL-shaped
  statement (**AC-4**).
- `test_residual_step_labeled_and_only_balancer` — a segment whose components don't sum to the anchor
  gap yields exactly one `kind="residual"` "Other / unattributed" step of the right sign, and no flow
  step was altered (**AC-5**).
- `test_missing_required_anchor_unavailable` — drop `revenue`, then drop `net_income`:
  `bridge.available is False`, reason names the missing anchor, `steps == []` (**AC-6**).
- `test_opex_double_count_dropped` — statement with R&D+SG&A+operating_expenses: `operating_expenses`
  is dropped from the walk; and the variant with only `operating_expenses` keeps it. Assert the
  residual stays small in the disaggregated case (**disambiguation rule**).
- `test_interior_anchor_missing_merges_segment` — no `gross_profit`: `cost_of_revenue` and the opex
  parts share the revenue→operating_income segment and still reconcile.
- `test_common_size_null_is_none_not_zero` — a null line → `pct_of_revenue is None` (**AC-9**);
  negative non-operating item keeps its sign (**AC-11**).
- `test_common_size_no_revenue_base_unavailable` — revenue null and revenue==0 → `available False`
  (**AC-10**).
- `test_per_share_concepts_excluded` — eps/shares/effective_tax_rate never appear in either view.
- `test_signs` — `nonoperating_income_expense` uses its as-reported sign; `interest_income` adds,
  `interest_expense`/taxes subtract.

Run in Docker: `docker compose --profile test run --rm test`. `pytest` must stay green (398+).

---

## Frontend (owner: `senior-frontend-engineer`) — after the endpoint is green

### F0. MOCK-FIRST GATE (do this before the full build — operator standing rule)

Hit the live endpoint for **AAPL FY2024** (and one other shape, e.g. **KO FY2024**), and render the
real numbers into the two chart builders on the real company page. **Confirm framing with the
operator before finishing**, watching specifically for:
- **Remainder/coverage dominance** — `cost_of_revenue` or one opex bucket flattening the scale.
- **An implausibly large "Other / unattributed" bar** — that's a *mapping gap* (RISK-2), not a data
  truth; if it dominates common tickers, flag it (a `normalize/mapping.py` follow-up, handled
  separately — do **not** hide the residual to make the chart prettier).
Capture the e2e screenshots and eyeball them. Only then finish styling.

### F1. Two new Plot builders — `src/secfin/api/static/app.js`

Add to the `ClearyFi.*` chart family (the ONLY place `Plot.plot()` is called — STYLE_GUIDE §6/§10),
each wrapped in `chartCard()` with `plotTokens()` theme colors and a shared honesty caption:

- **`ClearyFi.incomeBridge(bridge, opts)`** — a waterfall. **Palette constraint (§10): single
  terracotta accent, no green/red.** Encode direction by **position, not hue**:
  - `anchor`/`base` steps: solid **ink** columns drawn from 0 to `running_total` (Revenue, Gross
    Profit, Operating Income, Net Income read as the "landmarks").
  - `flow` steps: floating **accent** bars spanning `[running_total_before, running_total_after]`
    (a down-step sits below the running line, an up-step above — direction is legible from where the
    bar floats, no second hue needed).
  - `residual` steps: **accent-wash fill + dashed/outlined border**, always labeled "Other /
    unattributed", so it reads as *computed, not reported*.
  - Label each step with concept + value (reuse the app's abbrev formatter). `Plot.ruleY([0])`
    baseline. Never draw a step for a missing component (there simply is no step).
  - If `bridge.available === false`: render the card with the `unavailable_reason` as the body
    (a clear "bridge unavailable — {reason}" state), **not** an empty or partial chart (AC-6).
- **`ClearyFi.commonSize(commonSize, opts)`** — a single 100%-wide horizontal stacked bar (or a
  small-multiple of horizontal bars per line; decide in the mock). Each segment width =
  `|pct_of_revenue|`. A `null` `pct_of_revenue` line is listed as **N/A** (rendered as a labeled
  omitted row, **never a 0%/full bar** — AC-9). Negative percentages shown truthfully (AC-11).
  If `available === false`: the "unavailable (no revenue base)" state (AC-10).
  Palette: single accent (bar length already encodes magnitude — no darker-where-bigger, §10).

Both builders: theme-aware via `plotTokens()` (already reads live CSS vars → light/dark), width via
`measuredWidth(container, fallback)`, and a `.caption()` carrying the shared caveat (AC-12).

### F2. Presentation surface (OD-1 resolved) — `company.js` + `company.css` + `company.html`

**Decision: a "Table / Chart" segmented toggle at the top of the income-statement view, defaulting
to Table.** The audit-first table stays the default surface; charts are opt-in — consistent with the
page's "show your work" ethos and lowest-risk to the existing view.

- The toggle appears **only when `state.statement === "income"`** (AC-3) — balance/cashflow keep the
  table-only view untouched.
- On first switch to **Chart** for the current period, **lazily fetch**
  `/companies/{symbol}/statements/income/viz?year=&period=` and cache it per period in `state`
  (mirror how the statement is fetched at `company.js:1030`). Re-selecting a period re-renders both
  charts against that period (AC-2); the table endpoint is unchanged.
- Chart view stacks `incomeBridge` above `commonSize`, each its own card; the shared source/lag
  caveat appears under them (AC-12). Values shown match the table's abbreviated values (AC-13).
- No console errors; existing table, "Show your work" audit toggle, and raw-JSON toggle untouched
  (AC-14).

### F3. Frontend verification

- `docker compose build` (image bakes `src/`), then the Docker e2e headless render check:
  `docker compose --profile e2e up --abort-on-container-exit --exit-code-from e2e` — must pass with
  the income-statement Chart view rendering for a real ticker (AC-16), 0 console errors, both themes.
- Eyeball the e2e screenshots (mock-first gate F0 and final).

---

## Acceptance criteria → concrete checks

| AC | Check | Owner |
|----|-------|-------|
| AC-1 | Chart view reachable on income Statements tab for the selected period; renders AAPL FY2024 no errors | FE (e2e) |
| AC-2 | Change period → both charts re-render against new period | FE (e2e) |
| AC-3 | Toggle/charts appear only for income; balance & cashflow unchanged | FE (e2e) |
| AC-4 | `test_bridge_reconciles_to_net_income`: final running_total == net_income | BE (pytest) |
| AC-5 | `test_residual_step_labeled_and_only_balancer`: one labeled residual, no fudged flow | BE (pytest) |
| AC-6 | `test_missing_required_anchor_unavailable` + FE renders unavailable state, not partial bridge | BE + FE |
| AC-7 | Flow (accent, floating) vs anchor (ink, from 0) vs residual (washed/dashed) visually distinct; steps labeled | FE (eyeball) |
| AC-8 | `test_common_size_*`: pct == value/revenue, matches table values | BE (pytest) |
| AC-9 | `test_common_size_null_is_none_not_zero`; FE renders N/A, never 0% | BE + FE |
| AC-10 | `test_common_size_no_revenue_base_unavailable`; FE unavailable state | BE + FE |
| AC-11 | `test_signs` / negative line preserved in both views | BE (pytest) |
| AC-12 | Shared source/lag caveat under both charts | FE (eyeball) |
| AC-13 | Chart labels/tooltips == table abbreviated values | FE (eyeball) |
| AC-14 | 0 console errors; light+dark; table/audit/JSON toggles intact | FE (e2e) |
| AC-15 | `pytest` green (398+); new `tests/test_income_viz.py` covers residual + missing-anchor | BE (pytest) |
| AC-16 | Docker e2e headless render check passes for the chart view | FE (e2e) |

## Files to touch

**Backend (first):**
- `src/secfin/normalize/schema.py` — the six derived models (B1).
- `src/secfin/normalize/viz.py` — **new**; `income_viz()` + sign/segment/residual tables (B2).
- `src/secfin/api/routes.py` — new `GET .../statements/income/viz` route (B3).
- `tests/test_income_viz.py` — **new** (B4).
- No `mapping.py`/`DATA_MODEL.md` change (no new canonical *concept* — this is a derived view over
  existing concepts). If the mock reveals a systemic mapping gap (RISK-2), that's a **separate**
  follow-up task, not this branch.

**Frontend (second, same branch):**
- `src/secfin/api/static/app.js` — `ClearyFi.incomeBridge()`, `ClearyFi.commonSize()` (F1).
- `src/secfin/api/static/company.js` — Table/Chart toggle, lazy viz fetch + per-period cache,
  render wiring (F2).
- `src/secfin/api/static/company.css` — toggle + chart-state styling (F2).
- `src/secfin/api/static/company.html` — only if a mount container/markup hook is needed (F2).

## Invariants honored

CIK as `int` (reused from existing route plumbing); values in raw reported units with `unit` carried;
provenance (`source_tag`/`is_extension`) preserved on every non-residual step; derived numbers
labeled + caveated + carry an availability status (`available`/`unavailable_reason`), never a silent
`0`; DB stays behind the repo via `_statement_facts_for_cik` (no raw SQL in the API); SEC client
untouched (no compliance change); single-process safe (no DuckDB, no new process); Observable Plot
already vendored (no new base dependency).

## Handoff → Senior Engineer

Full-stack. **Backend first** (`senior-backend-engineer`): B1→B4, land the endpoint + JSON contract
+ green `pytest`. Then **frontend** (`senior-frontend-engineer`) on the same branch: F0 mock-first
gate (get framing sign-off), F1→F3. Branch off `master`. The residual/sign/disambiguation math in
`viz.py` is the crux — its `pytest` coverage is the definition of done for the honesty ACs.
