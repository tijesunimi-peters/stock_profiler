# Brief: institutional-tab UI cleanup (remove 4 chart sections)

**Role:** Product Manager → handoff to Principal Architect
**Task slug:** `institutional-tab-cleanup`
**Date:** 2026-07-20
**Status:** scoped; frontend-only removal. Labels mapped to exact code below.

---

## Problem / user

**User:** a developer/analyst on a company page's **Institutional** tab. After several waves of
13F visualizations were added, the tab has grown long and repeats the same "who holds the most by
value" idea in multiple forms. The operator wants it trimmed so the tab reads cleaner and each
question is answered once.

**How we'll know it's solved:** the four named chart sections no longer render on the company
Institutional tab; everything else on the tab is unchanged; nothing else on the site (notably the
**manager** page, which reuses the same chart builders) is affected.

---

## Scope

Remove **four chart sections** from the **company** Institutional tab
(`src/secfin/api/static/company.js`). Each maps to exact code:

1. **"Share of total reported value"** — the 100%-stacked composition strip
   (`chartCard("Share of total reported value")` inside `ClearyFi.compositionBars`).
2. **"Top N by value (own scale)"** — the ranked-bar chart
   (`chartCard("Top N by value (own scale)")` inside `ClearyFi.compositionBars`).
   *(1 and 2 are the two cards produced by one `compositionBars` node, mounted on the company tab
   into `#holders-chart-mount` by `mountHoldersChart`.)*
3. **"Derived holder activity"** — the diverging-bars chart (`mountActivityChart` →
   `ClearyFi.divergingBars`, mounted into `#activity-chart-mount`).
4. **"Prior → current holder allocation"** — the dumbbell chart (`mountDumbbellChart` →
   `ClearyFi.dumbbellChart`, mounted into `#activity-dumbbell-mount`; it also makes an extra
   prior-quarter holders fetch that goes away with it).

The removal is at the **company-tab call sites only** — remove the mount `<div>`s, the
`mount*` calls in `renderInstitutionalData`, and the now-unused `mount*` functions in
`company.js`.

---

## Out of scope / must NOT change

- **Do not touch the shared chart builders** in `app.js` (`compositionBars`, `compositionStrip`,
  `compositionRankedBars`, `divergingBars`, `dumbbellChart`) — the **manager page**
  (`manager.js`) still uses all of them. Removing or altering them would break the manager page.
- **Do not touch `manager.js`** — the manager page keeps all four of these charts.
- **Keep everything else on the company Institutional tab**, specifically:
  - the standing precision caveat, the **concentration stat tiles**, and the **holders detail
    table** (the composition block loses only its chart, not the tiles or table);
  - the **activity summary tiles** and the **derived-activity detail table** in the activity
    section (only the diverging-bars chart and the dumbbell are removed);
  - the newer views: reported-shares accumulation, holder geography, conviction treemap,
    co-holding network, and the **derived holder-activity trend (mix bar + share-flow)**;
  - the caveats block.
- **No backend change.** The endpoints powering the removed charts (`institutional-holders`,
  `institutional-activity`) still power the retained tiles/tables, so nothing becomes dead
  server-side. No new data, no Track-2 anything.

---

## Acceptance criteria (what QA verifies)

- **AC-1** On the company Institutional tab, **none** of these render: "Share of total reported
  value", "Top N by value (own scale)", "Derived holder activity", "Prior → current holder
  allocation".
- **AC-2** The company Institutional tab **still** renders, unchanged: the standing caveat, the
  concentration **stat tiles**, the **holders detail table**, the **activity summary tiles**, the
  **derived-activity detail table**, the accumulation chart, holder geography, conviction treemap,
  co-holding network, the **activity-mix bar + share-flow** views, and the caveats block.
- **AC-3** The **manager page** (`/manager/{cik}`) is **unaffected** — its composition strip,
  ranked bars, derived-activity diverging bars, and dumbbell all still render (the shared builders
  are untouched).
- **AC-4** No leftover empty containers, dangling mount `<div>`s, or JS references to removed
  mounts; **no console/page errors** on either the company Institutional tab or the manager page
  (e2e headless check passes).
- **AC-5 (honesty)** No retained view loses a caveat or provenance as a side effect of the
  removal — the standing 13F caveats and the retained charts' own captions/caveats are intact
  (the composition chart's precision framing already renders once via the standing caveat, not
  only inside the removed chart, so it is not lost).

---

## Risks / open decisions

- **None requiring an operator call.** The four labels map unambiguously to existing code; the
  removal is confined to `company.js` call sites; the shared builders and the manager page are
  explicitly protected. If the architect finds any of the four is *also* the sole renderer of a
  caveat/number a retained view depends on, flag it (AC-5) — but per the code this is not the case
  (tiles/tables cover the retained data; the standing caveat is separate).
- **Branch note (process, not scope):** this continues on the existing `holder-activity-viz`
  branch (it holds the related institutional-tab work not yet on `master`, and edits the same
  `company.js` region — a separate branch off `master` would conflict). Operator can redirect.

---

## Handoff → Principal Architect

Frontend-only, `company.js`-only removal of four chart call sites (mount divs + `mount*` calls +
now-unused `mount*` functions). Protect the shared builders in `app.js` and the manager page.
Keep the stat tiles, both detail tables, and all other retained views. Verify via the Docker e2e
headless check on both the company Institutional tab and the manager page, and eyeball that the
retained sections still render and nothing left an empty gap. Route to `senior-frontend-engineer`.
