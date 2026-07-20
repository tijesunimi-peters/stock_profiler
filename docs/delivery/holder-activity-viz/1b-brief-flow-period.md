# Brief (amendment): period-reactive inflows-vs-outflows flow view

**Role:** Product Manager → handoff to Principal Architect
**Task slug:** `holder-activity-viz` (amendment; docs suffixed `-flow-period`)
**Date:** 2026-07-20
**Status:** scoped; frontend-only expected. Amends the just-shipped `holder-activity-viz`.

---

## Problem / user

**User:** an analyst on the company **Institutional** tab who uses the quarter selector to move
through 13F quarters.

**Pain today:** the just-shipped **inflows-vs-outflows flow view** (Viz 2, `activityFlowChart`)
always shows the **most recent** quarter-over-quarter transition, regardless of which quarter the
user has selected in the tab's period selector. Everything else on the tab (holders, activity
diff, dumbbell) updates with the selected quarter, so the flow view is the odd one out — a user
who selects an older quarter still sees the latest quarter's net flow, which is confusing and
subtly dishonest (the flow's own caption names a `from → to` that no longer matches the selected
quarter).

**How we'll know it's solved:** the flow view reflects **the selected quarter's**
quarter-over-quarter share flow (inflow / outflow / net), and its caption's `from → to` matches
the selection. When the selected quarter has no derivable flow, it says so honestly for that
quarter rather than showing a different quarter's numbers.

---

## Scope

**One UI-behavior change:** make the **flow view (Viz 2)** react to the quarter selected on the
Institutional tab.

- The activity-series endpoint already returns **every** transition (`from_period`, `to_period`,
  `inflow_shares`, `outflow_shares`, `net_shares`). So the flow view selects the transition whose
  `to_period` equals the selected quarter, instead of always taking the last one. **Expected
  frontend-only** — no new/changed endpoint or derivation (architect confirms).
- The flow view's title/caption reflect the **selected** quarter's `from → to`.

---

## Out of scope

- **The 6-quarter mix stacked bar (Viz 1) stays period-INDEPENDENT.** It is a *trend across
  recent quarters*; reacting to a single selected quarter would destroy its purpose. The request
  is specifically about "inflow vs outflows" (the flow view), not the mix.
- **No backend change** (no re-derivation, no new endpoint) unless the architect finds the
  selected quarter can fall outside the data the endpoint already returns and decides a small
  server change is the honest fix — flag it, don't silently expand scope.
- No change to the honesty model, caveats, or the existing single-quarter activity section.
- Not Track 2; no new data.

---

## Acceptance criteria (what QA verifies)

- **AC-1** Selecting a quarter that **has a derivable transition** (its calendar-prior quarter is
  ingested) makes the flow view show **that quarter's** inflow / outflow / net, and the caption's
  `from → to` matches the selection (e.g. select `2025-12-31` → caption reads `2025 Q3 → 2025 Q4`
  and the bars/net are that transition's values).
- **AC-2** Changing the quarter selector **updates the flow view** to the newly-selected quarter
  (re-render on selection, like the rest of the tab).
- **AC-3 (honesty — critical)** When the selected quarter has **no derivable transition** (its
  calendar-prior quarter isn't ingested, or it's the earliest quarter with no prior), the flow
  view shows an **honest empty/explanatory state for that quarter** — it must **never** display a
  different quarter's flow numbers under the selected quarter, and never fabricate a zero flow.
- **AC-4** The values shown remain **DERIVED** and **in shares** (not value), carrying the same
  13F caveats already on the view (derived-not-trades, long-only, ~45-day lag). No number is
  presented as a reported trade.
- **AC-5** The **mix stacked bar (Viz 1) is unchanged** — still a period-independent trend over
  recent quarters, not reacting to the selected quarter.
- **AC-6** No regression: the existing single-quarter activity section (tiles / diverging bars /
  dumbbell / table), the holders views, and the mix chart all still render; e2e headless check
  passes with no console errors.

---

## Risks / open decisions

- **Data-window coverage (architect's call).** The endpoint caps at `quarters` transitions
  (default 6, max 12). If a user can select a quarter **older** than the returned window, that
  transition won't be in the response even though it's derivable. The architect should ensure the
  selected quarter is covered — e.g. request a wider window sufficient for the tab's selectable
  quarters — OR, if that's insufficient/awkward, decide whether a small backend param is the
  honest fix. Either way, a selected quarter with no available transition must hit AC-3's honest
  empty state, never a wrong-quarter fallback.
- No public-facing marketing copy involved; standard honesty caveats already apply.

---

## Handoff → Principal Architect

Frontend-behavior change to `activityFlowChart` / `mountActivityTrend` (and its call site in
`renderInstitutionalData`): the flow view keys off the **selected quarter** (`state.instValue`),
picking the matching transition from the already-returned series; honest empty state when the
selected quarter has no transition (AC-3). Keep the mix chart period-independent (AC-5). Confirm
the selected quarter is always within the fetched data window (risk above) and route to
`senior-frontend-engineer` (expected frontend-only).
