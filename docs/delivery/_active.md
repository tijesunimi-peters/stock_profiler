# Active delivery task
task_slug: sector-migration-swap
request: P7 (Migration M2) — routing swap: make the v2 Sector Analytics app (`/sector-analytics`) the CANONICAL sector page. (1) Route: in `api/main.py`, serve the app (`sector-analytics.html` / `#app` + `sectorapp.js`) at **`/sectors`** (recommended canonical per ROADMAP_SECTOR_MIGRATION.md R1), and **301-redirect `/sector-analytics` → `/sectors`** so existing links/bookmarks keep working; pass through `?group=`, `?view=`, `?symbol=`, `?a=&b=` (the app already honors them). (2) Nav links: update every internal "Sector analytics"/"/sectors" link across `static/*` (the `sectorapp.js` sidebar, `index.html`, and any other page) to the canonical URL — no dead links. (3) Old page behind a rollback flag: keep `sectors.js/html/css` served at a temporary URL (e.g. `/sectors-legacy`) or behind an env flag for ONE release; do NOT delete `sectors.*` (that's M3). (4) e2e: repoint the `sectors*` headless shots to the new app (or drop them for the `sectorapp*` shots); keep one `/sectors-legacy` shot while the flag exists. Backend routing + frontend nav only — NO new endpoints/schema/backend logic (the app already consumes every endpoint the old page uses). See ROADMAP_SECTOR_MIGRATION.md M2 + ROADMAP_SECTOR_APP_V2.md P7.
branch: sector-migration-swap (off master)
next_stage: done
qa_cycles: 1
updated: 2026-07-24

## Progress
- [x] 1 Product Manager       -> 1-brief.md
- [x] 2 Principal Architect   -> 2-architecture.md
- [x] 3 Backend  (main.py: /sectors→app, 301 /sector-analytics→/sectors w/ param passthrough, /sectors-legacy) -> 3-implementation.md; pytest 514 passed
- [x] 3 Frontend (sectorapp.js nav→/sectors + active-check + sidebar label "Sectors"; static audit clean; e2e shots repointed, +sectors-legacy) -> 3-implementation.md; e2e clean modulo documented Company-502 baseline
- [x] 4 QA Tester             -> 4-qa.md  (✅ PASS; all 7 ACs pass on live-HTTP + pytest 514 + eyeballed shots; no defects introduced)
- [x] 4b Operator interactive acceptance -> 4b-manual-verification.md  (✅ CONFIRMED / accepted 2026-07-24; sidebar renamed "Sectors" applied+verified; Company-view scoping logged as follow-up)
- [ ] 4 QA Tester             -> 4-qa.md
- [ ] 4b Operator interactive acceptance -> 4b-manual-verification.md

## Notes / open loops
- **✅ DONE — operator-accepted 2026-07-24.** M2 routing swap complete on branch `sector-migration-swap`
  (not committed — commit/deploy are operator-gated). All 7 ACs green (live-HTTP: /sectors→app, 301 w/
  raw-query passthrough incl. unnamed params, /sectors-legacy→old page; pytest 514; eyeballed shots).
  Only nonzero e2e shot = the DOCUMENTED Company-502 baseline (not a regression). Manual gate: operator
  drove it live, all 8 ✅; requested sidebar rename "Sector analytics"→"Sectors" (applied+verified);
  Company-view selector-scoping confirmed by-design/pre-existing → logged in `sector-app-followups.md`.
- **NEXT (operator options, nothing auto-runs):** (1) commit the branch when ready; (2) request a
  deploy via `/devops-engineer` — SEQUENCE THE ANALYTICAL BATCH first (`sector_theme_scores` + metrics/
  peer-distribution) so prod `/sectors` isn't honest-empty on cutover (ROADMAP_SECTOR_MIGRATION.md §165);
  (3) M3 (delete `sectors.*` + remove `/sectors-legacy`) is a LATER /deliver after M2 bakes in prod.
- **PM done (2026-07-24).** Brief at `sector-migration-swap/1-brief.md`. Operator decisions locked:
  R1 canonical `/sectors` (redirect `/sector-analytics` in); **R4 legacy = plain always-on
  `/sectors-legacy` route, NO env flag** ("localhost dev is the only live context; prod rollback/
  sequencing deferred to /devops-engineer"). No new endpoints/schema; `sectors.*` retained (M3 later).
- **This is P7 / Migration M2 (the routing swap).** Predecessors P0–P5 (the whole v2 app build) are
  MERGED + PUSHED to master (P5 Filings view = 744e03d, merge 882200c). Migration source of truth:
  `docs/ROADMAP_SECTOR_MIGRATION.md` (M2 §117–145) as amended by `docs/ROADMAP_SECTOR_APP_V2.md` P7.
- **M1 (parity port) is OBSOLETE — do NOT port DuPont tree / ROE trend / lifecycle.** The operator
  dropped those to match v2 (v2 roadmap decision 2); the `sector-parity` branch is abandoned. The v2
  app is the agreed "superset-minus-the-dropped-charts", so M2 (swap) may proceed WITHOUT an M1 parity
  port. If the PM/architect think a parity gap blocks the swap, STOP and flag — don't re-add the charts.
- **M3 (decommission) is NOT this deliverable.** Deleting `sectors.*` + removing the legacy route
  happens AFTER M2 has baked in production for a release with no rollback (ROADMAP_SECTOR_MIGRATION.md
  M3 §149). This task keeps the old page alive behind a flag; a later `/deliver` does M3.
- **Backend + frontend, small.** Backend FIRST (main.py: the `/sectors`→app route, the 301 redirect,
  the legacy route/flag) so the routing contract lands, THEN frontend (nav-link updates + e2e shots) on
  the same branch. Architect confirms the split. No new endpoints/schema (guiding principle 2).
- **Open decisions for PM/operator (from ROADMAP_SECTOR_MIGRATION.md §171):**
  - R1 canonical URL — recommend **`/sectors`** canonical, redirect `/sector-analytics` in. (Baked into
    the request as the working default; PM/operator confirm.)
  - R4 legacy retention window — how long `/sectors-legacy` stays before M3 (one release vs a fixed
    date). Operator call; not blocking for M2.
  - (R2 DuPont range / R3 chart color are M1 concerns → moot now that M1 is dropped.)
- **Honesty carries over:** N/A never 0; caveats/provenance intact; scores are positions not verdicts.
  The swap is layout-neutral (same app), so the main risks are dead nav links, dropped query params on
  redirect, and a broken rollback path — QA should probe those + the `?group=`/`?view=` deep-links.
- **Deployment note (ROADMAP_SECTOR_MIGRATION.md §165):** on prod the scorecard/compare surfaces are
  honest-empty until the analytical batch runs (`python -m secfin.analytical.sector_theme_scores` + the
  metrics/peer-distribution pipeline). Sequence that batch before/with the swap so `/sectors` isn't
  empty on cutover. This is a DEPLOY concern (operator-gated `/devops-engineer`), not part of the build.
- **CONTEXT RESET (required for a clean M2 PM scope):** this is a NEW /deliver iteration whose
  next_stage is `pm`. The current session still holds the finished P5 context, so before running the PM
  stage **/clear (or start a fresh session)**, then run **/deliver resume** — it reads this file + the
  migration roadmap and starts at PM from a clean context. Branch off master when the engineer stage
  begins.
- Previous task (P5 Filings view) is DONE + merged + pushed; its trail is in
  `docs/delivery/sector-v2-filings/` (1-brief … 4b, operator-confirmed).
