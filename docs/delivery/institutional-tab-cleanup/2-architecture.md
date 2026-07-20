# Architecture: institutional-tab UI cleanup

**Role:** Principal Architect → handoff to Senior Frontend Engineer
**Task slug:** `institutional-tab-cleanup`
**Date:** 2026-07-20
**Inputs:** `1-brief.md` (AC-1..AC-5)

---

## Scope re-check

Track 1, **frontend-only, `company.js`-only**. Pure removal of four chart call sites from the
company Institutional tab. **No backend, no `app.js`, no `manager.js`.** The shared builders
(`compositionBars`/`compositionStrip`/`compositionRankedBars`, `divergingBars`, `dumbbellChart`)
are used by the manager page and MUST stay. The endpoints powering the removed charts
(`institutional-holders`, `institutional-activity`) still power retained tiles/tables, so nothing
becomes dead server-side. No honesty regression: the composition precision caveat renders once via
`institutionalStandingCaveat()` (not only inside the removed chart), and the retained tiles/tables
keep their own captions.

## Exact edits (all in `src/secfin/api/static/company.js`)

### 1. `renderInstitutionalData()` mount sequence (~L508, L515, L516)
Remove these three calls:
- `mountHoldersChart(holders);`
- `mountActivityChart(period, fromPeriod, activity);`
- `mountDumbbellChart(period, fromPeriod, holders);`

Keep the rest (`mountHoldersTable`, `mountHoldingsSeries`, `mountHolderGeography`,
`mountConviction`, `mountCoHolding`, `mountActivityTrend(period)`, `mountInstActivityTable`).
`fromPeriod`/`holders`/`activity` remain used by `mountInstActivityTable`/`mountHoldersTable`.

### 2. `holdersSection()` composition block (~L611-620)
Remove the chart mount `'<div id="holders-chart-mount"></div>' +` from the `composition` string.
**Keep** the `P.statTiles(...)` (concentration tiles) and the `#holders-table-mount`. Update the
block comment (~L602-610) to drop the "ranked-bar chart mounted into `#holders-chart-mount` by
`mountHoldersChart()`" sentence (keep the stat-tiles/table description).

### 3. `activitySection()` mounts (~L866-867)
Remove `'<div id="activity-chart-mount"></div>' +` and `'<div id="activity-dumbbell-mount"></div>' +`.
**Keep** `P.activitySummaryTiles(...)` and `#inst-activity-table-mount`. Update the block comment
(~L857-862) to reflect: summary tiles then the paginated detail table (drop the diverging-bars +
dumbbell description).

### 4. Delete the now-unused functions
- `mountHoldersChart(holders)` (~L653-683, incl. its doc comment).
- `mountActivityChart(period, fromPeriod, activity)` (~L902-922, incl. its doc comment).
- `mountDumbbellChart(period, fromPeriod, currentHolders)` (~L924-952, incl. its doc comment) —
  this also drops the extra `/institutional-holders?period=<prior>` fetch.

### 5. Dangling comment reference
`mountHoldingsSeries`'s doc comment (~L550-551) says "the same self-fetching pattern as
`mountDumbbellChart`." Since `mountDumbbellChart` is deleted, repoint that comparison to a retained
self-fetching mount (e.g. `mountHolderGeography`), so no comment references a deleted symbol.

### Keep (do NOT remove)
`signedShares` (~L955) — still used by the retained `mountInstActivityTable` detail table
(~L885). All other helpers, sections, and the new activity-trend section (`activityTrendSection` /
`mountActivityTrend`) stay.

---

## Acceptance criteria → checks

| AC | Check | Owner |
|----|-------|-------|
| AC-1 | Company Institutional tab: grep the rendered DOM — none of the 4 titles present ("Share of total reported value", "Top N by value (own scale)", "Derived holder activity", "Prior → current holder allocation") | frontend |
| AC-2 | Same tab still shows: standing caveat, stat tiles, holders table, activity summary tiles, derived-activity detail table, accumulation, geography, conviction, co-holding, activity-mix bar + share-flow, caveats block | frontend |
| AC-3 | `/manager/{cik}` still renders composition strip + ranked bars + diverging bars + dumbbell (shared builders untouched) | frontend |
| AC-4 | No leftover `#holders-chart-mount` / `#activity-chart-mount` / `#activity-dumbbell-mount` divs or JS refs; e2e headless: 0 console/page errors on company institutional + manager | frontend |
| AC-5 | Retained views keep their caveats/provenance; standing caveat intact | frontend |

---

## Files to touch

- `src/secfin/api/static/company.js` — the five edits above.
- **No other files.** No backend, no tests-Python, no `app.js`, no `manager.js`.

## Verification

Docker e2e headless render check (`docker compose --profile e2e up --abort-on-container-exit
--exit-code-from e2e`) — it already loads `/company/AAPL?tab=institutional`,
`/company/JPM?tab=institutional`, and `/manager/1067983`. Confirm 0 errors, then **eyeball**:
(a) the company institutional screenshot — the four sections gone, the retained tiles/tables/charts
present, no empty gap; (b) the manager screenshot — its composition/ranked/diverging/dumbbell still
render (AC-3).

## Handoff → Senior Frontend Engineer

Frontend-only, on the `holder-activity-viz` branch (continuing — same tab/file, not yet on
`master`). Apply the five `company.js` edits; do not touch `app.js`/`manager.js`/backend. Verify via
the e2e headless check on both the company institutional tab and the manager page, eyeball the
screenshots (removed gone, retained intact, manager unaffected), then set `next_stage: qa`.
