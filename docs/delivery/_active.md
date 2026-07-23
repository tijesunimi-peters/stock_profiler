# Active delivery task
task_slug: qual-fidelity
request: Qualitative-view PROTOTYPE FIDELITY pass for /sector-analytics — rebuild the prototype's altitude-4 layout (Risk-factor themes + Emerging/Going-concern/Litigation cards + Per-filer signals matrix) with EVERY data cell an honest EMPTY placeholder, keeping the prominent "Track 2 · not yet derived from filings" framing. NO fabricated data. Frontend-only.
branch: not yet branched
next_stage: done
qa_cycles: 0
updated: 2026-07-22

## Progress
- [x] 1 Product Manager       -> 1-brief.md (7 ACs; scope gate PASS — honest placeholder layout, does NOT implement Track 2. Every cell empty placeholder; prominent Track-2 banner kept; NO fabricated data. AC-3 = honesty landmine: no data digit/●/direction/fill/filer.)
- [x] 2 Principal Architect   -> 2-architecture.md (FRONTEND-ONLY. renderQualView rebuild: keep banner/why/foot; add 3fr 2fr cols (Risk-factor-themes card w/ 7 real theme labels + empty bar + '—' + 'planned' chip; 3 side cards Emerging/Going-concern/Litigation w/ '—' count + 'to be defined · no filers shown' body) + Per-filer-signals matrix (col headers 2fr/1fr×4 + placeholder body, NO rows). QUAL_THEMES=CO_THEMES+CO_DEFERRED. CSS .pa-qual-cols/rt/rtrow/rtbar(empty)/side/phbody/matrix + mobile. NO fetch/state/interaction. Owner: senior-frontend-engineer. Honesty-landmine -> flag operator hands-on.)
- [x] 3 Backend  — N/A (FRONTEND-ONLY)
- [x] 3 Frontend -> 3-implementation.md (renderQualView rebuild to prototype layout, all placeholders; QUAL_THEMES/SIDE/MATRIX_COLS; 3fr 2fr cols + risk-theme rows (empty bars/—/planned) + 3 side cards + per-filer matrix headers+placeholder body; CSS .pa-qual-* + mobile. static. pytest 511/6; e2e PASS errors=0; driving 9/9 incl honesty landmine; EYEBALLED.)
- [x] 4 QA Tester             -> 4-qa.md (PASS. Static/layout-only -> accepted at QA-tester level; honesty landmine ASSERTED by driving 9/9 (no data digit/●/%/direction/fill/filer; empty bars; 7 planned chips; 4 placeholder bodies). pytest 511/6; e2e PASS errors=0; mobile overflow=0; Compare/Sector/old-sectors intact. Operator eyeball recommended, not blocking. Completes the 4-view fidelity series.)

## Notes / open loops
- FINAL fidelity iteration (Sector 10cf5ba; Company 36aaa30/33c68da; Compare ce47444). Qualitative ONLY.
- Operator decision + governing directive: build the prototype's Qualitative LAYOUT with every cell an
  empty placeholder (NOT the current one-line stub); keep the prominent "Track 2 · not yet derived"
  banner so it can't be mistaken for imminent data.
- HONESTY LANDMINE (the big one): this does NOT implement Track 2. No extraction, no LLM, no data.
  Every cell UNMISTAKABLY empty ("— / to be defined / planned"); NO fabricated figure, count, %, ●
  flag, direction chip (new/rising/fading), coverage bar fill, filer name, or matrix row.
  - Risk-theme rows: the 7 REAL theme names (labels, not data) with EMPTY bars + "—" coverage +
    "planned" chip.
  - Emerging / Going-concern / Litigation cards: heading + count "—" + a "to be defined · no filers
    shown" placeholder body (NO fake filers/items).
  - Per-filer signals matrix: column headers + a placeholder body (NO fabricated rows).
- Frontend-only (sectorapp.js renderQualView rebuild + sectorapp.css). Static; interactive? no.
