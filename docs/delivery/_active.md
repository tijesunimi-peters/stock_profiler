# Active delivery task
task_slug: sector-app-compare
request: Phase 3 of docs/REDESIGN_SECTOR_APP.md — COMPARE view (altitude 3) of the /sector-analytics paper-terminal app. Sector-vs-sector: paired composite theme-score bars + sector metric-median cards. NO winner, NO favorability color, A=accent / B=GAAP-blue categorical identity only. Stacked on Phase 2 (sector-app-company 329388d).
branch: not yet branched
branch: sector-app-compare (stacked on Phase 2 / sector-app-company 329388d)
next_stage: done
qa_cycles: 0
updated: 2026-07-22

## Progress
- [x] 1 Product Manager       -> 1-brief.md (11 ACs; scope gate PASS Track 1 — pure read/re-shape of
      shipped sector aggregates. Sector-vs-sector, NOT company /compare. Likely FRONTEND-ONLY (app
      already loads theme-scores all-sectors + per-group DuPont/spreads). R1 endpoint-sufficiency
      fork, R2 metric set, R3 same-sector/unset-B, R4 gap-emphasis non-verdict, R5 fixture ≥2 scored
      sectors. NO winner, NO favorability color, A=accent/B=gaap identity only.)
- [x] 2 Principal Architect   -> 2-architecture.md (VERDICT: FRONTEND-ONLY — no backend/endpoint/
      schema. R1 RESOLVED: reuse state.themeScores (all sectors, per-theme score 0-100 + deferred)
      + state.spreads[g].metrics (median/label/unit) — both already loaded; client direction map for
      "lower is better" (MetricSpread has no higher_is_better). R2 cards = spreads.metrics
      intersection of A&B. R3 B-unset->prompt, A==B allowed, default A=current. R4 gap = ink weight
      only (|gap|>=10 full ink), true-length bars, no winner. R5 NO fixture change — _THEME_SCORE_DEMO
      already seeds 73(5 themes)/60(4)/35(3)/28(3) + 28 has no spreads => covers not-scored/N/A. Files:
      sectorapp.js (URL presets ?view=compare&a=&b=, rewire #paPin togglePin, renderCompareView +
      wireCompareView, derived composite labeled), sectorapp.css (.pa-cmp-*, A=--accent/B=--gaap,
      mobile reflow), headless_check.js (+4 compare shots), REDESIGN doc. Owner: senior-frontend-engineer.)
- [ ] 2 Principal Architect   -> 2-architecture.md
- [x] 3 Backend  — N/A (architect verdict FRONTEND-ONLY; no backend/endpoint/schema change)
- [x] 3 Frontend -> 3-implementation.md (Compare view in sectorapp.js: URL presets ?view=compare&
      a=&b=, rewired #paPin togglePin (sets compareA + view=compare), ensureSpreads/ensureCompareData,
      renderCompareView (A/B <select>s A=--accent B=--pa-b#3d6a8a identity-only; derived composite +
      per-theme TRUE-LENGTH paired bars w/ signed ink-weight gap; "not scored" for deferred/absent
      never 0; metric-median cards union A&B, per-metric normalized, "lower is better" text marker,
      N/A cells), wireCompareView. sectorapp.css .pa-cmp-* tokens-only (no --positive/caution/negative;
      self-contained --pa-b since app doesn't load app.css -> fixed invisible-B-bar bug found in
      self-verify), mobile reflow. headless_check +4 shots. REDESIGN doc BUILT. pytest 511 pass/6 skip
      (no regress); e2e PASS errors=0; EYEBALLED 73v60 (B blue bars, +17 full ink, op-eff not-scored
      for banks, N/A metric cells, lower-is-better on D/E, composite derived), B-unset prompt, pin flow.)
- [x] 4 QA Tester             -> 4-qa.md (PASS — all AC-1..AC-11 met. pytest 511 pass/6 skip (no
      regress, frontend-only); e2e PASS errors=0 + eyeballed; scripted driving 19/19 PASS. Confirmed:
      A=terracotta rgb(192,112,58)/B=blue rgb(61,106,138) identity-only no green/red; true-length bars
      (FH A61=448px > B44=323px); NO winner language; composite derived; 2 deferred + op-eff-for-banks
      "not scored" ZERO-width never 0; N/A metric cells (banks/28) never 0; "lower is better" text on
      D/E; selector recompute; compareA/B persist Compare→Sector→Company→Compare; pin flow; mobile
      390px overflow=0; /sectors + Sector view intact. Engineer fixed invisible-B-bar bug (app doesn't
      load app.css -> --gaap-color undefined -> self-contained --pa-b). Ready to deploy (operator-gated).)

## Notes / open loops
- Sector-vs-sector compare (prototype's real intent), NOT the company-vs-company /compare page.
- Reuse /v1/sectors/theme-scores (both sectors' composite + 5 scored themes) + /sectors/{group}
  (DuPont medians) + /sectors/{group}/spreads (metric medians). Prefer NO new endpoint.
- HONESTY: 5 backable themes scored (2 "not scored"); no winner; no fabricated coverage; theme
  scores provisional; N/A never 0; "lower is better" text marker on inverted metrics.
- Stacked on Phase 2 branch (sector-app-company 329388d); extends sectorapp.js. App LIGHT-ONLY,
  CSP-safe, tokens only.
