# Architecture (amendment): period-reactive flow view

**Role:** Principal Architect → handoff to Senior Frontend Engineer
**Task slug:** `holder-activity-viz` (amendment; docs suffixed `-flow-period`)
**Date:** 2026-07-20
**Inputs:** `1b-brief-flow-period.md` (AC-1..AC-6)

---

## Scope re-check

Track 1, **frontend-only**, no new data. The `institutional-activity-series` endpoint already
returns **every** transition (`from_period`, `to_period`, `inflow_shares`, `outflow_shares`,
`net_shares`) — the flow view just needs to pick the transition matching the **selected quarter**
instead of always taking the newest. No endpoint change, no re-derivation (the derivation stays
server-side in `flows`). No DuckDB, no SEC-compliance surface. All work is in `api/static/`.

## Confirmed wiring (grounds the design)

`onPeriodChange` (`company.js:321`) sets `state.instValue` and calls `renderInstitutional()` →
`renderInstitutionalData()`, which re-runs the whole institutional view and its mount sequence
(including `mountActivityTrend`) on **every** quarter change. So making the flow key off the
selected period is sufficient for AC-2 (it re-renders on selection automatically).

## Data-window coverage (the brief's open risk — resolved)

Selectable quarters on the tab = `issuer_periods` (all ingested quarters). The endpoint caps at
`quarters` (default 6, **max 12**). **Decision:** `mountActivityTrend` fetches **`?quarters=12`**.

- Covers every selectable quarter for issuers with up to ~13 ingested quarters — comfortably
  beyond current data depth (a handful of quarters).
- The **mix chart stays 6 quarters**: it renders `transitions.slice(-6)` (the 6 newest),
  so its visible output is unchanged (AC-5).
- A selected quarter **beyond** the 12-transition window (deep-history issuers only) simply has no
  matching transition in the response → the flow shows the **honest empty state** (AC-3). The
  empty-state copy is worded neutrally ("no derived share flow available for the selected
  quarter") so it is truthful whether the cause is "no comparable prior quarter ingested" or
  "outside the fetched window" — never a wrong-quarter fallback.

No backend change is needed; a `period=` server param would be over-engineering for the realistic
window. (If future data depth routinely exceeds ~12 quarters per issuer, revisit — noted, not now.)

---

## Implementation (`senior-frontend-engineer`)

### `src/secfin/api/static/company.js`
1. **`renderInstitutionalData()`** — change the call `mountActivityTrend()` →
   `mountActivityTrend(period)` (`period` is the local `state.instValue`, already in scope).
2. **`mountActivityTrend(period)`** — take the selected quarter:
   - Fetch `/companies/{symbol}/institutional-activity-series?quarters=12`.
   - **Mix (unchanged behavior):** `P.activityMixChart(transitions.slice(-6), ...)`; same empty
     note when there are no transitions at all.
   - **Flow (now period-reactive):**
     `var tx = transitions.find(function (t) { return t.to_period === period; });`
     - If `tx` → `P.activityFlowChart(tx, { width, period })` into the flow mount.
     - If **no `tx`** → honest empty state in the flow mount for the **selected quarter**, e.g.
       title "No derived share flow for this quarter", copy naming the selected quarter and
       explaining it has no comparable prior quarter available to diff (DERIVED, never trades).
       **Never** render a different quarter's `tx` here (AC-3).
   - This restructure removes the previously-unreachable "No net share flow this quarter" branch
     (QA finding #2 from `4-qa.md`) — the flow is now chosen by period, and an emitted transition
     always has a non-zero flow, so the only empty path is "no transition for the selected
     quarter."

### `src/secfin/api/static/app.js`
3. **`activityFlowChart(transition, opts)`** — the title reflects the transition's quarter instead
   of a hardcoded "most recent quarter": use `quarterTick(transition.to_period)` (e.g. "Derived
   share flow — 2025 Q4"). The caption already renders `from → to` dynamically, so it matches the
   selection automatically (AC-1). No change to the bars/net/shares logic (still DERIVED, shares,
   single accent + direction).

---

## Acceptance criteria → checks

| AC | Check | Owner |
|----|-------|-------|
| AC-1 | Select `2025-12-31` → flow shows that transition; title + caption read `2025 Q3 → 2025 Q4`; bars/net match the endpoint's `to_period==2025-12-31` entry | frontend |
| AC-2 | Change the selector → flow re-renders to the new quarter (via `renderInstitutionalData`) | frontend |
| AC-3 | Select the earliest quarter (no prior) / a gap quarter → flow shows the honest empty state for that quarter, NOT another quarter's numbers, NOT a fabricated zero | frontend |
| AC-4 | Values stay DERIVED + shares; captions carry the 13F caveats; no "trade" wording | frontend |
| AC-5 | Mix stacked bar still shows the 6 newest, period-independent (unchanged) | frontend |
| AC-6 | e2e headless: institutional tab renders, no console errors; existing sections intact | frontend |

---

## Files to touch

- `src/secfin/api/static/company.js` — `mountActivityTrend(period)` + call site.
- `src/secfin/api/static/app.js` — `activityFlowChart` title.

**No backend, no tests-Python change** (behavior is client-side selection over an unchanged JSON
contract). Verification is the Docker e2e headless render check + eyeballing the flow view across
two different selected quarters (a derivable one and the earliest/no-prior one).

## Handoff → Senior Frontend Engineer

Frontend-only, on the same `holder-activity-viz` branch. Make the flow view key off
`state.instValue` (pick the matching transition; honest empty state for a selected quarter with no
transition — AC-3, the critical honesty point). Keep the mix chart period-independent (6 newest).
Verify with the e2e headless check and eyeball the flow at two selected quarters. Set
`next_stage: qa`.
