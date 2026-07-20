# 1 — Product Brief: Cash-flow statement visualizations (Cash Bridge + FCF Breakdown + Earnings-Quality combo)

**Task slug:** `cashflow-viz`
**Stage:** Product Manager → Principal Architect
**Date:** 2026-07-20

## Problem / user

The company hub's **Statements tab → Cash Flow** renders a clean, auditable table today, same
as income and balance sheet: canonical concepts in rows, values on the right, "show your work"
+ raw-JSON toggles. It's honest but purely tabular — the reader does all the interpretation.
A cash-flow statement is fundamentally about **where cash came from and where it went**
(operating vs. investing vs. financing), **how much is genuinely free** (FCF after capex), and
**whether reported profit turns into cash** (earnings quality). None of those reads at a glance
from a column of numbers.

**User:** the analyst / developer evaluating a single company on the company page. They already
trust our numbers (provenance + click-to-exact). What they lack is a fast visual read of the
cash-flow statement's *shape* — the liquidity bridge for a period, the free-cash-flow trend,
and the paper-profit-vs-cash relationship over time.

This is the third in the series that shipped `income-statement-viz` (waterfall + common-size)
and `balance-sheet-viz` (capital-structure trend + working-capital bridge + balance matrix).
We **reuse that exact pattern**: tested pure `normalize/viz.py` helper → derived, caveated
`/statements/.../viz` (and a `/viz-series` for multi-period) endpoint on the public router →
thin Observable Plot renderer behind the Statements **Table / Chart** toggle (Table stays the
default). The operator has chosen to build **all three** views:

1. **Cash Bridge waterfall** (single period) — a floating-bar walk **Beginning Cash → Net Cash
   from Operations → Investing → Financing → FX effect → Ending Cash**. Answers "did cash grow
   because the business generated it, or because the company borrowed / raised it?" This is the
   direct analog of the income waterfall and the highest-value single-period visual.
2. **FCF Breakdown** (multi-period grouped columns) — for each fiscal period, three columns:
   **Operating Cash Flow, Capital Expenditures, and Free Cash Flow (= OCF − CapEx)**. Answers
   "how much cash is left after keeping the business running, and is that trend improving?"
   This is the one genuinely **multi-period** view — it needs a series endpoint.
3. **Earnings-Quality combo** (multi-period) — **Net Income vs Operating Cash Flow** as paired
   columns per period, with a **cash-conversion line (OCF ÷ Net Income)** on a secondary axis.
   Answers "does reported profit actually turn into cash, or is it stuck in accruals?" This
   introduces the **first cross-statement join in `viz.py`** — Net Income lives on the *income*
   statement (`net_income`), OCF on the *cash-flow* statement (`cash_from_operations`).

All three derive purely from canonical concepts already mapped in `normalize/mapping.py` (the
`"cashflow"` group, plus `net_income` from `"income"` and cash levels from `"balance"`). **No
new ingest, no new canonical concepts, Track 1 only.**

## Scope (the smallest slice that delivers value)

- Add the three visuals to the **Cash Flow view of the Statements tab** on the company hub
  (`company.js` / `company.html` / `company.css` + `app.js` renderers), behind the **existing
  Table / Chart toggle** (`wireStmtViewToggle`), exactly like the income and balance views. The
  audit-first table stays the default; charts are opt-in. Reuse the `vizCache` keyed by
  statement (+ `"|series"` for the series call), as balance-sheet-viz did.
- **Chart #1 (Cash Bridge)** renders for the **single period already selected** by the existing
  Statements period selector. No new period picker.
- **Charts #2 (FCF) and #3 (Earnings-Quality)** are inherently **multi-period**: they render a
  short series of recent fiscal periods (annual FY snapshots by default; architect decides how
  many and whether quarters are included — mirror balance-sheet-viz's `/viz-series?period=FY&
  limit=6`).
- **Data source / server helper:** follow the precedent exactly. The honesty math (the bridge
  segmentation + residual, FCF subtraction, the OCF/NI ratio + its degrade rules, the cash-basis
  selection, all caveats) lives in a **tested `normalize/viz.py` helper** exposed via a
  **derived, public `/statements/cashflow/viz` endpoint** (single-period Cash Bridge) plus a
  **`/statements/cashflow/viz-series` endpoint** (the multi-period FCF + Earnings-Quality data —
  one call, one server round-trip, honesty math server-side). Frontend stays a thin Plot
  renderer. No raw SQL in the API, no new base dependency (Observable Plot already vendored).
- **Naming note:** the existing statement route uses the statement key `cashflow` (see
  `STATEMENT_CONCEPTS["cashflow"]`), so endpoints are `/statements/cashflow/viz[-series]` to
  match the income/balance precedent.

### The defining honesty constraints (non-negotiable, become ACs)

- **Never render a missing/null value as 0.** A concept absent for a period is shown as
  N/A / omitted — never a zero-height bar, never a zero-width step, never a fabricated point on
  a trend line or a fabricated ratio.
- **The bridge reconciles by identity, with a single explicit residual.** The reported
  `change_in_cash` tag is the *including-FX* period change; by construction
  `cash_from_operations + cash_from_investing + cash_from_financing + effect_of_exchange_rate_on_cash
  = change_in_cash`, and `Beginning + change_in_cash = Ending`. Any gap between the summed
  sections and the **reported** `change_in_cash` is shown as **one explicit, distinctly-styled,
  labeled "Other / unreconciled" residual** — never a silent plug that forces the walk to land.
  If the residual dominates, that's a signal (mapping gap or a filer that reports change_in_cash
  differently), surfaced, not hidden.
- **Cash basis must match the change tag (critical reconciliation subtlety).** `change_in_cash`
  has two candidate tags: the modern ASU-2016-18 tag
  (`CashCashEquivalentsRestrictedCash…PeriodIncreaseDecreaseIncludingExchangeRateEffect`)
  reconciles to the **restricted-cash-inclusive** level (`cash_and_restricted_cash`); the legacy
  tag (`CashAndCashEquivalentsPeriodIncreaseDecrease`) reconciles to `cash_and_equivalents`.
  **Beginning/Ending Cash must be drawn on the basis that matches the filer's reported
  `change_in_cash` tag** — mixing bases fabricates a residual. Which basis was used is surfaced
  as a caveat. If neither basis's beginning/ending level is available for the period boundaries,
  the bridge may render the section deltas as a **relative** walk (0-anchored) and clearly say
  beginning/ending absolute levels are unavailable — never invent them.
- **CapEx sign and FCF.** CapEx (`capital_expenditures`) is reported as a **positive payment**
  (an outflow magnitude). FCF = `cash_from_operations − capital_expenditures`. The FCF column
  must not double-subtract or flip a sign; a negative FCF (capex exceeds operating cash) reads
  truthfully as negative, not clamped.
- **Cash-conversion ratio degrades honestly.** OCF ÷ Net Income is **undefined/not-meaningful
  when Net Income ≤ 0** (a negative denominator makes the ratio sign-inverted and misleading).
  When `net_income ≤ 0` (or is null), the ratio point is shown as **N/A / "nm" (not meaningful)**
  with the columns still drawn — never rendered as 0, never a garbage large/negative value.
  (Mirror the metrics engine's `nm`-on-nonpositive-base convention.)
- **Structural absences are honest N/A, not zero.** Banks (e.g. JPM) **do not tag capex** and
  aren't classified — FCF is a genuine N/A for them, shown as such, not FCF = OCF. Where a
  required input for a view is missing for a period, that period is omitted/gapped or the view
  shows an "unavailable — missing X" state naming what's absent.

- **Mock-first (process gate, operator standing rule):** before the full frontend build, render
  the **real numbers** for **AAPL and WMT** on the real page (or a computed mock) and confirm
  framing. Watch specifically for **residual dominance in the bridge** (the "Other /
  unreconciled" term swamping the walk — signals a basis mismatch or reporting quirk) and for
  the cash-conversion line behaving sanely across periods. Get framing sign-off, then build.

### Out of scope (do not build)

- **Sankey cash pipeline** — a Sankey implies a *complete* sources→uses decomposition. We map
  only selected sub-lines (capex, dividends, buybacks, debt proceeds/repayments, acquisitions),
  so it would be dominated by an "Other / unmapped" flow or overstate completeness. Flagged,
  deferred. (Revisit only if/when the cash-flow leaf mapping is materially more complete.)
- **Raw diverging micro-bars of individual line items** — the working-capital deltas
  (`change_in_receivables/inventories/payables/…`) carry the **us-gaap element's natural sign**
  (positive = the balance increased), **not** the cash-flow presentation sign (an increase in
  receivables is a *use* of cash). Rendering raw line items left/right of a zero line would
  mislead on exactly those items. Deferred until a sign-normalization pass exists.
- **Any new ingest / new canonical concept / mapping change.** This is presentation-only over
  concepts already mapped.
- **Peer / cross-company overlay** on any view — needs the screening/peer layer (later
  milestone).
- **Income-statement or balance-sheet** changes (those viz already shipped) beyond the read of
  `net_income` the combo requires.
- Any **Track-2** content: no free-text, no LLM summarization, no generated "insights."
- New period selector, new tab, or chart-image export.
- **Ratios as new headline metric endpoints.** The cash-conversion ratio is a *chart
  annotation* derived in the viz helper for display; it is **not** a new `/metrics` concept.
  (FCF likewise — a chart series, not a new metric endpoint here.)

## Acceptance criteria (what QA will verify)

**A. Placement & trigger**
- AC-1: On the company hub, Statements tab, **Cash Flow** selected, a **Table / Chart** toggle
  is present (default Table). Chart mode renders the three visuals for a real ticker (AAPL, WMT)
  without errors.
- AC-2: Switching the selected period re-renders the single-period Cash Bridge (#1) against that
  period's data. The multi-period views (#2 FCF, #3 Earnings-Quality) reflect the company's
  series and show the correct periods.
- AC-3: The charts appear **only** for the cash-flow statement — income and balance sheet keep
  their own already-shipped viz unchanged; each statement's `vizCache` entry is keyed by
  statement (+ series suffix) so they don't collide.

**B. Cash Bridge (#1) correctness & honesty**
- AC-4: The walk renders floating bars **Beginning Cash → CFO → CFI → CFF → FX effect → Ending
  Cash**. Each interior step's magnitude and direction match the reported section value
  (`cash_from_operations` / `_investing` / `_financing` / `effect_of_exchange_rate_on_cash`);
  encoding does not rely on green/red alone (up/down encoded by floating-bar position, per the
  income waterfall precedent).
- AC-5: The bridge reconciles to the **reported** `change_in_cash`: summed sections + FX vs.
  reported change differ only by a single explicit, distinctly-styled, **labeled "Other /
  unreconciled"** residual (the sole balancer) — never a silent plug. On AAPL and WMT the
  residual is ≈ 0 (identity holds); the code path for a non-zero residual exists and is tested.
- AC-6: Beginning/Ending Cash are drawn on the **basis that matches the filer's reported
  `change_in_cash` tag** (restricted-cash-inclusive vs. equivalents-only); the basis used is
  stated in a caveat. If beginning/ending absolute levels are unavailable, the bridge renders a
  relative (0-anchored) walk and says so — it never fabricates a beginning/ending level.
- AC-7: A null section (e.g. no reported CFF for the period) is shown as N/A / omitted with a
  clear note — never a zero-height step. If a **required** anchor is missing such that the walk
  can't be built, the chart shows an "unavailable — missing X" state naming what's absent.

**C. FCF Breakdown (#2) correctness & honesty**
- AC-8: For each period, three columns render — Operating Cash Flow, Capital Expenditures, and
  Free Cash Flow — with **FCF = OCF − CapEx** (CapEx treated as the reported positive payment).
  A negative FCF reads truthfully as negative (not clamped to 0).
- AC-9: A period missing OCF **or** CapEx shows FCF as **N/A** for that period (and labels which
  input is missing) — FCF is **not** computed as OCF alone when capex is absent. Banks with no
  capex tag (JPM) therefore show FCF = N/A, not FCF = OCF.
- AC-10: No column with a null value is rendered as 0; the set of periods drawn is stated
  (e.g. "last N annual filings"), and a period lacking OCF entirely is omitted/gapped, not
  zeroed.

**D. Earnings-Quality combo (#3) correctness & honesty**
- AC-11: For each period, **Net Income** (from the income statement, `net_income`) and
  **Operating Cash Flow** (`cash_from_operations`) render as paired columns; the cross-statement
  join aligns them on the **same fiscal period key** `(fiscal_year, fiscal_period)` — a period
  present on one statement but not the other is handled honestly (that side omitted/gapped, not
  zeroed).
- AC-12: The **cash-conversion line = OCF ÷ Net Income** is plotted on a secondary axis. When
  `net_income ≤ 0` or either input is null, the ratio point is **N/A / "nm"** (not rendered as 0
  or a sign-inverted value); the columns for that period still draw where their inputs exist.
- AC-13: The secondary axis is clearly distinguished from the primary (currency) axis, labeled,
  and the ratio's meaning ("OCF per $1 of net income; >1 = profit over-converts to cash") is
  discoverable (label/tooltip). Encoding does not rely on color alone.

**E. Cross-cutting honesty & provenance**
- AC-14: All three charts carry the **same caveats** the table does (SEC EDGAR source, filing
  lag, restatement/latest-filed semantics, rounded display / exact-on-click). Cash-flow-specific
  caveats present: the cash-basis note (AC-6), the bridge-residual meaning, FCF = OCF − CapEx
  definition, and the conversion-ratio `nm`-on-nonpositive-NI rule.
- AC-15: Values displayed are the **same normalized values** served by the helper from the
  existing cache-aside facts path — no re-derivation of underlying facts, no fabricated
  precision. A tooltip/label figure matches the table's abbreviated value.
- AC-16: No console errors; theme-aware (light + dark); the existing cash-flow table, audit
  toggle, and raw-JSON toggle are unaffected; the already-shipped income and balance viz are
  unaffected.

**F. Tests**
- AC-17: `pytest` stays green (current baseline 431+). The server-side helper has unit coverage,
  including: the bridge segmentation + single-residual reconciliation, the cash-basis selection
  (modern vs. legacy change tag), the FCF subtraction incl. the missing-capex → N/A path, the
  OCF/NI ratio incl. the NI≤0 → `nm` path and the null-input paths, and the cross-statement
  period alignment.
- AC-18: The Docker e2e headless render check passes for the cash-flow chart view (extend
  `scripts/headless_check.js` as income/balance did).

## Risks / open decisions

- **OD-1 (architecture, architect to resolve): the multi-period series source.** The
  single-period `/statements/cashflow/viz` covers #1, but #2 and #3 need a series — and #3 needs
  the income statement's `net_income` alongside the cash-flow series. *PM lean:* one server-side
  `/statements/cashflow/viz-series` helper that returns the normalized multi-period payload for
  both FCF and Earnings-Quality in a single call (keeps the cross-statement join + honesty math
  server-side and tested, avoids N client round-trips). Mirror balance-sheet-viz's
  `capital_structure_series`. Architect's call on exact shape.
- **OD-2 (architecture, architect to resolve): the cross-statement join mechanics.** #3 needs
  both `income` and `cashflow` statements for each period. The helper must build/read both
  statements per period and align on `(fiscal_year, fiscal_period)`. Architect defines whether
  the series endpoint builds both statements server-side per period (preferred — one honesty
  boundary) and how a period present on one but not the other is represented. *PM lean:* build
  both statements per period in the series helper; emit per-period nulls where a side is absent;
  never cross-join or forward-fill.
- **OD-3 (design, architect + mock to resolve): bridge beginning/ending cash source.** Beginning
  cash = the *prior* period-end balance-sheet cash on the matching basis; ending = this
  period-end. Options: read the two balance-sheet instants, or use
  `Ending = Beginning + change_in_cash` with beginning from the prior instant. *PM lean:* derive
  ending from beginning + reported change (guarantees the walk lands), show beginning from the
  reported period-start cash level on the matching basis; if the prior instant is unavailable,
  fall back to the relative walk (AC-6). Mock decides if a basis mismatch shows up on AAPL/WMT.
- **OD-4 (design): conversion-ratio axis + framing.** The secondary axis and the `nm` rendering
  for NI≤0 need a clean visual treatment. *PM lean:* dashed/secondary-styled line, points
  suppressed (gap) where `nm`, with the `nm` reason on hover. Mock-time refinement.
- **RISK-1 (residual dominance / basis mismatch):** the exact mock-first hazard. If Beginning/
  Ending are drawn on a basis that doesn't match the reported `change_in_cash` tag, a large fake
  "Other / unreconciled" residual appears. Mitigate with AC-6 (basis matching) and the mock
  (AAPL + WMT framing sign-off before build). If a real residual persists on a common ticker,
  surface it and investigate the tag basis — don't hide it.
- **RISK-2 (cross-statement period misalignment):** income and cash-flow statements for the
  "same" period could disagree on the fiscal key (restatements, discontinued-ops variants). The
  join must be on `(fiscal_year, fiscal_period)` with latest-filed semantics per statement, and
  a missing side rendered as a gap — never forward-filled or cross-matched to a different period.
- **RISK-3 (banks / structural absence):** JPM has no capex, no working-capital block, and its
  cash line uses `CashAndDueFromBanks`. FCF (#2) is N/A for JPM (AC-9); the bridge (#1) should
  still work from the reported section totals + change_in_cash if present. Architect confirms the
  helper degrades to honest N/A rather than erroring on a bank.

## Handoff → Principal Architect

Design against the ACs above. Key decisions for you:
(a) the multi-period series source + shape for #2 and #3 (OD-1) — one tested `normalize/viz.py`
helper behind a derived `/statements/cashflow/viz-series` endpoint, no raw SQL, no new base dep;
(b) the cross-statement join mechanics for #3 (OD-2) — build both statements per period
server-side, align on the fiscal key, honest per-period nulls;
(c) the bridge cash-basis selection (modern vs. legacy `change_in_cash` tag → matching
`cash_and_restricted_cash` vs. `cash_and_equivalents`) and beginning/ending source, with the
relative-walk fallback (OD-3 / AC-6 / RISK-1);
(d) the single-residual reconciliation for the bridge (AC-5) and the `nm`-on-nonpositive-NI rule
for the conversion ratio (AC-12);
(e) the presentation surface — reuse the income/balance Table/Chart toggle and `vizCache`.
Track 1 only; honesty ACs are the definition of done; mock-first gate (AAPL + WMT) before the
full build.
