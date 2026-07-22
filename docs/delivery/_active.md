# Active delivery task
task_slug: sector-scorecard
request: Phase 2 of docs/REDESIGN_SECTOR_OVERVIEW.md — composite scorecard hero for /sectors. Mostly frontend (consumes GET /v1/sectors/theme-scores from Phase 0) + fixture seeding. Seven-tile scorecard from the selected sector's themes[] (5 scored: score/trend-delta chip/percentile/rank badge; 2 deferred "not yet scored"); score click -> inline decomposition; scorecard becomes the hero above the DuPont body. FULL favorability color (new positive/caution/negative token trio). N/A never 0; position-not-verdict framing; caveats surfaced.
branch: sector-scorecard (stacked on sector-overview-shell / Phase 1)
next_stage: done
qa_cycles: 0
updated: 2026-07-22

## Progress
- [x] 1 Product Manager       -> 1-brief.md (14 ACs; scope gate PASS Track 1; mostly frontend +
      seed_fixture addition. Locked: full favorability color, scorecard-on-top, inline decomposition.
      KEY honesty tension: score color must read as POSITION not verdict.)
- [x] 2 Principal Architect   -> 2-architecture.md (frontend-only, SINGLE stage. Resolved R1-R5 +
      D-ownership: R1 RESTRAINED score color = neutral score number + thin favorability band-accent
      by score band (>=60 pos / 40-59 caution / <40 neg); delta chip is the loud signal. R2 delta:
      >=+2 pos/up, <=-2 neg/down, |d|<2 flat, null="no prior FY" never 0. R3 new --positive/--caution/
      --negative(+wash) tokens in style.css :root, hues finalized by design pass (anchor off syntax
      greens/amber + terracotta), documented in STYLE_GUIDE. R4 fixture: group 73 all-5 themes mixed
      +/-/null deltas + decomposition, group 60 OMIT operating_efficiency, 28/52 unseeded=empty case.
      R5 fetch /sectors/theme-scores ONCE -> state.themeScores, pick by group, no refetch on switch.
      D-ownership: seed_fixture.py + headless_check.js assigned to FRONTEND engineer (test fixture,
      reuses Phase 0 repos) -> single frontend stage, no backend. Layout: new #scorecard mount between
      #sectorbar and #aggregation; DuPont body (#view) stays below. Files: sectors.html/js/css,
      style.css (tokens), STYLE_GUIDE, seed_fixture.py, headless_check.js. NO src/secfin change.
      e2e: add sectors-decomp + sectors-scorecard-empty shots. AC->check table done.)
- [x] 3 Frontend  -> 3-implementation.md (branch sector-scorecard, stacked on Phase 1. New
      favorability tokens --positive/--caution/--negative (moss/amber/brick) in style.css +
      STYLE_GUIDE; #scorecard mount; sectors.js scorecard hero (fetch /sectors/theme-scores ONCE ->
      state.themeScores, pick by group, re-render on switch) — scoreTile (neutral score + delta chip
      + percentile + rank + band accent), deferredTile, deltaChip (>=+2 pos/<=-2 neg/flat/null="no
      prior FY" never 0), inline renderDecomp (constituents + median + oriented-z bars + equal-weight
      + normalization); sectors.css; seed_fixture.py _seed_sector_theme_scores (73 all-5 mixed deltas
      +decomp, 60 omit op-eff, 28/52 unseeded=empty); headless_check.js +sectors-decomp +sectors-
      scorecard-empty. Found+FIXED a &amp; double-escape in the empty state (P.esc into states.empty
      which re-escapes). pytest 506 pass; e2e PASS errors=0; EYEBALLED 4 scorecard shots (populated
      73 5+2, decomp open, banks 60 4+2 op-eff omitted, empty 52). No src/secfin change.)
- [x] 4 QA Tester             -> 4-qa.md (PASS — all 14 ACs verified by exercising the feature.
      pytest 506 pass; e2e HEADLESS CHECK PASS errors=0; scripted interaction drive 18/18 PASS.
      AC-1 scorecard hero above DuPont (7 tiles 5+2); AC-3 delta chips pos/neg/flat + null="no prior
      FY" never 0; AC-5 inline decomp toggles one-at-a-time (constituents+note+normalization); AC-7
      in-page switch does NOT refetch theme-scores (3->3 requests); AC-8 empty (group 52 + intercepted
      sectors:[]) honest, DuPont still renders; AC-9 banks omit operating_efficiency (4 scored+2
      deferred); AC-10 position-not-verdict copy, no affirmative buy/alpha; AC-11 score neutral ink,
      favorability tokens only in sectors.css; AC-12 mobile 390px overflow=0. &amp; escape fix
      confirmed clean. 2 non-blocking observations: O-1 score click re-renders scorecard -> focus
      resets (minor a11y); O-2 "no prior FY" chip may wrap (acceptable). No defects. UNCOMMITTED,
      branch STACKED on P1->P0.)

## Deploy note
- PASS unlocks a deploy REQUEST, not a deploy. Frontend/static-only; deploy = rebuild api image +
  ship. Branch STACKED P0->P1->P2 (all unmerged) -- merge in order or together. Scorecard is honest-
  empty on prod until DevOps runs `python -m secfin.analytical.sector_theme_scores`. Operator next:
  commit branch and/or /devops-engineer.

## Notes / open loops
- Mostly frontend. Owner senior-frontend-engineer (static/). Small scripts/seed_fixture.py addition
  (seed sector_theme_scores + sector_theme_components) -- architect assigns ownership.
- Consumes existing GET /v1/sectors/theme-scores (Phase 0). Response = SectorThemeScoreList in
  normalize/schema.py: sectors[{group, group_label, themes[{theme,theme_label,scored,score,
  percentile,rank,rank_of,delta_vs_prior_fy,constituents[{metric,label,higher_is_better,median,
  oriented_z}],reason}]}], + normalization + caveats. Fetch once, pick state.group's entry.
- Files: static/sectors.html (scorecard mount above body), sectors.js (fetch + render scorecard +
  decomposition + re-render on sector switch), sectors.css (tiles + favorability), style.css or
  app.css (new positive/caution/negative tokens), STYLE_GUIDE (document tokens), scripts/
  seed_fixture.py (seed theme scores), scripts/headless_check.js (scorecard shots).
- Branch STACKS on Phase 1 (sector-overview-shell); Phase 0+1 unmerged. Note for operator.
- HONESTY: N/A never 0; deferred themes never fabricated; caveats + normalization surfaced; score =
  position not verdict despite color; favorability color only for favorability; light-only theme.
- Verify: pytest green + e2e headless render check, EYEBALL shots (populated scorecard, empty,
  decomposition open, deferred tiles, mobile).
