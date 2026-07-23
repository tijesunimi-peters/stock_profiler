# Active delivery task
task_slug: company-fidelity
request: Company-view PROTOTYPE FIDELITY pass for /sector-analytics — match the prototype's altitude-2 layout (header ticker/context/basis, "Peer distribution" heading + affordance, composite card + placeholder trend, default focal, breadcrumb dropdown), honest placeholders for synthetic elements. Frontend-only. Bundles F1/F2/F3 (+ F4-Company = color-free). Governing directive: docs/delivery/sector-app-followups.md.
branch: not yet branched
next_stage: done
qa_cycles: 1
updated: 2026-07-22

## Progress
- [x] 1 Product Manager       -> 1-brief.md (9 ACs; scope gate PASS — frontend-only, reuse endpoints,
      honest placeholders + real derived data. F1 default focal=first-alpha in largest sector; F2
      breadcrumb dropdown of SIC peers; F3 header context/basis pills + ticker-when-known + Peer-
      distribution heading + affordance + composite keep-real-%-placeholder-trend + click-decompose;
      F4-Company color-free. R1-R5 for architect.)
- [x] 2 Principal Architect   -> 2-architecture.md (VERDICT: FRONTEND-ONLY. resolveDefaultFocal
      (largest sector by peer_count -> dot-cloud -> sort name -> selectFocalCik; trigger in setView/
      init; ?symbol wins). state.focalTicker (ticker search only, cleared on cik/default). coHead
      rebuilt: name <select> of peers (F2) + ticker pill when-known + context pill (N peers·SIC) +
      basis (FY). Peer-distribution heading + affordance line. Composite: keep real % + "trend — to be
      defined" placeholder + #coCompBtn decompose (per-theme pcts). Color-free. CSS header pills/select
      + placeholder + mobile. headless default-focal shot + dropdown/decompose interactions. Owner:
      senior-frontend-engineer.)
- [x] 3 Backend  — N/A (FRONTEND-ONLY)
- [x] 3 Frontend -> 3-implementation.md (sectorapp.js/css: state focalTicker/defaultFocalTried/
      coCompOpen; resolveDefaultFocal (largest DATA-BEARING sector -> first-alpha -> selectFocalCik);
      setView/init triggers; focalTicker from ticker search only; coHead rebuilt w/ peer <select> +
      ticker/context/basis pills; Peer-distribution heading + affordance; composite real % + trend
      placeholder + #coCompBtn decompose; wireCompanyView handlers; color-free. CSS header/select/pills
      + placeholder + mobile. headless default-focal shot + decompose interaction. pytest 511/6; e2e
      PASS errors=0; EYEBALLED default populated + header pills + composite + mobile.)
- [x] 4 QA Tester             -> 4-qa.md (PASS — pending manual UI verification. pytest 511/6; e2e
      PASS errors=0 (after fixing default-focal to fall through to the largest DATA-BEARING sector);
      driving 14/14. Confirmed: default focal populated (Machinery Co 1); breadcrumb dropdown of 10
      SIC peers re-focuses; context pill 10 peers·SIC 35 + FY2025; ticker pill only on ticker search
      (AAPL), cleared on dot-click; composite real P + 'not a ranked position' + 'trend — to be
      defined' placeholder + click-decompose; dots neutral/diamond accent no color; mobile overflow=0;
      Sector/old-sectors intact. MANUAL UI VERIFICATION COMPLETE (operator 2026-07-22, 4/4): step 3
      found a dead-end (dataless-ticker search had no way back) -> fixed in-cycle (cycle 1) with a
      "← Back to a default filer" button + name label fix (33c68da); re-confirmed. Verdict: PASS,
      ready to deploy.)

## Notes / open loops
- Second fidelity iteration (Sector done: sector-fidelity 10cf5ba). Company view ONLY.
- Operator decisions (2026-07-22): composite = KEEP real derived percentile styled like the
  prototype card + PLACEHOLDER only the "vs last FY" trend ("trend — to be defined"); F1 default focal
  = first company alphabetically in the LARGEST sector by filer count (reuse /sectors + dot-cloud
  endpoint; honest empty/error fallback). Company view stays COLOR-FREE (prototype §3.1; no trend-delta
  here) — F4-Company is a no-op.
- Honesty rail: placeholders unmistakably empty, never fabricated; ticker pill shown only when known
  (from a ticker search), omitted on cik/dot-click/default — never a fake ticker; composite stays
  "derived · not a ranked position" (no fabricated rank).
- Frontend-only (sectorapp.js + sectorapp.css), reuses /companies/{sym}/peers, /sectors, and
  /sectors/{group}/{metric}/companies. No backend.
