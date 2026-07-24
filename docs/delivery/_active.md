# Active delivery task
task_slug: sector-v2-company
request: v2 P2 — Company view. Evolve the shipped /sector-analytics Company view (altitude 2) to the v2 prototype: per-metric sparklines (REAL, click-to-expand 8-quarter trend), segment & geographic mix (PLACEHOLDER — ASC 280 not ingested), filing history & flags (dates real per CIK; restatement/material-weakness flags Track-2 PLACEHOLDER). Carry F1/F2/F3 follow-ups. Keep F4 color + honesty rails. Frontend-only, branch off master (stacked on sector-v2). See docs/ROADMAP_SECTOR_APP_V2.md P2.
branch: sector-v2-company (off sector-v2; stacked)
next_stage: done
qa_cycles: 0
updated: 2026-07-24

## Progress
- [x] 1 Product Manager       -> 1-brief.md (scope gate PASS; Track 1, frontend-only; filing history = placeholder per operator)
- [x] 2 Principal Architect   -> 2-architecture.md (FRONTEND-ONLY confirmed; reuse P.sparkline + P.trendChart; .spark/.trend-* need local CSS; 2 placeholder cards; real context pill)
- [x] 3 Backend  — N/A (FRONTEND-ONLY confirmed by architect)
- [x] 3 Frontend             -> 3-implementation.md (sparklines + click-to-expand trend REAL; 2 placeholder cards; real context pill; .spark/.trend-* local CSS; AAPL added to fixture group; pytest 511, e2e PASS + eyeballed)
- [x] 4 QA Tester             -> 4-qa.md (PASS at QA-tester level; pytest 511, e2e PASS, AAPL history 11 pts w/ 2 gaps never 0, placeholders honest, no favorability color. PENDING operator hands-on manual UI verification.)

## Notes / open loops
- P0/P1 (sector-v2) committed (438c79e) on branch sector-v2 off master. P2 stacks on it.
- v2 P2 reference: docs/ROADMAP_SECTOR_APP_V2.md P2 + docs/design/sector-app-prototype-v2/ altitude 2.
- Classifications: sparklines = Track-1 REAL; segment/geo mix = Track-1 not ingested -> PLACEHOLDER;
  filing dates = REAL where available; restatement/material-weakness flags = Track-2 -> PLACEHOLDER.
- Keep F4 delta-color deviation; NO fabricated data; N/A never 0.
