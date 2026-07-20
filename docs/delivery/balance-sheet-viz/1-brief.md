# 1 — Product Brief: Balance-sheet visualizations (Capital-Structure Trend + Working-Capital Bridge + Balance Matrix)

**Task slug:** `balance-sheet-viz`
**Stage:** Product Manager → Principal Architect
**Date:** 2026-07-20

## Problem / user

The company hub's **Statements tab → Balance Sheet** renders a clean, auditable table:
canonical concepts in rows, values on the right, "show your work" and raw-JSON toggles.
It's honest but purely tabular — the reader does all the interpretation. A balance sheet is
fundamentally about **structure** (how a company is financed), **liquidity** (can it cover
near-term obligations), and **balance** (the accounting identity holds). None of those reads
at a glance from a column of numbers.

**User:** the analyst / developer evaluating a single company on the company page. They
already trust our numbers (provenance + click-to-exact). What they lack is a fast visual
read of the balance sheet's *shape* — its financing mix over time, its short-term cushion,
and a structural snapshot.

This mirrors the income-statement work that just shipped (`income-statement-viz`), which
added a waterfall + common-size bar to the Income Statement view with the same
honesty guardrails. We reuse that pattern (tested `normalize/viz.py` helper → derived
`/statements/.../viz` endpoint → thin Observable Plot renderer with a Table/Chart toggle)
for three balance-sheet visuals, in this build priority order:

1. **100% Stacked Capital-Structure Trend** (multi-period) — for each fiscal period, a bar
   split into the **financing mix** (debt vs. equity, or liabilities vs. equity) normalized
   to 100%. Answers "is this company getting more leveraged over time, or staying
   equity-heavy?" This is the highest-value visual and the only **multi-period** one.
2. **Net Working Capital Bridge** (single period) — `total_current_assets` vs.
   `total_current_liabilities` on a horizontal axis with a centered zero line; the overlap /
   gap is Net Working Capital. Answers "does it have a short-term cushion, or a looming
   crunch?" Components (cash, receivables, inventory / payables, current debt) available on
   hover or in an expanded view.
3. **Structural Comparison Columns / Balance Matrix** (single period) — two stacked columns:
   Assets on one side, Liabilities + Equity on the other. Answers "what is this company made
   of, and does it balance?" — with the two **independently reported** totals
   (`total_assets` vs. `liabilities_and_equity`) shown as a visible reconciliation.

All three derive purely from canonical concepts already mapped in `normalize/mapping.py`
(the `"balance"` group). **No new ingest, no new canonical concepts, Track 1 only.**

## Scope (the smallest slice that delivers value)

- Add the three visuals to the **balance-sheet view of the Statements tab** on the company
  hub (`company.js` / `company.html` / `company.css`), behind a **Table / Chart toggle**
  exactly like the income view (audit-first table stays the default; charts are opt-in).
- **Charts #4 (bridge) and #1 (matrix)** render for the **single period already selected**
  by the existing Statements period selector. No new period picker.
- **Chart #2 (trend)** is inherently **multi-period**: it renders a short series of recent
  fiscal periods (annual FY snapshots by default; architect decides how many and whether
  quarters are included). It needs a period *series*, which the single-period
  `/statements/balance` response does not provide — this is the one genuinely new wrinkle vs.
  the income precedent (see OD-2).
- **Data source / server helper:** follow the precedent. The honesty math (which lines make
  up each side, the residual/"Other" computation, the reconciliation delta, the 100%
  normalization) lives in a **tested `normalize/viz.py` helper** and is exposed via a
  **derived, public `/statements/balance/viz` endpoint** (single-period) plus whatever the
  trend series needs (architect to shape — a `series` variant of the viz endpoint, or reuse
  of the existing history path). Frontend stays a thin Plot renderer. No raw SQL in the API,
  no new base dependency (Observable Plot already vendored).

### The defining honesty constraints (non-negotiable, become ACs)

- **Never render a missing/null value as 0.** A concept absent for a period is shown as
  N/A / omitted — never a zero-height segment, never a zero-width bar, never a fabricated
  data point on the trend line.
- **Residual / remainder buckets are a mapping-coverage gap, not economic truth.** Where the
  mapped line items on a side do not sum to that side's reported total (e.g. mapped assets <
  `total_assets`), the gap is shown as an explicit, distinctly-styled, labeled **"Other /
  unmapped"** block — never silently absorbed, never used to fudge a column to full height.
  If that block dominates, that is a signal to extend the mapping (handled separately), not
  to hide it.
- **The Assets = Liabilities + Equity reconciliation is surfaced, not forced.** The Balance
  Matrix shows both reported totals; if `total_assets` and `liabilities_and_equity` (or
  `total_liabilities + stockholders_equity`) disagree beyond a display-rounding tolerance,
  that discrepancy is shown honestly (a small annotation), not papered over by rescaling one
  column to match the other.
- **Capital-structure mix must not double-count.** Debt (`debt_current` + `long_term_debt`)
  is a *subset* of `total_liabilities`; equity is separate. The trend bar must pick one
  coherent decomposition of the financing side (architect to define: either
  Liabilities-vs-Equity, or a Debt / Other-liabilities / Equity three-way split) and the
  segments must sum to the reported total for that period — with any unmapped remainder as a
  labeled "Other" segment, same rule as above. Do **not** naively stack overlapping
  aggregates (the same trap flagged in the income common-size work).

- **Mock-first (process gate, operator standing rule):** before the full build, render the
  real numbers for real tickers on the real page and confirm framing. Watch specifically for
  **remainder/coverage dominance** (a single block — e.g. `total_assets` minus a thin set of
  mapped lines, or a big "Other liabilities" — swamping the chart) and for an implausibly
  large "Other / unmapped" block (mapping gap, not truth). Get framing sign-off, then build.

### Out of scope (do not build)

- **Tree Map** (asset/liability concentration) — deferred; mock-first flagged it as the
  coverage-dominance risk case; not this task.
- **Debt Maturity Profile / multi-layer donut** — the maturity-bucket outer ring
  (1yr / 2–5yr / 5+yr) requires the long-term-debt maturity *schedule* tags we do **not**
  currently map; out of scope until those canonical concepts exist (separate proposal).
- **Peer / cross-company overlay** on any of the three — needs the screening/peer layer
  (later milestone).
- **Income-statement or cash-flow** versions of these visuals (balance sheet only here).
- Any **Track-2** content: no free-text, no LLM summarization, no generated "insights."
- New period selector, new tab, or chart-image export.
- Ratios as headline numbers (current ratio, D/E) as *new metrics* — the metrics engine owns
  those. A chart may annotate NWC or the mix, but this task ships **visuals**, not new
  metric endpoints.

## Acceptance criteria (what QA will verify)

**A. Placement & trigger**
- AC-1: On the company hub, Statements tab, **Balance Sheet** selected, a **Table / Chart**
  toggle is present (default Table). Chart mode renders the three visuals for a real ticker
  (e.g. AAPL, WMT) without errors.
- AC-2: Switching the selected period re-renders the single-period visuals (#4 bridge, #1
  matrix) against that period's data. The multi-period trend (#2) reflects the company's
  series (its own re-render trigger is architect's call, but it must show the correct
  periods).
- AC-3: The charts appear **only** for the balance sheet — the income statement keeps its own
  (already-shipped) viz, and cash flow keeps the table-only view unchanged.

**B. Capital-Structure Trend (#2) correctness & honesty**
- AC-4: For each period bar, the segments are normalized to 100% of that period's **reported
  financing total** (the reported `total_liabilities + stockholders_equity`, or
  `liabilities_and_equity`), using the decomposition the architect defines. Segments for one
  period sum to 100% (± display rounding).
- AC-5: The decomposition does **not** double-count overlapping aggregates (debt is not added
  on top of a total-liabilities segment that already includes it). Any portion of the
  reported total not covered by the chosen mapped segments is a single labeled **"Other /
  unmapped"** segment — never a plug chosen to reach 100%.
- AC-6: A period missing a **required** input (e.g. no reported financing total, or equity
  null) is **omitted from the trend or shown as a gap** — never drawn as a 0%/100% bar or a
  fabricated point. The set of periods drawn is stated (e.g. "last N annual filings").
- AC-7: Segments are visually and textually labeled (which component, what % , and the
  absolute value on hover), and the encoding does not rely on green/red alone.

**C. Working-Capital Bridge (#4) correctness & honesty**
- AC-8: Current assets extend one direction from the zero line, current liabilities the
  other; the residual (`total_current_assets − total_current_liabilities`) is shown as Net
  Working Capital, and its sign is truthful (a negative NWC — liabilities exceed assets —
  reads as a deficit, not flipped to look positive).
- AC-9: The bridge uses the **reported** `total_current_assets` and
  `total_current_liabilities`. If either is null for the period, the bridge shows a clear
  "unavailable — missing current assets/liabilities" state naming what's missing, rather than
  summing components into a fabricated total.
- AC-10: Where component breakdowns are shown, mapped components that don't sum to the
  reported current total surface a labeled "Other / unmapped current items" residual — never
  silently absorbed; and no component with a null value is rendered as 0.

**D. Balance Matrix (#1) correctness & honesty**
- AC-11: Two columns render — Assets vs. Liabilities + Equity — each segment sized by its
  reported value; a null line is omitted/labeled N/A, never a 0-height segment.
- AC-12: Both **independently reported** totals are shown, and the reconciliation between
  `total_assets` and `liabilities_and_equity` (or `total_liabilities + stockholders_equity`)
  is surfaced: equal within display rounding → columns read as balanced; a discrepancy beyond
  tolerance → an explicit annotation of the delta. **Neither column is rescaled to force a
  match.**
- AC-13: Each side's mapped segments that don't sum to that side's reported total show a
  labeled "Other / unmapped" block for the gap (same rule as AC-5/AC-10). If a required total
  (`total_assets`, or the equity+liabilities pair) is missing, the matrix shows an
  "unavailable" state rather than a lopsided partial column.

**E. Cross-cutting honesty & provenance**
- AC-14: All three charts carry the **same caveats** the table does (SEC EDGAR source, filing
  lag, restatement/latest-filed semantics, rounded display / exact-on-click) — a chart is
  never a caveat-free surface. Balance-sheet-specific: instant/point-in-time snapshot, not a
  flow.
- AC-15: Values displayed are the **same normalized values** from the loaded statement /
  helper — no re-derivation of the underlying facts, no fabricated precision. A tooltip/label
  figure matches the table's abbreviated value.
- AC-16: No console errors; theme-aware (light + dark); the existing table, audit toggle, and
  raw-JSON toggle for the balance sheet are unaffected; the already-shipped income viz is
  unaffected.

**F. Tests**
- AC-17: `pytest` stays green (current baseline 411+). Any server-side helper has unit
  coverage, including: the 100% normalization, the residual/"Other-unmapped" computation on
  each side, the reconciliation-delta path, and the missing-required-total path.
- AC-18: The Docker e2e headless render check passes for the balance-sheet chart view.

## Risks / open decisions

- **OD-1 (design, architect to resolve, not operator-blocking): financing decomposition for
  the trend (#2).** Two-way (Total Liabilities vs. Equity) is the simplest and always
  reconciles to the reported total; three-way (Debt / Other liabilities / Equity) is more
  informative but needs the "Other liabilities" bucket handled as a real residual.
  *PM lean:* start the mock with the two-way split (guaranteed to reconcile, zero
  double-count risk), and only add the debt breakout if the mock shows it's clean. Architect
  + mock decides.
- **OD-2 (architecture, architect to resolve): the multi-period series source.** The
  single-period `/statements/balance/viz` covers #1 and #4, but #2 needs a series. Options:
  a `series`/`trend` variant of the viz endpoint, a small new
  `/statements/balance/viz-series`, or the frontend fanning out over `/periods`. *PM lean:*
  one server-side helper that returns the normalized series in a single call (keeps the
  honesty math server-side and tested, avoids N client round-trips) — but this is the
  architect's call.
- **OD-3 (scope of #1's equity detail):** the matrix could show equity as one block or break
  it out (retained earnings, paid-in capital, OCI, NCI). *PM lean:* one Equity block for v1
  to keep columns readable; breakout is a mock-time refinement, not a requirement.
- **RISK-1 (remainder/coverage dominance):** the exact hazard from `income-statement-viz` and
  the operator's standing mock-first rule. On the asset side especially, `total_assets` minus
  a handful of mapped lines can leave a large "Other" block; on the liability side, "Other
  liabilities" aggregates can dominate. Mitigate at the mock (framing sign-off before build);
  if a residual dominates common tickers, flag it as a mapping-extension candidate, don't hide
  it.
- **RISK-2 (identity won't always hold exactly):** `total_assets` and `liabilities_and_equity`
  are separately reported tags and can differ by rounding, or one may be absent. AC-12 requires
  this be shown honestly; the architect must define the tolerance and the missing-total
  behavior so AC-12/AC-13 both hold.
- **RISK-3 (sign & contra items):** contra-assets (`allowance_for_doubtful_accounts`,
  `accumulated_depreciation`) are reported as positive magnitudes but reduce their side; a
  negative equity (accumulated deficit) is real. The architect must define sign handling so
  segments are truthful (AC-8/AC-11) and a contra item is not stacked as if additive.

## Handoff → Principal Architect

Design against the ACs above. Key decisions for you:
(a) the financing decomposition for #2 (OD-1) and the exact segment set for each side that
guarantees the reconcile-or-label-residual rule (AC-5/AC-10/AC-13);
(b) the multi-period series source for #2 (OD-2) — keep the honesty math in a tested
`normalize/viz.py` helper behind a derived endpoint, no raw SQL, no new base dep;
(c) the reconciliation tolerance + missing-total behavior for #1 (RISK-2);
(d) sign handling for contra/negative items (RISK-3);
(e) the presentation surface — reuse the income view's Table/Chart toggle.
Track 1 only; honesty ACs are the definition of done; mock-first gate before the full build.
