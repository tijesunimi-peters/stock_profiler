# Active delivery task
task_slug: sector-v2-compare
request: v2 P3 — Compare view. Evolve the shipped /sector-analytics Compare view (altitude 3, sector-vs-sector) to the v2 prototype: add the 7-theme composite PROFILE RADAR (real, from theme scores) + an overlaid IQR SPREAD per metric (real, from spreads); keep the v1 paired theme bars + metric-median cards, NO winner declared, A/B color = categorical identity only (A=--accent, B=--pa-b). Keep honesty rails (N/A never 0, no fabricated data, no favorability color). Frontend-only, branch off sector-v2-company (stacked). See docs/ROADMAP_SECTOR_APP_V2.md P3 + docs/design/sector-app-prototype-v2/ altitude 3.
branch: not yet branched
next_stage: pm
qa_cycles: 0
updated: 2026-07-24

## Progress
- [ ] 1 Product Manager       -> 1-brief.md
- [ ] 2 Principal Architect   -> 2-architecture.md
- [ ] 3 Backend  — expected N/A (P3 is frontend-only per the roadmap; architect confirms)
- [ ] 3 Frontend
- [ ] 4 QA Tester             -> 4-qa.md

## Notes / open loops
- v2 sequence: P0/P1 (sector-v2, committed 438c79e) -> P2 (sector-v2-company, committed 2301754) -> P3.
- P3 branch off sector-v2-company (stacked); frontend-only per the roadmap.
- v2 P3 reference: docs/ROADMAP_SECTOR_APP_V2.md P3 + docs/design/sector-app-prototype-v2/ altitude 3
  (prototype.dc.html ~396-469: profile radar `compare.radar` + overlaid IQR `m.spread` per metric-card).
- Classifications: profile radar = Track-1 REAL (theme scores); overlaid IQR spread = Track-1 REAL
  (spreads). Keep A/B categorical color (NOT favorability); no winner; N/A never 0.
- Reuse: state.themeScores (per-theme 0-100), state.spreads[group] (per-metric medians+IQR). No new endpoint.
- INTERACTIVE view -> operator hands-on manual UI verification gate applies (like P1/P2).
- `/deliver resume` will start here at the PM stage (reconstruct from this file + the roadmap/prototype).
