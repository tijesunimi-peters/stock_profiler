# Active delivery task
task_slug: sector-fidelity
request: Sector-view PROTOTYPE FIDELITY pass for /sector-analytics — match the prototype's altitude-1 layout/columns EXACTLY, filling every synthetic-data element with an honest labeled EMPTY placeholder (never fabricated). Frontend-only. Governing directive: docs/delivery/sector-app-followups.md.
branch: sector-fidelity
next_stage: done
qa_cycles: 0
updated: 2026-07-22

## Progress
- [x] 1 Product Manager       -> 1-brief.md (11 ACs; scope gate PASS — honest placeholders, no
      fabrication, frontend-only, Sector view only. Control-bar sub-industry + coverage PLACEHOLDERS;
      decomp 200/60/1fr/52; shifts flex 14/flex/flag/80/150; drill-down 3fr 2fr w/ 2fr placeholder
      feed card; tile-click shows decomp+peerstrip/drilldown (F5); favorability color on deltas+shifts
      paired w/ arrows never color-alone score neutral (F4); provisional --ext color. R1 placeholder
      style, R2 color mechanics, R3 tile-click both, R4 local --ext, R5 e2e shots.)
- [x] 2 Principal Architect   -> 2-architecture.md (VERDICT: FRONTEND-ONLY. OPERATOR FORK RESOLVED:
      prototype is color-free (§3.1) so color conflicts w/ fidelity -> color ONLY the scorecard
      trend-delta chip (matches STYLE_GUIDE exception), biggest-shifts stays NEUTRAL like the
      prototype. Plan: controlBarHtml sub-industry + coverage PLACEHOLDERS; expandTheme sets BOTH
      expandedTheme+decompTheme (F5); scorecardHtml delta chip pos/neg class (arrow inside, score
      neutral); shiftsHtml flex row + |z|>=1.5 flag chip (neutral); .pa-drill-row 3fr 2fr with a
      placeholder feed card (no fabricated items); CSS decomp 200/60/1fr/52, shift flex 14/flex/flag/
      80/150, --ext defined locally on .pa-app, .pa-ph placeholder style; headless expanded-tile shot.
      Owner: senior-frontend-engineer.)
- [x] 3 Backend  — N/A (FRONTEND-ONLY; no backend touch)
- [x] 3 Frontend -> 3-implementation.md (sectorapp.js/css: control-bar sub-industry + coverage
      PLACEHOLDERS; expandTheme sets both (F5); deltaClass color on .pa-tile-delta chip only (score
      neutral, arrow inside); shifts flex row + notable flag chip (neutral); .pa-drill-row 3fr 2fr +
      feedPlaceholderHtml; decomp 200/60/1fr/52; local --ext tokens; .pa-ph styles; headless clicks a
      tile. pytest 511 pass/6 skip; e2e PASS errors=0; EYEBALLED (placeholders, colored delta chips w/
      neutral scores, tile-click-both, 3fr/2fr drill + placeholder feed, notable flags, rust banner).)
- [x] 4 QA Tester             -> 4-qa.md (PASS — pending manual UI verification. pytest 511/6 no
      regress; e2e PASS errors=0 + eyeballed; scripted driving 16/16. Confirmed: sub-industry+coverage
      PLACEHOLDERS (no SIC-4/%/fabrication); decomp 200/60/1fr/52; shifts flex + notable flag; drill
      row 508:338≈3:2 + placeholder feed (no items); tile click opens BOTH; delta chip pos=moss
      rgb(94,125,79)/neg=brick rgb(168,67,46), score neutral ink, null uncolored; banner ext tint
      resolves; mobile overflow=0; Compare/Qual/old-/sectors intact. Manual click-through pending
      operator.)

## Notes / open loops
- First of the prototype-fidelity followups (governing directive 2026-07-22). Sector view ONLY;
  Company/Compare/Qualitative are later iterations.
- Honesty rail: every placeholder unmistakably a placeholder ("… — to be defined"), never fabricated
  data. NO fake coverage %/sub-industry/feed values/counts.
- Bundles F7 (drill-down 3fr + placeholder 2fr feed col; decomp/shifts exact widths), F5 (tile click
  shows decomp + peer strip/drill-down together), F4 Sector portion (favorability color on deltas +
  shifts, paired with arrows, never color alone, score neutral), + control-bar sub-industry/coverage
  placeholders + provisional-banner --ext color fix.
- Frontend-only (sectorapp.js + sectorapp.css). Directive docs (REDESIGN + followups) already edited.
