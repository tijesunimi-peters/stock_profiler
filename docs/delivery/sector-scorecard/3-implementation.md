# Implementation — Composite scorecard hero (Phase 2)

Stage 3 (Senior Frontend Engineer) handoff → QA. **Frontend-only.**
Branch: **`sector-scorecard`** (stacked on Phase 1 `sector-overview-shell`). Uncommitted.

## Branch note

Stacked chain: `master` → `sector-theme-scores` (P0, `73a4768`) → `sector-overview-shell` (P1,
`77c5ead`) → `sector-scorecard` (P2). All independent of each other in code; merge in order (P0 → P1
→ P2) or together. P2's code has no dependency on P1 beyond the shared `sectors.js`.

## What changed and why

Adds the seven-theme composite scorecard as the page **hero**, consuming the Phase 0
`GET /v1/sectors/theme-scores`. No `src/secfin/` change (endpoint exists); the only Python touch is
the e2e fixture.

- **`static/style.css`** — new favorability token trio `--positive/--caution/--negative` (+ `-wash`),
  muted earthy hues harmonized with the palette (moss `#5E7D4F` / amber `#A97C2C` / brick `#A8432E`),
  documented in **`docs/STYLE_GUIDE.md`** as the scoped scorecard exception ("favorability only; the
  score is a position, not a verdict").
- **`static/sectors.html`** — `#scorecard` mount between `#sectorbar` and `#aggregation`.
- **`static/sectors.js`** — `state.themeScores/themeScoresErr/decompTheme`; `ensureThemeScores()`
  (fetch `/sectors/theme-scores` **once**); `renderScorecard()` (loading skeleton / scoped error /
  honest-empty when the sector has no entry / tile grid + a `.disclosure` carrying the payload
  `normalization` + `caveats`); `scoreTile` (theme name, neutral 0–100 score button, `deltaChip`,
  "P## · vs all sectors", "rank of rank_of", thin favorability **band-accent** by score band
  ≥60/40–59/<40); `deferredTile` (muted "Not yet scored" + reason); `deltaChip` (≥+2 pos/▲, ≤−2
  neg/▼, |Δ|<2 flat/▬, **null → "no prior FY"** muted, never 0); `renderDecomp` (shared inline panel
  below the grid, one theme at a time — constituents' label + median + favorability bar + signed
  oriented-z, equal-weight note, normalization). Wired into `render()` + `selectSector()`. The DuPont
  body (`#view`) is unchanged, now below the scorecard.
- **`static/sectors.css`** — scorecard grid (auto-fit), tiles (DuPont-card family), delta chips,
  rank/percentile, band accents, deferred tiles, inline decomposition (+ mobile reflow).
- **`scripts/seed_fixture.py`** — `_seed_sector_theme_scores` (reuses Phase 0
  `SQLiteSectorThemeScoreRepository`/`SectorThemeScoreRow`/`SectorThemeComponentRow`): group 73 all
  five themes with mixed +/−/flat/**null** deltas + a decomposition; group 60 (banks) **omits
  operating_efficiency**; groups 28/52 unseeded (empty case). Wired into the fixture entrypoint.
- **`scripts/headless_check.js`** — added `sectors-decomp` (click a score → decomposition) and
  `sectors-scorecard-empty` (group 52). Existing sector shots now lead with the scorecard.
- Docs: `docs/REDESIGN_SECTOR_OVERVIEW.md` Phase 2 status.

## Bug found & fixed during self-verify

The honest-empty copy showed `Building Materials &amp; Garden Supplies` (literal `&amp;`) — I
pre-escaped the label with `P.esc()` before passing it to `P.states.empty`, which escapes `copy`
again. Fixed (pass the raw label; `states.empty` escapes once). Re-ran e2e — clean.

## How I verified

- **`pytest` (Docker):** **506 passed, 6 skipped** — no regression; the fixture seeds (9 scores + 29
  components) and imports cleanly.
- **e2e headless render check** (`docker compose build api` → e2e): **HEADLESS CHECK: PASS**,
  `errors=0` on all pages incl. the new scorecard shots. **Eyeballed** every scorecard screenshot:
  - `sectors` (group 73): scorecard hero above the DuPont body — 5 scored tiles (Profitability 68
    +5▲, Growth 54 −3▼, Financial health 61 "no prior FY", Cash & investment 47 +1▬, Operating
    efficiency 38 −6▼) + 2 deferred "Not yet scored" tiles; neutral score numbers, favorability
    delta chips, band accents, "P## · vs all sectors", rank badges, "How these scores are built"
    disclosure.
  - `sectors-decomp`: clicking the Profitability score opens the inline decomposition — 4
    constituents with median + green favorability bars + signed z (Net Margin +0.90σ … ROE +1.20σ),
    equal-weight note, normalization line.
  - `sectors-selected` (group 60/banks): **4 scored + 2 deferred**, `operating_efficiency` correctly
    **absent**; DuPont body below.
  - `sectors-scorecard-empty` (group 52): honest "Sector health scores aren't available yet …
    sparse coverage, not zero" (label now correct); DuPont body still renders.

## What QA should probe

- **AC-7 fetch-once:** switching sector re-renders the scorecard with **no second**
  `/sectors/theme-scores` request (drive + count requests).
- **AC-3 delta cases:** +/−/flat colored + glyph, **null → "no prior FY" (never 0)** (group 73 seeds
  all; Financial health = null).
- **AC-5 decomposition toggle:** open one, open another (only one open), close by re-click.
- **AC-9:** group 60 omits operating_efficiency (absent, not a "not yet scored" tile).
- **AC-8 empty:** intercept `/sectors/theme-scores` → `sectors:[]` → honest empty for a normally-
  populated sector too.
- **AC-10/11 honesty:** grep the page for "buy"/"sell"/alpha (absent); favorability color only on
  chips + band accent; score number neutral.
- **AC-12 mobile:** scorecard grid reflows, decomposition rows wrap (drive at ~390px). Minor: the
  "no prior FY" chip can wrap to two lines on a narrow tile — legible, flag if you disagree.

## Notes / deferred

- Tile-body → theme drill-down + peer strip are Phase 3; only the **score** is interactive here.
- On prod the scorecard is honest-empty until the deferred DevOps batch runs
  (`python -m secfin.analytical.sector_theme_scores`).
