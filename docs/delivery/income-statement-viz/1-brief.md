# 1 — Product Brief: Income-statement visualizations (Waterfall + 100% common-size bar)

**Task slug:** `income-statement-viz`
**Stage:** Product Manager → Principal Architect
**Date:** 2026-07-20

## Problem / user

The company hub's **Statements tab → Income Statement** currently renders a clean but
purely tabular view: canonical concepts in rows, values on the right, an audit ("show your
work") toggle, raw-JSON toggle. It's honest and auditable, but it makes the reader do all
the *interpretation* — you can't see at a glance **where the revenue dollar goes** (margin
erosion) or **how the cost structure compares** in relative terms.

**User:** the analyst / developer evaluating a single company on the company page. They
already trust our numbers (provenance + click-to-exact); what they lack is a fast visual
read of the income statement's *shape* for one period.

Two visuals close that gap, both derivable purely from data we already serve on
`GET /v1/companies/{symbol}/statements/income`:

1. **Waterfall / financial bridge** — steps from Revenue down through the mapped expense
   buckets to Net Income for one selected period. Answers "which bucket eats the biggest
   slice of revenue?"
2. **100% common-size horizontal bar** — every line item as a percentage of Revenue.
   Answers "what's the relative cost structure?" and is the natural setup for later
   peer-benchmarking (out of scope here).

## Scope (the smallest slice that delivers value)

- Add both charts to the **income-statement view of the Statements tab** on the company hub
  (`company.js` / `company.html` / `company.css`), for the **single period already selected**
  by the existing Statements period selector. No new period picker.
- **Data source:** the existing `/statements/income` response already loaded for the table.
  No new endpoint required if the mapped `lines[]` suffice (architect to confirm); if a
  small server-side helper is cleaner, it stays within the canonical statements layer.
- **Waterfall honesty — the defining constraint:** the bridge must be built between the
  **reported anchor subtotals** the filer actually reports (Revenue → Gross Profit →
  Operating Income → Income Before Tax → Net Income, using whichever anchors are present),
  with the mapped component lines shown as steps *within* each segment. Where the mapped
  components in a segment do **not** sum to the next reported subtotal, the gap is shown as
  an explicit, labeled **"Other / unattributed"** step — never silently absorbed, never
  forced by fudging a bar. The waterfall must **land exactly on reported Net Income.**
- **Common-size honesty:** each row is `value ÷ Revenue`. A line with a missing (null)
  value is rendered as **N/A / omitted**, never as 0%. Signs preserved (a contra/other-income
  item that is negative shows as such, not flipped to look like a cost).
- **Mock-first (process gate, per operator standing rule):** before the full build, render
  the real numbers for a real ticker on the real page and confirm the framing — watch
  specifically for remainder/coverage dominance (one giant bucket, e.g. COGS, swamping the
  chart) and for the "Other / unattributed" bucket being implausibly large (a mapping gap,
  not a data truth). Get framing sign-off, then build.

### Out of scope (do not build)

- **Sankey / flow diagram** (operator deferred it; heavier, lower priority).
- **Stacked-column-over-years, combo growth-vs-margin** (the other three chart types
  discussed — not this task).
- **Peer / cross-company overlay** on the common-size bar (needs the screening/peer layer;
  a later milestone).
- **Balance-sheet or cash-flow** waterfalls/common-size views (income statement only here).
- Any **Track-2** content: no free-text, no LLM summarization of the chart, no narrative
  "insights" generated from the numbers.
- New period selector, new tab, or export/download of the chart image.

## Acceptance criteria (what QA will verify)

**A. Placement & trigger**
- AC-1: On the company hub, Statements tab, **Income Statement** selected, both visuals are
  reachable for the currently-selected period. (Architect decides toggle-vs-inline; QA
  checks they render for a real ticker, e.g. AAPL FY2024, without errors.)
- AC-2: Switching the selected period re-renders both charts against that period's data.
- AC-3: The charts appear **only** for the income statement — not on balance sheet or cash
  flow (those keep the table-only view unchanged).

**B. Waterfall correctness & honesty**
- AC-4: The waterfall's final cumulative position equals the **reported Net Income** value
  for the period (to display rounding), i.e. the bridge reconciles exactly.
- AC-5: Every segment whose mapped components don't sum to the next reported anchor shows a
  distinctly-styled, explicitly-labeled **"Other / unattributed"** step for the residual.
  There is **no** step whose height was chosen just to make the total balance.
- AC-6: If a **required anchor is missing** (e.g. Revenue or Net Income is null for the
  period), the waterfall does **not** draw a misleading partial bridge — it shows a clear
  "bridge unavailable for this period" state naming what's missing.
- AC-7: Expense steps are visually distinguishable from income/subtotal steps
  (down vs up vs anchor), and each step is labeled with its concept and value.

**C. Common-size correctness & honesty**
- AC-8: Each bar segment's percentage equals `line.value ÷ revenue.value` for that period,
  using the same values shown in the table.
- AC-9: A line with a **null** value is rendered as N/A / omitted, **never 0%**; the chart
  does not fabricate a zero-width or full-width bar for missing data.
- AC-10: If **Revenue is missing or zero**, the common-size view shows an "unavailable
  (no revenue base)" state rather than dividing by zero or by a fabricated base.
- AC-11: Negative line items (contra-revenue, losses, negative non-operating items) are
  represented truthfully (not silently abs()'d into a positive cost).

**D. Cross-cutting honesty & provenance**
- AC-12: Both charts carry the **same caveat** the table does (SEC EDGAR source, filing lag,
  rounded display / exact-on-click semantics) so a chart is never a caveat-free surface.
- AC-13: Values displayed on the charts are the **same normalized values** from the loaded
  statement (no re-derivation, no fabricated precision). Where a tooltip/label shows a
  figure it matches the table's abbreviated value.
- AC-14: No console errors; theme-aware (renders in light and dark); the existing table,
  audit toggle, and raw-JSON toggle are unaffected.

**E. Tests**
- AC-15: `pytest` stays green (398+). If the architect adds any server-side helper, it has
  unit coverage (including the residual/"other" computation and the missing-anchor path).
- AC-16: The Docker e2e headless render check passes for the income-statement chart view.

## Risks / open decisions

- **OD-1 (design fork, architect to resolve, not operator-blocking): presentation surface** —
  charts inline below the table vs. a "Table / Chart" toggle within the income view.
  *PM recommendation:* a lightweight toggle (or a collapsible "Visualize" block) so the
  audit-first table stays the default and the charts are opt-in. Defer exact affordance to
  the architect + mock.
- **OD-2 (honesty, already decided in-brief):** the "Other / unattributed" residual is a
  first-class labeled step, not a hidden plug. This is AC-5 and is non-negotiable.
- **RISK-1 (remainder/coverage dominance):** COGS or a single opex bucket can dominate the
  scale and flatten everything else; mitigate in the mock (framing sign-off before build).
  Not a blocker, but the mock-first gate exists precisely for this.
- **RISK-2 (mapping-gap masquerading as truth):** a large "Other / unattributed" bar is
  usually an *unmapped* tag, not a real economic bucket. It's honest to show it, but if the
  mock reveals it dominating common tickers, flag whether the mapping needs extending
  (`normalize/mapping.py`) — a mapping improvement, handled separately, not by hiding it.
- **RISK-3 (sign conventions):** US-GAAP reports most expenses as positive magnitudes; the
  bridge subtracts them while non-operating items may be genuinely signed. The architect
  must define the sign handling explicitly so AC-4/AC-11 both hold.

## Handoff → Principal Architect

Design against the ACs above. Key decisions for you: (a) whether the mapped `lines[]` from
the existing `/statements/income` response are sufficient client-side or whether a small
canonical-layer helper should compute the anchor-segmented bridge + residuals server-side
(keep any such helper in `normalize/`, behind the API, with unit tests — no raw SQL, no new
base dependency; Observable Plot is already vendored); (b) the presentation surface (OD-1);
(c) the exact anchor sequence and residual computation that guarantees AC-4/AC-5. Track 1
only; no new external dependency; honesty ACs are the definition of done.
