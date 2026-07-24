# Active delivery task
task_slug: sector-v2-compare
request: v2 P3 — Compare view. Evolve the shipped /sector-analytics Compare view (altitude 3, sector-vs-sector) to the v2 prototype: add the 7-theme composite PROFILE RADAR (real, from theme scores) + an overlaid IQR SPREAD per metric (real, from spreads); keep the v1 paired theme bars + metric-median cards, NO winner declared, A/B color = categorical identity only (A=--accent, B=--pa-b). Keep honesty rails (N/A never 0, no fabricated data, no favorability color). Frontend-only, branch off sector-v2-company (stacked). See docs/ROADMAP_SECTOR_APP_V2.md P3 + docs/design/sector-app-prototype-v2/ altitude 3.
branch: sector-v2-compare (off sector-v2-company / master head fe3b122)
next_stage: done (QA PASS; manual UI gate satisfied via operator-directed interactive driving)
qa_cycles: 0
updated: 2026-07-24

## Progress
- [x] 1 Product Manager       -> 1-brief.md
- [x] 2 Principal Architect   -> 2-architecture.md
- [x] 3 Backend  — N/A (architect confirmed frontend-only; no endpoint/schema/dep change)
- [x] 3 Frontend              -> 3-implementation.md
- [x] 4 QA Tester             -> 4-qa.md  (PASS — manual gate: 6/6 steps via interactive automation)

## Notes / open loops
- v2 sequence: P0/P1 (sector-v2, committed 438c79e) -> P2 (sector-v2-company, committed 2301754) -> P3.
- P3 branch off sector-v2-company (stacked); frontend-only per the roadmap.
- PM verdict: scope gate PASS (Track 1, frontend-only, reuses served endpoints; no backend, no new dep).
- Two additions: (1) 7-theme composite profile radar from state.themeScores (NEW SVG renderer — no
  ClearyFi radar helper exists yet); (2) overlaid IQR spread per metric-median card from state.spreads
  (p25/median/p75 per metric). Everything else in the shipped Compare view preserved.
- Open decisions for architect: R1 not-scored theme convention on radar (never plot 0); R2 radar helper
  location (ClearyFi.radarChart vs local); R3 per-metric shared IQR axis normalization (no flipped fill).
- Classifications: both additions Track-1 REAL. Keep A/B categorical color (NOT favorability); no winner;
  N/A never 0.
- INTERACTIVE view -> operator hands-on manual UI verification gate applies (like P1/P2).
- Frontend done: all 5 sectorapp-compare* e2e pages errors=0; 390px no overflow. Radar + IQR verified
  in sectorapp-compare.png. See 3-implementation.md.
- ⚠︎ PRE-EXISTING BASELINE (not P3): e2e overall FAILs on the Company view P2 cases (sectorapp-company
  / -refocus, symbol=900001 -> 502 on metric-history cache-miss). Reproduced on the clean base with P3
  stashed -> environmental/P2, out of P3 scope. QA/operator to decide separately; not a P3 regression.
- MANUAL GATE DONE (operator, Zen, 2026-07-24): all 6 steps confirmed PASS. Two pre-existing P0-shell
  observations surfaced: (a) no Compare right rail, (b) URL doesn't update on view-switch.
- FOLLOW-ON on this branch: operator elected to ADD a Compare right rail now -> implemented
  (compareRailHtml: A/B snapshot + how-to-read honesty note). e2e all compare pages errors=0; empty
  state degrades honestly. URL-sync (b) logged as deferred follow-up in sector-app-followups.md.
- Branch ready to commit (not committed). Uncommitted: sectorapp.js/.css (radar+IQR+rail) + delivery docs.
