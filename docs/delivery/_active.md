# Active delivery task
task_slug: sector-app-shell
request: Phase 1 of docs/REDESIGN_SECTOR_APP.md — app SHELL + SECTOR VIEW of the new "paper terminal" single-page Sector Analytics app (from-scratch redesign superseding /sectors UI; keep backend). Vanilla-JS/CSS CSP-safe rebuild of docs/design/sector-app-prototype/. Shell (sidebar/header/persistent control bar/view rail + cross-view state store) + Sector view on real endpoints (theme-scores/dupont/spreads/lifecycle): 7-theme scorecard (5 scored + 2 not-yet-scored), arrow-glyph deltas NO favorability color, provisional banner, click-score decomposition, click-tile peer strip + drill-down, biggest-shifts. Other 3 views inert/stub. NO color (reverts Phase 2); no fabricated coverage/sub-industry/feed; Qualitative=Phase 4 stub. Frontend-only.
branch: sector-app-shell (off master)
next_stage: done
qa_cycles: 0
updated: 2026-07-22

## Progress
- [x] 1 Product Manager       -> 1-brief.md (15 ACs; scope gate PASS Track 1; FRONTEND-ONLY. Phase 1
      = shell + Sector view (others inert/stub); NO favorability color; Qualitative Phase 4 stub.
      Omit sub-industry/coverage%/feed. R1 route flagged for operator.)
- [x] 2 Principal Architect   -> 2-architecture.md (frontend-only, single stage. Resolved R1-R6: R1
      NEW route GET /sector-analytics -> FileResponse(sector-analytics.html) (mirror /guide); /sectors
      UNTOUCHED, coexist until operator approves swap (flag at gate). R6 OWN self-contained asset set
      static/sector-analytics.html + sectorapp.css + sectorapp.js -- does NOT import sectors.js/css
      (Phase 2 color) or script.js (shared shell); REUSES style.css tokens + app.js ClearyFi helpers
      (api/esc/fmt/measuredWidth/boxWhiskerChart/states); builds paper-terminal shell inline; NEVER
      references --positive/--caution/--negative. R2 omit sub-industry; R3 omit coverage% (show 'full
      peer set'); R4 pin parked (sets compareA, no nav); R5 equal-weight contribution bars (mag=
      |oriented_z|, sign via arrow, no fabricated weights). Data: /sectors (universe+peer_count+FY),
      /sectors/theme-scores (scorecard+decomp+peer strip), /sectors/{group}(+/spreads +/lifecycle)
      lazy (shifts+drilldown). Shift math ported from sectors.js MINUS color. Store persists across
      views. Files: static/sector-analytics.html + sectorapp.css + sectorapp.js, api/main.py route,
      headless_check.js shots. NO src/secfin data change, NO seed_fixture change (fixture already
      seeds P0-3 data). e2e: sectorapp + sectorapp-decomp + sectorapp-stub. AC->check table done.)
- [x] 3 Frontend  -> 3-implementation.md (branch sector-app-shell off master. NEW route
      /sector-analytics (main.py) + self-contained static/sector-analytics.html + sectorapp.js +
      sectorapp.css (reuse style.css tokens + app.js helpers + vendored d3/plot; NO app.css/company.
      css/sectors.css/script.js). Paper-terminal shell (sidebar/header/control bar dropdown+meta+
      legend+pin, view rail) + persistent state store + Sector view on real endpoints (scorecard 5+2
      arrow-glyph NO color, provisional banner, click-score decomposition equal-weight single-accent,
      click-tile peer strip + drill-down, biggest-shifts arrow-only). Company/Compare/Qualitative
      inert stubs (Qualitative = 'Coming — Track 2 · nothing fabricated'). Ported shift math minus
      color. Omit coverage%/sub-industry/feed. pytest 506 pass; e2e PASS errors=0; EYEBALLED sectorapp
      (full shell+scorecard+peer strip+shifts+drill-down 3/4), sectorapp-decomp (equal-weight bars,
      arrows, no color), sectorapp-stub (honest Qualitative). /sectors UNTOUCHED. No src/secfin data
      change. NO CDN/Tailwind/React; no favorability tokens used.)
- [x] 4 QA Tester             -> 4-qa.md (PASS — all 15 ACs verified by exercising the feature.
      pytest 506 pass; e2e HEADLESS CHECK PASS errors=0; scripted interaction drive 15/15 PASS.
      Statics: no favorability tokens, no CDN/Tailwind/React, sectors.* unchanged. Drive: shell ok;
      dropdown re-derives (Business Services->Building Materials); state persists across view switch;
      meta no coverage%/sub-industry; scorecard 5+2; arrow deltas ↑+5/↓-3/→no prior FY/↑+1/↓-6 neutral
      color rgb(107,100,89); score-click decomposition WITHOUT expanding tile (stopPropagation) + eq-
      weight/normalization/"never counted as zero"; tile-body expand re-points w/o decomp; shifts
      arrows; Qualitative stub Track-2/nothing-fabricated; mobile 390px overflow=0 (populated + empty
      both eyeballed). AC-14 /sectors serves OLD page (#sectorbar), /sector-analytics = #app. No
      defects. 2 non-blocking obs (pin parked; full re-render). UNCOMMITTED. This is Phase 1 of the
      new 4-view app (the "sector page from scratch").)

## Deploy note
- PASS unlocks a deploy REQUEST, not a deploy. Frontend/static-only + one static route; deploy =
  rebuild api + ship. NEW route /sector-analytics; /sectors UNTOUCHED. R1 pending operator: swap
  /sectors -> app once Phases 2-4 land, or keep both. Scorecard/peer-strip honest-empty on prod until
  DevOps runs python -m secfin.analytical.sector_theme_scores. Operator next: commit branch, continue
  to Phase 2 (Company view), and/or /devops-engineer. Phases 2-4 = Company · Compare · Qualitative.


## Notes / open loops
- Frontend-only. Owner senior-frontend-engineer (static/) + scripts/headless_check.js (+ possibly a
  new static route wiring in api/main.py or routes for the new page).
- Design reference: docs/design/sector-app-prototype/ (HANDOFF.md + prototype.dc.html + preview.webp).
  Rebuild in vanilla JS/CSS, CSP-safe (NO Tailwind/React/CDN). Prototype tokens == static/style.css.
- REUSE endpoints: /v1/sectors/theme-scores (scorecard 5+2 + decomposition + peer strip), /v1/sectors/
  {group} (DuPont/trend), /v1/sectors/{group}/spreads (drill-down), /v1/sectors/{group}/lifecycle.
- R1 ROUTE: architect propose NEW route (recommend), flag for operator confirm; /sectors stays.
- HONESTY: NO favorability color anywhere (arrows ↑↓→ + track position, single terracotta accent);
  N/A never 0; deferred themes never fabricated; no fabricated coverage %/sub-industry/feed; status
  vocabulary present; provisional framing; position-not-verdict.
- Verify: pytest green (no backend change) + e2e headless render check, EYEBALL (shell, scorecard,
  decomposition open, peer strip + drill-down, not-yet-scored tile, mobile).
