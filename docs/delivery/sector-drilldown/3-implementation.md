# Implementation — Peer strip · biggest-shifts · theme drill-down (Phase 3)

Stage 3 (Senior Frontend Engineer) handoff → QA. **Frontend-only.**
Branch: **`sector-drilldown`** (stacked on Phase 2 `sector-scorecard`). Uncommitted.

## Branch note

Stacked chain: `master` → `sector-theme-scores` (P0) → `sector-overview-shell` (P1) →
`sector-scorecard` (P2) → `sector-drilldown` (P3). Merge in order (or together). P3's code has no
dependency on P0–P2 beyond the shared `sectors.js`/fixture.

## What changed and why

Adds the three guide surfaces (`01 §4–6`) + the tile-body-click theme-expand, completing the
sector-overview altitude. No `src/secfin/` change — all three read data **already in `state`**
(`themeScores`, `series`, `lifecycle`, `groupSpreads`); the only Python touch is the e2e fixture.

- **`static/sectors.html`** — `#peerstrip`, `#shifts`, `#drilldown` mounts between `#scorecard` and
  `#aggregation`.
- **`static/sectors.js`**:
  - `state.focusTheme` (default = first scored tile; **persists across sector switch**, else falls
    back to the new sector's first scored theme — `reconcileFocusTheme`/`ensureFocusTheme`).
  - The scored tile is now a clickable **expand region** (`role=button`, `sc-focused` ring, hover);
    tile-body click/Enter/Space → `setFocusTheme` (re-points peer strip + drill-down); the **score
    button** adds `stopPropagation()` so it only opens the decomposition. Deferred tiles aren't
    expandable.
  - `renderPeerStrip()` — bars from `state.themeScores` for the focused theme (each sector's score),
    selected = `accent`, others neutral, **sectors not scoring it omitted** (no zero bars), sorted
    desc, caption "`<theme>` · N sectors · FYyyyy · `<sector>` highlighted". Not clickable. Honest
    empty if < 2.
  - `renderShifts()` — standardized YoY change (`z = (c_latest − mean(c)) / pstdev(c)`, ≥3 changes,
    `pstdev<1e-9` omit) over the DuPont (`roe/net_margin/asset_turnover/equity_multiplier`) +
    lifecycle (`dio/dso/dpo/ccc`) series; top 3–5 with `|z| ≥ 0.5`. Row = label + signed raw change +
    **glyph = raw direction (▲/▼)** + **color = favorability** (display-only `SHIFT_DIRECTION`;
    `equity_multiplier` **neutral**) + "±Nσ vs its own history". Honest empty if none qualify.
  - `renderDrilldown()` — the focused theme's constituents ∩ `state.groupSpreads[group].metrics`,
    one `boxWhiskerChart` per match (reuses `drawDetailSpreads` rendering), "Showing N of M
    constituents with a peer distribution" caption; honest empty (no match, or the sector doesn't
    score the theme). The existing per-sector spreads panel in `#view` is **kept**.
  - Wired into `render()`/`selectSector()` and the three fetch `.then`s (series/lifecycle/spreads) so
    each surface fills in as its data arrives.
- **`static/sectors.css`** — peer strip / shifts band / drill-down styles; `.sc-tile[role=button]`
  cursor/hover/`:focus-visible`/`.sc-focused` ring; mobile reflow.
- **`scripts/seed_fixture.py`** — extended `_SPREAD_DEMO` (group 73 now has net_margin/roa/roe +
  rev/earnings growth + d-e/int-cov/current/quick → **populated FH + Profitability drill-downs**;
  Cash & investment inherently empty). Added a **latest-year shock** for group 73 (margin ×1.5, DSO
  ×1.7 in 2025) so the shifts band has favorable **and** unfavorable moves to show. Seeded groups 35
  + 28 theme scores so the **peer strip shows 4 sectors**, not 2.
- **`scripts/headless_check.js`** — `sectors-drilldown-fh` (click Financial health tile body →
  populated 4/4 drill-down) + `sectors-drilldown-empty` (click Cash & investment → honest empty).
- Docs: `docs/REDESIGN_SECTOR_OVERVIEW.md` Phase 3 status.

## How I verified

- **`pytest` (Docker):** 506 passed, 6 skipped — no regression; fixture seeds cleanly (15 theme
  scores + 43 components, 32 distribution rows).
- **e2e headless render check** (`docker compose build api` → e2e): **HEADLESS CHECK: PASS**,
  `errors=0`. **Eyeballed:**
  - `sectors` (73, default): scorecard + **peer strip** (Profitability · 4 sectors, 73 accent) +
    **biggest-shifts** (ROE ▲+12.5% & Net margin ▲+6.2% green; DSO ▲+51d & CCC ▲+52d red — direction
    glyph + favorability color) + **Profitability drill-down** (Showing 3 of 4; roic omitted) + the
    kept DuPont/trend/spreads/lifecycle below. Page order correct.
  - `sectors-drilldown-fh`: clicking the Financial health **tile body** re-points the peer strip to
    Financial health and populates the drill-down **4 of 4** (current/d-e/int-cov/quick).
  - `sectors-drilldown-empty`: Cash & investment → **honest empty** drill-down ("Showing 0 of 2 …
    no peer distribution … not zero. See the composite decomposition."). Peer strip re-points (2
    sectors). No boxes.

## What QA should probe

- **AC-9** score vs tile-body: clicking the **score** opens the decomposition and does **not** change
  the focused theme (stopPropagation); clicking the **body** expands without opening the decomposition.
- **AC-11** focus persistence: focus Financial health, switch 73→60 → still Financial health (banks
  score it, drill-down populates); focus Operating efficiency, switch to banks (omit it) → falls back
  to banks' first scored theme.
- **AC-3** peer strip omits non-scoring sectors (bar count == #sectors scoring the theme).
- **AC-5** shift color direction: `+DSO`/`+CCC` red (unfavorable), `+ROE`/`+net_margin` green;
  `equity_multiplier` (if it ranks) has no color.
- **AC-13** no zeros for omitted bars/metrics/boxes; no verdict/alpha; basis text on both surfaces.
- **AC-15** mobile 390px reflow (peer strip / shifts rows / drill-down boxes).

## Notes

- The shifts band renders an **honest empty** state on smooth data (no statistically unusual move) —
  the fixture's group-73 shock exists precisely so the *populated* path is exercised in the check.
- Threshold-alert layer + "what's moving" feed remain out (Track-2 / no threshold data).
