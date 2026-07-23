# Active delivery task
task_slug: compare-fidelity
request: Compare-view PROTOTYPE FIDELITY pass for /sector-analytics — adopt the prototype's altitude-3 layout (A/B header with swatches + counts, composite-scores card with name|bars|gap 170/1fr/84 rows, metric cards minmax(280) on bg-tint). KEEP the dropdown selectors (operator). NO synthetic elements (Compare is all real). Frontend-only.
branch: not yet branched
next_stage: done
qa_cycles: 0
updated: 2026-07-22

## Progress
- [x] 1 Product Manager       -> 1-brief.md (7 ACs; scope gate PASS — frontend-only layout, no data, Compare all-real so NO placeholders. Keep dropdowns; prototype header/composite-card/metric-cards.)
- [x] 2 Principal Architect   -> 2-architecture.md (FRONTEND-ONLY. cmpHead(A,B)->A/B swatch+name+counts header; cmpThemesHtml->'Composite scores · shared 0–100 scale' card; cmpScoreRow/NotScored->grid 170px 1fr 84px (name|bars|gap), .pa-cmp-bars middle cell; cmpMetricsHtml cards->minmax(280) auto-fit on --bg-tint. sectorPeerCount helper. CSS .pa-cmp-head2/.pa-cmp-scorecard/.pa-cmp-row grid + mobile. Owner: senior-frontend-engineer.)
- [x] 3 Backend  — N/A (FRONTEND-ONLY)
- [x] 3 Frontend -> 3-implementation.md (cmpHead(A,B) A/B header + sectorPeerCount counts; cmpThemesHtml
      .pa-cmp-scorecard 'Composite scores · shared 0–100 scale'; cmpScoreRow/NotScored grid 170/1fr/84
      name|bars|gap; cmpMetricsHtml cards auto-fit minmax(280) on --bg-tint; dropdowns kept. pytest
      511/6; e2e PASS errors=0; driving 13/13; EYEBALLED header+card+cards+mobile.)
- [x] 4 QA Tester             -> 4-qa.md (PASS — pending manual UI verification. pytest 511/6; e2e
      PASS errors=0; driving 13/13. Header A/B swatch+name+counts (59 vs 44 filers); composite card
      170px 538px 84px rows; metric cards auto-fit + --bg-tint (rgb 239,233,222); A=accent/B=blue no
      color no winner; N/A + lower-is-better intact; dropdown recompute; mobile overflow=0. Manual UI verification ACCEPTED at the QA-tester level (operator 2026-07-22) — verdict PASS, ready to deploy.)

## Notes / open loops
- Third fidelity iteration (Sector done 10cf5ba; Company done 36aaa30/33c68da). Compare view ONLY.
- Operator decision (2026-07-22): KEEP the A/B <select> dropdowns (scalable) rather than the
  prototype's pill rows; adopt the REST of the prototype layout.
- NO synthetic elements in Compare -> no placeholders needed (all real: theme scores + metric medians).
- Layout changes: header = A-name+accent swatch · vs · B-name+blue swatch · counts (replaces the
  "01 Sector compare" section head); composite rows -> grid 170px | paired A/B bars | 84px gap in a
  "Composite scores · shared 0–100 scale" card (bg-card+shadow); metric cards -> repeat(auto-fit,
  minmax(280px,1fr)) on --bg-tint. Preserve: no color, no winner, true-length bars, lower-is-better
  marker, N/A cells, footer caption. Frontend-only (sectorapp.js + sectorapp.css).
