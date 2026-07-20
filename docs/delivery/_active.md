# Active delivery task
task_slug: institutional-tab-cleanup
request: Clean up the institutional tab UI. Remove: "share of total reported value", "top 10 by value (own scale)", "derived holder activity", "prior -> current holder allocation".
branch: holder-activity-viz
next_stage: done
qa_cycles: 0
updated: 2026-07-20

## Progress
- [x] 1 Product Manager       -> 1-brief.md
- [x] 2 Principal Architect   -> 2-architecture.md  (FRONTEND-ONLY, company.js only)
- [x] 3 Frontend (removed 4 chart call sites + 3 unused mount fns from company.js)  -> 3-implementation.md
- [x] 4 QA Tester             -> 4-qa.md  (PASS)

## Notes / open loops
- DONE — QA PASS on all 5 ACs. Four chart sections removed from the company institutional tab
  (Share of total reported value, Top N by value, Derived holder activity, Prior->current holder
  allocation). Retained everything else; manager page provably unaffected (shared builders + app.js
  untouched); 0 console errors; pytest 398 passed.
- QA note: initial DOM check used innerText (CSS uppercase) -> false results; re-run with textContent
  case-insensitive; the 3 apparent fails were substring/title-match artifacts, all disproven.
- Change is on branch holder-activity-viz (UNCOMMITTED), alongside the earlier holder-activity-viz
  feature + amendment (those are committed as daa72be; this cleanup is new uncommitted work).
- Operator's next: commit + request deploy (operator-gated).
