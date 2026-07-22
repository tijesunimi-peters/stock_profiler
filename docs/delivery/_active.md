# Active delivery task
task_slug: sector-overview-shell
request: Phase 1 of docs/REDESIGN_SECTOR_OVERVIEW.md — single-sector page shell + sidebar submenu for /sectors. Frontend-only (all endpoints exist; do NOT consume /sectors/theme-scores — that's Phase 2). Re-home today's per-sector analytics (DuPont tree, ROE trend, per-sector spreads, lifecycle) under a searchable single-sector selector (combobox + recently-viewed pills; default largest by peer_count, ?group= overrides, last-viewed in localStorage) replacing the all-sectors table. Shared header (breadcrumb, peer-count pill, as-of FY). Sidebar: flat Sectors link -> expandable parent with Overview -> /sectors as its only child now; top-level entries untouched. Cross-page state via URL params + localStorage. Remove the cross-sector #spreads section (returns as Phase 3 peer strip). N/A never 0; honest states; theme-aware/CSP-safe.
branch: sector-overview-shell (STACKED on sector-theme-scores, not master — Phase 0 unmerged; code is independent, rebases clean once P0 merges)
next_stage: done
qa_cycles: 0
updated: 2026-07-21

## Progress
- [x] 1 Product Manager       -> 1-brief.md (14 ACs; scope gate PASS Track 1; FRONTEND-ONLY. Locked:
      re-home per-sector analytics; sidebar Overview-only. KEY scope call: cross-sector #spreads
      REMOVED (returns as Phase 3 peer strip).)
- [x] 2 Principal Architect   -> 2-architecture.md (frontend-only. Resolved R1-R4: R1 REMOVE
      cross-sector #spreads (per-sector spreads stay, move into body); R2 no period picker, as-of FY
      metadata only, no year/period param threaded; R3 nested-parent submenu expanded-by-default,
      real button aria-expanded, keyboard; R4 UPDATE scripts/headless_check.js PAGES -- drop the 3
      ?metric= cross-spread shots, keep/adapt sectors + ?group=60/73, add selector-open + unknown-
      group shots. State model = client-side filter over /sectors list; state{group,range}; resolve
      ?group= -> localStorage secfin:lastSector -> default largest peer_count; history.replaceState
      like compare.js. sectors.js: KEEP dupontTree/paintTrend/paintDetailSpreads/paintLifecycle,
      REMOVE table+cross-spread, ADD renderSectorBar/selectSector/renderBody. Files: sectors.html/js/
      css, script.js (nested GROUPS children + .side-parent/.side-children CSS in style.css),
      headless_check.js. NO backend/schema/DATA_MODEL change. suggest.js NOT reused (server ticker
      widget). AC->check table done.)
- [x] 3 Frontend  -> 3-implementation.md (branch sector-overview-shell, STACKED on Phase 0.
      script.js nested GROUPS children + .side-parent/.side-children submenu (Sectors -> Overview,
      expandable, keyboard); sectors.html #sectorbar (removed #spreads); sectors.js SPINE REWRITE --
      removed table + cross-sector spread, re-homed dupontTree/paintTrend/paintDetailSpreads/
      paintLifecycle, added state+localStorage MRU (secfin:lastSector/sectorMRU), resolveInitialGroup
      (?group=->last-viewed->default largest peer_count), renderSectorBar (breadcrumb+pills+combobox+
      recent pills+not-found note), self-contained combobox, selectSector (history.replaceState, no
      reload), renderBody; sectors.css sb-* styles (dropped table/cross-spread); headless_check.js
      PAGES per R4 (dropped 3 ?metric= shots, added sectors-selector + sectors-unknown-group). pytest
      506 pass (no regress). e2e PASS errors=0, EYEBALLED 4 shots: default lands on Business Services
      (73, largest peer_count) w/ full body + submenu; combobox filters "in" w/ counts; unknown ?group
      =99 -> muted fallback note; banks (60) lifecycle HONEST EMPTY (not zero). N/A never 0 confirmed.)
- [x] 4 QA Tester             -> 4-qa.md (PASS — all 14 ACs verified by exercising the running
      feature. pytest 506 pass; e2e HEADLESS CHECK PASS errors=0; scripted interaction drive 20/20
      PASS. AC-1 default->Business Services (largest peer_count), no table; AC-3 combobox filter +
      in-place select + URL ?group=60 + localStorage last/MRU; AC-4 last-viewed restore; AC-8
      expandable submenu, Overview .current, top-level intact, keyboard Enter collapse/expand; AC-9
      banks lifecycle honest empty "not zero"; AC-11 intercepted empty /v1/sectors -> honest empty;
      AC-12 app is LIGHT-ONLY (no dark theme exists; new CSS token-driven), mobile 390px overflow=0.
      Cross-sector #spreads + ?metric= confirmed gone. No defects. UNCOMMITTED, NOT deployed. Branch
      STACKED on Phase 0.)

## Deploy note
- PASS unlocks a deploy REQUEST, not a deploy. Frontend/static-only change; deploy = rebuild api
  image + ship. Branch STACKED on Phase 0 (sector-theme-scores, unmerged) -- merge Phase 0 first (or
  both together); Phase 1 code is independent and rebases clean. Operator next: commit branch and/or
  /devops-engineer.

## Notes / open loops
- Frontend-only. Owner senior-frontend-engineer. No backend stage.
- Reuse EXISTING endpoints: /sectors (selector list + peer_count + as-of FY), /sectors/{group}
  (DuPont tree + ROE trend), /sectors/{group}/spreads (per-sector box-per-metric), /sectors/{group}/
  lifecycle (CCC trend). Do NOT touch /sectors/theme-scores (Phase 2).
- Files: static/sectors.html, sectors.js, sectors.css, script.js (sidebar GROUPS + expandable
  affordance), app.css/style.css (side-group/side-link tokens). Mirror compare.js for URL-param
  state; reuse app.js guarded localStorage try/catch pattern.
- Verify: Docker e2e headless render check (screenshots eyeballed) + pytest green.
- HONESTY: N/A never 0 (broken DuPont leg / empty spread / trend gap breaks line, not 0); per-panel
  honest empty/loading/error; failed enhancement degrades without blanking page; theme-aware tokens;
  CSP-safe (no new external assets).
