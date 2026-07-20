# Implementation (frontend): institutional-tab UI cleanup

**Role:** Senior Frontend Engineer → handoff to QA Tester (same branch)
**Task slug:** `institutional-tab-cleanup`
**Branch:** `holder-activity-viz` (continuing; uncommitted)
**Date:** 2026-07-20

## What changed — `src/secfin/api/static/company.js` ONLY (9 insertions, 106 deletions)

Removed four chart sections from the **company** Institutional tab, at the call sites only:

1. `renderInstitutionalData()` mount sequence — removed `mountHoldersChart(holders)`,
   `mountActivityChart(...)`, `mountDumbbellChart(...)`.
2. `holdersSection()` — removed the `#holders-chart-mount` div (kept the stat tiles); trimmed the
   block comment. This removes **"Share of total reported value"** + **"Top 10 by value (own
   scale)"** (both are the one `compositionBars` node).
3. `activitySection()` — removed the `#activity-chart-mount` and `#activity-dumbbell-mount` divs
   (kept the summary tiles + `#inst-activity-table-mount`); trimmed the block comment. This
   removes **"Derived holder activity"** + **"Prior → current holder allocation"**.
4. Deleted the now-unused functions `mountHoldersChart`, `mountActivityChart`,
   `mountDumbbellChart` (the dumbbell's extra prior-quarter `/institutional-holders` fetch goes
   away with it).
5. Repointed a dangling doc-comment reference (`mountHoldingsSeries`'s "same self-fetching pattern
   as mountDumbbellChart" → `mountHolderGeography`).

**Untouched (verified):** `app.js` shared builders (`compositionBars`/`compositionStrip`/
`compositionRankedBars`/`divergingBars`/`dumbbellChart`) and `manager.js` — the manager page still
uses all of them. `signedShares` kept (used by the retained activity detail table). No backend, no
`app.js`, no `manager.js`, no Python.

## How I verified

- **grep:** the four titles no longer appear in `company.js`; they remain in `app.js`
  (`chartCard("Share of total reported value")`, `"Top " + top.length + " by value (own scale)"`)
  for the manager page. No leftover `#holders-chart-mount` / `#activity-chart-mount` /
  `#activity-dumbbell-mount` divs or JS refs to removed symbols. `quarterLabel` still used
  (retained code). Editor diagnostics: the three "declared but never read" warnings cleared once
  the functions were deleted.
- **Docker e2e headless check** — **PASS**, all pages `errors=0`, including
  `/company/AAPL?tab=institutional`, `/company/JPM?tab=institutional`, and `/manager/1067983`.
- **Eyeballed screenshots** (`data/e2e-shots/`):
  - `institutional.png` (5401px, down from 6781): the four sections are **gone**; retained,
    in order — standing caveat, stat tiles, holders table, accumulation, geography, conviction
    treemap, co-holding network, activity-mix bar + share-flow, "Derived activity vs. prior
    quarter" (summary tiles → detail table, no charts between), caveats. **No empty gaps.**
  - `manager.png`: **unchanged** — still shows "Share of total reported value", "Top 10 by value
    (own scale)", "Derived activity", "Prior → current allocation" (AC-3 confirmed).

## For QA to probe
- Re-confirm the four titles are absent on the company institutional tab and present on the
  manager page.
- Confirm the retained tiles/tables/charts render with no empty containers or console errors on
  both pages; confirm the honesty surface (standing caveat + retained captions) is intact.

**Next:** `next_stage: qa`.
