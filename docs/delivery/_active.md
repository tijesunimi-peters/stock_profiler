# Active delivery task
task_slug: sector-drilldown
request: Phase 3 of docs/REDESIGN_SECTOR_OVERVIEW.md — final sector-overview phase: peer strip + biggest-shifts band + theme drill-down + tile-body-click theme-expand. Mostly frontend (peer strip + drill-down read already-fetched data; metric-level shifts compute off DuPont + lifecycle series in state). Peer strip = context-only bars per sector on the focused theme (from /sectors/theme-scores), not clickable. Biggest-shifts = metric-level standardized YoY change over DuPont+lifecycle series, top 3-5, favorability via display-only direction map (equity_multiplier neutral). Theme drill-down = focused theme's median+IQR tiles (reuse boxWhiskerChart / /sectors/{group}/spreads), KEEP the existing spreads panel too. Tile BODY click expands theme (peer strip + drill-down); SCORE button still opens Phase 2 decomposition; focused theme persists across sector switch. N/A never 0. Branch stacks on Phase 2 (sector-scorecard).
branch: sector-drilldown (stacked on sector-scorecard / Phase 2)
next_stage: done
qa_cycles: 0
updated: 2026-07-22

## Progress
- [x] 1 Product Manager       -> 1-brief.md (16 ACs; scope gate PASS Track 1; mostly frontend +
      fixture. Locked: metric-level standardized shifts (equity_multiplier neutral), context-only
      peer strip, keep both spread surfaces, tile-body expand + score-decomp, focus persists. R1
      drill-down coverage partial/empty per theme; R6 largest phase.)
- [x] 2 Principal Architect   -> 2-architecture.md (frontend-only, single stage. Resolved R1-R5: R1
      theme->_SPREAD_METRICS coverage table (FH 4/4 populated, C&I 0/2 honest-empty), drill-down
      states "showing N of M with a distribution". R2 standardized YoY change: changes=diffs, need
      >=3 changes, z=(c_latest-mean(c))/pstdev(c), pstdev<1e-9 omit, rank by |z| top 3-5 with |z|>=
      0.5. R2b display-only SHIFT_DIRECTION mirrors Phase 0 METRIC_DIRECTION (roe/net_margin/
      asset_turnover higher; dio/dso/dpo/ccc lower; equity_multiplier NEUTRAL). R3 tile = clickable
      expand region (role=button, sc-focused ring), score button stopPropagation; deferred tiles not
      expandable. R4 focusTheme default first scored tile, persist across switch else fall back to
      new sector's first scored. R5 extend _SPREAD_DEMO group 73 (net_margin/roa/roe + rev/earnings
      growth + d-e/int-cov/current/quick) for populated FH+Profitability drill-down; C&I inherently
      empty. New mounts #peerstrip/#shifts/#drilldown between #scorecard and #aggregation; all read
      cached state (themeScores/series/lifecycle/groupSpreads), incremental render off the 3 fetch
      .then's. Files: sectors.html/js/css, seed_fixture.py, headless_check.js. NO src/secfin. e2e:
      +sectors-drilldown-fh +sectors-drilldown-empty. AC->check table done.)
- [x] 3 Frontend  -> 3-implementation.md (branch sector-drilldown, stacked on P2. sectors.html 3
      mounts; sectors.js state.focusTheme (default first scored, persists/falls-back on switch),
      tile-body expand region (role=button, sc-focused, score button stopPropagation), renderPeerStrip
      (bars from themeScores for focused theme, omit non-scoring, selected accent, not clickable),
      renderShifts (standardized YoY z over DuPont+lifecycle series, top 3-5 |z|>=0.5, glyph=raw dir
      color=favorability via SHIFT_DIRECTION, equity_multiplier neutral), renderDrilldown (focused
      theme constituents ∩ groupSpreads, boxWhiskerChart per match, "N of M" caption, honest empty),
      wired into render/selectSector + 3 fetch .then's; kept the existing spreads panel. sectors.css.
      seed_fixture: extended _SPREAD_DEMO group 73 (FH 4/4 + Profitability 3/4 populated), group-73
      2025 SHOCK (margin+DSO) so shifts populate, seeded groups 35+28 theme scores (peer strip 4
      sectors). headless_check +sectors-drilldown-fh +sectors-drilldown-empty. Refined shift glyph to
      raw-direction (color=favorability) for clarity. pytest 506 pass; e2e PASS errors=0; EYEBALLED:
      default (peer strip 4 sectors + shifts populated both directions + Profitability drill-down 3/4),
      FH drill-down 4/4 + peer-strip re-point, C&I honest-empty drill-down 0/2. No src/secfin change.)
- [x] 4 QA Tester             -> 4-qa.md (PASS — all 16 ACs verified by exercising the feature.
      pytest 506 pass; e2e HEADLESS CHECK PASS errors=0; scripted interaction drive 19/19 PASS.
      AC-2 peer strip not clickable; AC-3 no zero bars (min height 55%); AC-4/5 shifts 4 rows, DSO/CCC
      red-unfavorable + ROE/margin green-favorable (glyph=raw dir, color=favorability); AC-7 tile-body
      expand re-points peer strip + drill-down; AC-8 FH 4/4, Profitability 3/4 (roic omitted never 0),
      C&I honest-empty 0/2; AC-9 score-click decomposition doesn't change focus (stopPropagation);
      AC-10 kept spreads panel; AC-11 focus persists 73->60 (FH) + falls back when banks omit op-eff;
      AC-12 default focus first scored tile; AC-13 basis surfaced + no affirmative buy/alpha; AC-14
      page order; AC-15 mobile 390px overflow=0. 2 non-blocking observations (O-1 drill-down sparse
      per R1; O-2 score-click focus reset carried from P2). No defects. UNCOMMITTED, STACKED P0-P3.
      COMPLETES the sector-overview altitude.)

## Deploy note
- PASS unlocks a deploy REQUEST, not a deploy. Frontend/static-only; deploy = rebuild api image +
  ship. Branch STACKED P0->P1->P2->P3 (all unmerged) -- merge in order or together. Scorecard/peer-
  strip honest-empty on prod until DevOps runs `python -m secfin.analytical.sector_theme_scores`.
  Operator next: commit branch and/or /devops-engineer. This COMPLETES altitude 1 (Phases 0-3 of
  docs/REDESIGN_SECTOR_OVERVIEW.md).

## Notes / open loops
- Mostly frontend. Owner senior-frontend-engineer (static/) + scripts/ (fixture + headless).
- Reuse already-fetched state in sectors.js: state.themeScores (all sectors -> peer strip),
  state.series[group] (DuPont FY series -> shifts), state.lifecycle[group] (lifecycle FY series ->
  shifts), state.groupSpreads[group] (per-sector box-whisker over _SPREAD_METRICS -> drill-down).
- New: state.focusTheme (default first scored tile; persists across sector switch, 00 §11.2).
  Tile BODY click -> focusTheme + peer strip + drill-down; SCORE button -> decompTheme (Phase 2).
- KEY R1: drill-down only covers _SPREAD_METRICS-backed constituents; honest omit/empty otherwise.
  Broadening = separate backend task, OUT of scope.
- Files: sectors.html (peerstrip/shifts/drilldown mounts), sectors.js (peer strip + shifts +
  drill-down + focusTheme + tile-body handler), sectors.css, seed_fixture.py (seed distributions for
  a populated + an empty drill-down), headless_check.js (shots). NO src/secfin change.
- HONESTY: N/A never 0 (omitted bars/metrics/boxes never zero); favorability only for favorability
  (equity_multiplier neutral); no verdict/alpha; basis surfaced. Threshold-alert + what's-moving feed
  = OUT (00 §13 / 01 §7).
- Verify: pytest green + e2e headless render check, EYEBALL (peer strip on focused theme, shifts
  band, drill-down populated + empty, focus persisting across sector switch, mobile).
