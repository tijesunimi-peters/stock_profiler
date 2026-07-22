# QA — Sector Analytics app: shell + Sector view (Phase 1)

Stage 4 (QA Tester). Verdict: **PASS**. Frontend-only. Verified by **exercising the running
feature** — full suite, static honesty/CSP checks, the Docker e2e headless render check, a scripted
puppeteer **interaction drive** (15 assertions, all pass), and eyeballing every screenshot incl.
mobile. Branch: `sector-app-shell` (off `master`).

`pytest` **506 passed, 6 skipped** (the `main.py` route). e2e **HEADLESS CHECK: PASS**, `errors=0`.
Interaction drive **QA-APP: ALL PASS**. No favorability tokens used; no CDN/Tailwind/React;
`sectors.*` unchanged.

## Per-AC verdict

| AC | Verdict | Evidence |
|----|---------|----------|
| AC-1 shell (sidebar/header/control bar/view rail, Sector active) | **PASS** | Drive: `.pa-side` + `.pa-topbar` + `.pa-ctrl` + active rail = "Sector". Screenshot `sectorapp`. |
| AC-2 sector dropdown re-derives the Sector view | **PASS** | Drive: pick another option → title-right sector changes ("Business Services" → "Building Materials & Garden Supplies"), whole view re-renders. |
| AC-3 state persists across view switch; stubs no fabricated data | **PASS** | Drive: Company stub then back to Sector → selected sector preserved; Qualitative stub says "Track 2 … nothing here is fabricated". Company/Compare stubs carry no data. |
| AC-4 meta = filers + FY + legend; no coverage %/sub-industry | **PASS** | Drive: "59 filers · FY2025 · full peer set" + 4-chip legend (OK/≈/∅/~); no "% filed", no sub-industry pills. |
| AC-5 scorecard 5 scored + 2 not-yet-scored | **PASS** | Drive: 5 `.pa-tile[data-theme]` + 2 `.pa-tile-def` (Accounting quality, Structure & activity). |
| AC-6 arrow-glyph deltas ↑↓→ | **PASS** | Drive: deltas = `↑+5 \| ↓-3 \| →no prior FY \| ↑+1 \| ↓-6`. |
| AC-7 score click → decomposition, tile unchanged (stopPropagation) | **PASS** | Drive: score click → `.pa-decomp` open, expanded tile unchanged; panel shows "Equal-weight" + normalization + "never counted as zero". Screenshot `sectorapp-decomp`. |
| AC-8 tile-body click → expandedTheme (peer strip + drill-down) w/o decomposition | **PASS** | Drive: clicking another tile sets `.expanded` to it, peer strip re-points, no `.pa-decomp`. |
| AC-9 biggest-shifts arrow glyph, no color | **PASS** | Drive: shift rows all arrow glyphs (`↑↑↑↑`), neutral delta color. |
| AC-10 no favorability color anywhere | **PASS** | Static: `--positive/--caution/--negative` never used in `sectorapp.css/.js` (only a comment). Computed: delta color `rgb(107,100,89)` = `--ink-soft` (neutral); no green/red. |
| AC-11 N/A never 0 | **PASS** | Drive: null delta renders "→ no prior FY" (no "0"). |
| AC-12 provisional banner + position-not-verdict | **PASS** | "≈ Scores provisional … a position vs other sectors, not a good/bad or buy verdict, and is openable"; no buy/sell/alpha. |
| AC-13 CSP-safe + mobile reflow | **PASS** | `sector-analytics.html`: no CDN/Tailwind/React. Mobile 390px: `scrollWidth−clientWidth=0` on both the populated (`qa-app-mobile-populated`) and honest-empty (`qa-app-mobile`) states; sidebar hidden, rail wraps, scorecard 2-col, shifts/drill-down stack — eyeballed. |
| AC-14 `/sectors` still serves the OLD page | **PASS** | Runtime: `GET /sectors` returns markup with `#sectorbar` (old page); `GET /sector-analytics` returns `#app` + `sectorapp.js`. `sectors.*` diff vs master = empty. |
| AC-15 pytest green | **PASS** | 506 passed, 6 skipped. |

## UI/UX review

- **Faithful to the prototype.** The paper-terminal shell (210px sidebar, sticky blurred header,
  soft-shadow control-bar card, 132px view rail), the 7-tile scorecard with dashed-underline scores,
  the decomposition grid, the peer strip, and the drill-down all match the reference — rebuilt in
  vanilla JS/CSS on our tokens.
- **Honesty is intact and, if anything, stronger than the prototype's synthetic comp:** no
  favorability color (arrows + track position only), deferred themes as honest "not yet scored"
  tiles, the null delta as "→ no prior FY" (never 0), omitted coverage %/sub-industry/feed rather
  than fabricated numbers, and a Qualitative stub that explicitly says "Track 2 · nothing fabricated".
- **States** — populated, honest-empty (a sector with no theme scores), loading, and the inert
  stubs all render intentionally; the drill-down honestly states "3 of 4 constituents … omitted, not
  zero".
- **Affordances** — the score is a dashed-underline button (openable signal) with `stopPropagation`;
  the tile body is a `role=button` expand region; the rail marks the active view; the dropdown closes
  on outside-click.
- **Copy** — sentence case, active voice, provisional framing; no over-claiming.

## Observations (non-blocking)

- **O-1:** The pin-to-compare button is intentionally parked (sets `compareA`, no navigation) since
  Compare is Phase 3 — expected per the brief (R4).
- **O-2:** Full re-render on each interaction (state cached; box-whisker nodes remounted). Fine at
  this scale.

## Handoff

**Verdict: PASS — no defects.** This is Phase 1 of the new 4-view Sector Analytics app (the "sector
page from scratch"), at **`/sector-analytics`**, with `/sectors` untouched.

**Ready to deploy (frontend):** static assets + one static route; deploy = rebuild the `api` image +
ship. **Operator decision pending (R1):** whether to eventually swap `/sectors` → the app once
Phases 2–4 (Company · Compare · Qualitative) land, or keep both. On prod the scorecard/peer-strip are
honest-empty until the deferred DevOps batch (`python -m secfin.analytical.sector_theme_scores`)
runs. Uncommitted, not deployed. Next: operator may commit the branch, continue to Phase 2, and/or
request a deploy.
