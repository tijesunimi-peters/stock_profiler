# Brief — v2 P0 (shell) + P1 (Sector view re-arch)

Stage 1 (Product Manager). Task slug: `sector-v2`.
Roadmap: `docs/ROADMAP_SECTOR_APP_V2.md` P0+P1. Reference: `docs/design/sector-app-prototype-v2/`
(`prototype.dc.html` lines ~133–270 Sector view; ~772–808 right rail). **Frontend-only.** Base =
`master` (fidelity work; no M1 charts). Branch off `master`.

## Problem / user

The operator's updated prototype (v2) re-architects the Sector view (which the second-opinion flags
targeted) and adds a shell right rail. The **user** is the analyst reading a sector: success = the
Sector view follows the v2 three-scope arc, the Track-2 feed lives in a right rail instead of the
content flow, and the new blocks (geographic mix, insider flow) hold their layout **as honest
placeholders** (no sector-level data yet) — with **no data fabricated** and the **F4 delta color
kept**.

## Scope gate (Track 1 / honesty)

**PASS.** Frontend-only re-arrangement of already-shipped real blocks (scorecard/decomp/peer-strip/
distribution) + **honest placeholders** for the not-yet-aggregated blocks (geo mix, insider flow,
feed). No backend, no new data, no fabrication. **F4 favorability color kept** (operator deviation
from the v2 prototype's no-color rule — recorded in the v2 roadmap).

## Scope

### P0 — Shell v2
1. **Content column capped at 960px**; the `.pa-body` becomes **view-rail (132px) · content (≤960px) ·
   right rail (262px)**.
2. **Sticky right rail (262px, `top:74px`, shown ≥1240px, hidden below)** — Sector-view only:
   - **Sector snapshot** card: sector name + k/v rows (filers · period · coverage · focused theme).
   - **"What's moving" [Track 2]** card — an **honest placeholder** ("Filing events · walled off from
     metrics — to be defined"), **no fabricated events**. (Moved out of the Sector content flow.)
   - **"How to read this"** card: the honesty note ("a position vs other sectors, not a verdict …") +
     a Methodology link.

### P1 — Sector view v2 (three numbered scopes)
1. **01 · Health scorecard** — the 7-tile scorecard (keep the **F4 delta color**) + provisional banner
   + the **peer strip moved directly under the grid** ("Where this sector sits") + a **3fr 2fr row**:
   **Geographic revenue mix** (ASC 280 — **placeholder**) + **Insider flow** (Forms 3/4/5 —
   **placeholder**, no sector-level aggregate yet).
2. **02 · What drives it** — the **decomposition full-width, open by default** on the focused theme
   (200px 60px 1fr 52px rows) + **Biggest shifts**.
3. **03 · Distribution** — one **dispersion block with a [This theme] / [All metrics] scope toggle**
   (`drillScope`): *This theme* = the focused theme's constituent spreads (current drill-down); *All
   metrics* = every metric's spread (box-whisker per metric). IQR band + median tick + caption.
4. **Remove** the in-flow "What's moving" feed placeholder (now in the right rail) and the v1 drill-
   down 2-col; there are no M1 DuPont/ROE/lifecycle on `master` to remove.

## Out of scope (this iteration)

- Company/Compare/Qualitative/Filings views (later phases P2–P5).
- Any **backend** (geo/insider aggregation is P6, optional; here they are placeholders).
- Real geo/insider/feed **data** — all placeholders.
- Sub-industry pills (stay a placeholder).

## Acceptance criteria (what QA will verify)

- AC-1 The content column is **≤960px**; a **sticky 262px right rail** shows on the Sector view
  (≥1240px) with the **Sector snapshot** (real filers/period/coverage/focused-theme), the **"What's
  moving" Track-2 placeholder** (no fabricated events), and the **"How to read this"** note; the rail
  **hides below 1240px** with no overflow.
- AC-2 **01 Health scorecard**: the scorecard (with the **F4 delta color** intact) + provisional
  banner + the **peer strip under the grid** + a **geographic-revenue-mix placeholder** + an
  **insider-flow placeholder** — both clearly "to be defined", **no fabricated segments/%/ratio/bar**.
- AC-3 **02 What drives it**: the **decomposition is full-width and open by default** on the focused
  theme; clicking a tile re-points it; **Biggest shifts** follows.
- AC-4 **03 Distribution**: one dispersion block with a working **[This theme] / [All metrics]
  toggle** — *This theme* shows the focused theme's constituent spreads; *All metrics* shows every
  metric's spread; IQR band + median tick + caption; honest empty when a scope has no distribution.
- AC-5 **Honesty:** placeholders unmistakable, never fabricated; N/A never 0; scores read as a
  position not a verdict; the F4 color accompanies the arrow (value neutral).
- AC-6 **Platform:** CSP-safe; **mobile 390px** (right rail hidden, scopes stack, toggle wraps) no
  overflow; `pytest` green (no backend); Docker e2e passes + eyeballed.
- AC-7 **No regression:** Company/Compare/Qualitative + old `/sectors` render; `?group=` deep-link;
  scorecard tile-click still focuses the theme (drives decomp + distribution + peer strip together).

## Risks / open decisions (for the architect)

- **R1 — right rail wiring.** Restructure `renderApp`'s `.pa-body` to 3 columns; the right rail is
  Sector-view-only (empty/absent for other views). Media query hides it < 1240px.
- **R2 — distribution toggle.** Add `state.drillScope` (`theme` | `all`); *This theme* reuses the
  current `drilldownHtml`/`mountDrilldown` (focused-theme constituents from `spreads[g]`); *All
  metrics* renders a box-whisker per `spreads[g].metrics` (reuse `P.boxWhiskerChart`). One card, a
  segmented toggle, `renderApp()` on switch.
- **R3 — decomp default-open + full-width.** Default `state.decompTheme` to the focused theme; render
  it full-width in scope 02 (not the v1 2-col). Keep the F5 tile-click "focus" behavior
  (`expandedTheme` drives decomp + distribution + peer strip together).
- **R4 — placeholders.** Geo mix, insider flow, and the feed reuse the established `.pa-ph` /
  placeholder styling; **never** a fabricated bar/segment/ratio/event. Insider flow may show the
  honest "no sector-level aggregate yet" note (per the roadmap; real via P6 later).

## Handoff → Principal Architect

Frontend-only. Design the `renderApp` shell (3-col body + right rail) + the `renderSectorView`
re-arch (3 scopes, decomp full-width default-open, distribution toggle, placeholders) per the v2
prototype; resolve R1–R4; keep the F4 color; map every AC to a check; confirm no backend. Owner:
`senior-frontend-engineer`, branch off `master`. **Interactive → QA verdict "PASS — pending manual UI
verification" (operator hands-on).**
