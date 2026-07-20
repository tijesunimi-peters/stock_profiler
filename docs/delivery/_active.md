# Active delivery task
task_slug: holder-activity-viz
request: the inflow vs outflows should changed based on the quarter selected
branch: holder-activity-viz
next_stage: done
qa_cycles: 0
updated: 2026-07-20

## Progress (amendment: period-reactive flow view — docs suffixed -flow-period)
- [x] 1 Product Manager       -> 1b-brief-flow-period.md
- [x] 2 Principal Architect   -> 2b-architecture-flow-period.md  (FRONTEND-ONLY)
- [x] 3 Frontend (mountActivityTrend(period) + activityFlowChart title)  -> 3b-implementation-flow-period.md
- [x] 4 QA Tester             -> 4b-qa-flow-period.md  (PASS)

## Notes / open loops
- DONE — amendment QA PASS on all 6 ACs. Flow view now reflects the SELECTED quarter; earliest/
  no-prior quarter -> honest empty state; mix stays period-independent. Frontend-only, no backend
  change. Verified live by driving the period selector (0 console errors).
- This amendment also resolved prior QA finding #2 (removed the unreachable flow empty-state branch).
- Prior QA finding #1 (holders_of double-read, efficiency low) still open, optional polish.
- Branch holder-activity-viz is UNCOMMITTED and now carries BOTH the original feature and this
  amendment. Operator's next: commit + request deploy (operator-gated).
