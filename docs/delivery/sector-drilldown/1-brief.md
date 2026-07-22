# Brief — Peer strip · biggest-shifts · theme drill-down (Phase 3 of the sector-overview redesign)

Stage 1 (Product Manager) handoff. Task slug: `sector-drilldown`.
Parent plan: `docs/REDESIGN_SECTOR_OVERVIEW.md` (Phase 3, the final phase).
Design authority: `docs/layout_guides/01-sector-overview.md` §4–6, `00-global-conventions.md`
§3b/§12/§11.2. Branch **stacks on Phase 2 (`sector-scorecard`)**.

## Problem / user

The scorecard (Phase 2) gives a sector's theme scores but leaves three questions unanswered: *is
this number unusual vs other sectors?* (no cross-sector context — single-sector focus removed the
old table), *what moved this period?*, and *what's the dispersion behind a theme?* Phase 3 adds the
three surfaces the guide specifies (`01 §4–6`) and makes the scorecard tiles fully interactive. The
**user** is the sector analyst; success = they can read a sector's standing against peers on the
focused theme, see the biggest period-over-period moves, and expand any theme to its constituent
dispersion — all without leaving the page or losing their focus.

**Mostly frontend** — the peer strip and drill-down read data already fetched
(`state.themeScores`, `state.groupSpreads`); the metric-level shifts compute off the DuPont +
lifecycle FY series already in `state`. No new endpoint.

## Scope gate (Track 1)

**PASS.** UI over shipped Track-1 endpoints + client-side standardization of already-fetched series.
The Track-2 "what's moving" 8-K feed (`01 §7`) and the threshold-alert layer (`00 §13`) are
**explicitly out** (below).

## Scope

1. **Peer strip** (`00 §3b`, `01 §4`) — one row of small bars, one per sector, on the **focused
   theme**, from the already-fetched `/sectors/theme-scores` (each sector's composite score for that
   theme). Selected sector's bar in `accent`, others neutral; a caption naming the theme + basis
   ("financial health · N sectors · FY2025"). **Context only — NOT clickable-to-navigate.** Sectors
   that don't score the theme are **omitted** (no zero bars).
2. **Biggest-shifts band** (`00 §12`, `01 §5`) — the **3–5 metrics** with the largest **standardized
   YoY change** over the DuPont series (`roe`, `net_margin`, `asset_turnover`, `equity_multiplier`)
   + lifecycle series (`dio`, `dso`, `dpo`, `ccc`), both already in `state`. Each row: metric name +
   signed change + **favorability color** (via a display-only direction map) + a basis note.
   `equity_multiplier` is **context/neutral** (no favorability color — leverage-up isn't cleanly
   "bad"). A metric with **too little history** to standardize is **omitted** (never fabricated).
3. **Theme drill-down** (`01 §6`) — clicking a tile **body** expands the theme: median + IQR box
   tiles for that theme's constituents that have a peer distribution (reusing `boxWhiskerChart` /
   `/sectors/{group}/spreads`), with a dispersion caption. Constituents **without** a distribution
   are **honestly omitted** (never zero boxes); a theme whose constituents have **no** distributions
   shows an **honest empty** drill-down.
4. **Interaction** — the tile **body** click expands the theme → re-points the peer strip + shows
   the drill-down; the **score** button still opens the Phase 2 decomposition (the two must not
   collide). The **focused theme persists across sector switches** (`00 §11.2` metric-axis
   preservation). Default focused theme = the **first scored tile**.
5. **Page order** (`01`): sector bar → scorecard → **peer strip** → **biggest-shifts** → **theme
   drill-down** → aggregation banner → DuPont tree + trend → (**kept**) per-sector spreads → lifecycle.

## Out of scope (this phase — flag, don't build)

- **Threshold-alert layer** (`00 §13`) — would pin threshold-crossing metrics to the shifts band; no
  threshold data exists (thresholds-with-metrics unbuilt). The shifts band is standardized-change-
  ranked only.
- **"What's moving" filing-event feed** (`01 §7`) — Track-2 / 8-K-item parsing, not ingested.
- **Broadening `/sectors/{group}/spreads` coverage** — the endpoint's metric set is fixed; the
  drill-down is honestly partial for themes whose constituents lack distributions (see R1). Widening
  it is a separate backend/data task.
- **Peer-strip click-to-navigate**, **sub-industry drill**, **filing-coverage %** — deferred.
- Altitudes 2–4 (Company drill-down, Compare, Qualitative) — separate tracks; Qualitative is Track-2.

## Acceptance criteria (what QA will verify — by driving the page)

**Peer strip**
- AC-1 A peer strip renders below the scorecard for the focused theme: one bar per sector that scores
  it (from `/sectors/theme-scores`), the **selected sector's bar in `accent`**, others neutral, with
  a caption naming the theme + basis (N sectors · FYyyyy).
- AC-2 The peer strip is **not clickable-to-navigate** (clicking a bar does not switch the selected
  sector).
- AC-3 Sectors that don't score the focused theme are **absent** from the strip (no zero bars).

**Biggest-shifts**
- AC-4 A biggest-shifts band renders **3–5** metrics ranked by |standardized YoY change|; each row:
  metric name + signed change + favorability color + glyph + a basis note.
- AC-5 Favorability is **direction-correct**: an increase in a lower-is-better metric (`dso`/`dpo`/
  `ccc`) reads **unfavorable**; an increase in `roe`/`net_margin` reads favorable; `equity_multiplier`
  is **neutral** (no favorability color).
- AC-6 A metric with **too little history** to standardize is omitted (never a fabricated shift); if
  no metric qualifies, the band shows an honest empty/absent state (not a broken row).

**Theme drill-down**
- AC-7 Clicking a tile **body** expands that theme: the drill-down (median+IQR box tiles for the
  theme's distribution-backed constituents) renders **and** the peer strip re-points to that theme.
- AC-8 Constituents without a peer distribution are **omitted** (never zero boxes); a theme whose
  constituents have **no** distributions (e.g. Cash & investment) shows an **honest empty**
  drill-down ("no peer distribution for this theme's constituents yet"), not a blank/broken panel.
- AC-9 The **score** button still opens the Phase 2 decomposition, independent of the tile-body
  expand; the two affordances don't collide (clicking the score doesn't also expand the theme).
- AC-10 The existing always-on **"Metric spread across &lt;sector&gt;"** panel is **still present**
  lower in the body (kept, not removed).

**State / interaction**
- AC-11 The focused theme **persists across a sector switch**: expand theme A, switch sector via the
  header selector → theme A is still focused (peer strip + drill-down show A for the new sector).
- AC-12 Default focused theme on first load = the **first scored tile**; the peer strip + drill-down
  reflect it.

**Honesty / platform**
- AC-13 **N/A never 0** anywhere (omitted bars / metrics / boxes, never zeros); **no verdict / alpha
  / buy** language; the shifts band + peer strip carry their **basis**; favorability color used
  **only** for favorability.
- AC-14 **Page order** matches the scope (peer strip + shifts + drill-down between the scorecard and
  the aggregation banner; DuPont + kept spreads + lifecycle below).
- AC-15 Token-driven (light-only app), CSP-safe, mobile width holds (peer strip / shifts / drill-down
  reflow, no clipped labels, no horizontal bleed).
- AC-16 Docker e2e headless render check passes (screenshots eyeballed) + `pytest` green. The fixture
  seeds distributions so the render check shows a **populated** drill-down (e.g. Financial health)
  **and** an honest-empty one (e.g. Cash & investment), plus enough FY history for the shifts band.

## Risks / open decisions (for the architect / design stage)

- **R1 — drill-down coverage (honesty-critical).** `/sectors/{group}/spreads` covers only its fixed
  `_SPREAD_METRICS` set, so many theme constituents lack IQR tiles: **Financial health** = full
  (4/4), **Profitability** ≈ 3/6, **Growth** ≈ 2/4, **Operating efficiency** ≈ 1/6, **Cash &
  investment** = **0/2** (honest empty). The drill-down must clearly state it shows only
  distribution-backed constituents and render the honest empty case. Broadening coverage is out of
  scope (a data/backend task). Architect: confirm the copy + the empty state.
- **R2 — standardization method.** Exact def of "standardized YoY change" (e.g. z of the latest YoY
  change vs the metric's historical YoY changes; a minimum FY-point threshold; degenerate
  zero-variance handled honestly). Architect picks; label the basis.
- **R3 — tile double-affordance.** Tile-body (expand theme) vs score-button (decomposition) on the
  same tile. Design must make both affordances legible (hover/expand indicator) so the user knows
  body = drill-down, score = decomposition. Confirm in the design pass.
- **R4 — default focused theme.** First scored tile (guide suggested Growth; first tile = usually
  Profitability). Minor; design confirms.
- **R5 — fixture seeding.** Seed metric_distributions so a populated drill-down (Financial health /
  Profitability) + the honest-empty case (Cash & investment) both render; the existing 5-year FY
  series already covers the shifts band.
- **R6 — phase size.** This is the **largest** phase (three surfaces + interaction rework). If the
  engineer/architect finds it too large for one clean change, raise splitting (peer strip + shifts |
  drill-down) rather than rushing — but default to one branch.

## Handoff → Principal Architect

Mostly frontend (`senior-frontend-engineer`, owns `static/`) + a `scripts/seed_fixture.py` +
`scripts/headless_check.js` touch (assign as in Phase 2). Design the peer strip, the metric-level
standardization + display-only direction map, the theme drill-down (reusing the box-whisker
plumbing) + its honest empty state, the tile double-affordance, and the `focusTheme` state
(persist across sector switch). Resolve R1–R5. Map every AC to a concrete check (e2e screenshot /
driven interaction / pytest).
