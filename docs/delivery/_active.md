# Active delivery task
task_slug: sector-v2
request: v2 P0+P1 — Shell v2 (960px content cap + sticky right rail: Sector snapshot + What's moving feed PLACEHOLDER + how-to-read) and Sector view v2 re-arch (3 scopes: 01 scorecard+peer-strip+geo/insider placeholders; 02 decomp full-width open-by-default + shifts; 03 Distribution with [This theme]/[All metrics] toggle). Keep F4 color. Frontend-only. See docs/ROADMAP_SECTOR_APP_V2.md P0/P1.
branch: sector-v2 (off master; sector-parity/M1 abandoned, not merged)
next_stage: done
qa_cycles: 0
updated: 2026-07-24

## Progress
- [x] 1 Product Manager       -> 1-brief.md (7 ACs; scope gate PASS — re-arrange real blocks + honest placeholders; keep F4 color; no backend.)
- [x] 2 Principal Architect   -> 2-architecture.md (FRONTEND-ONLY; 3-col shell + right rail; 3-scope Sector re-arch; distribution toggle; geo/insider/feed placeholders.)
- [x] 3 Backend  — N/A (FRONTEND-ONLY)
- [x] 3 Frontend             -> 3-implementation.md (shell v2 + Sector 3-scope re-arch + distribution toggle + geo/insider/feed placeholders; F4 color kept; drilldown/feed removed from flow.)
- [x] 4 QA Tester             -> 4-qa.md (PASS at QA-tester level; pytest 511 passed; e2e HEADLESS CHECK PASS + eyeballed. PENDING operator hands-on manual UI verification — interactive gate.)

## Notes / open loops
- BRANCH FIX (2026-07-24): sector-v2 was mistakenly stacked on sector-parity (M1); re-based cleanly off
  master (cherry-picked the v2 docs commit -> master 06a29ea). M1/sector-parity ABANDONED, not merged.
- Base = master (fidelity; NO M1 DuPont/lifecycle). Keep F4 delta color.
- v2 P0 shell (960 cap + right rail) + P1 Sector 3 scopes + distribution toggle + geo/insider/feed
  PLACEHOLDERS shipped. All verified green EXCEPT the operator hands-on manual UI verification
  (interactive gate) — required before commit. NOT yet committed.
- Next in the v2 sequence after commit + manual sign-off: P2 (Company view v2).
