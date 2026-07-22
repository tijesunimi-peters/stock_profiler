# Brief — Sector Analytics app: shell + Sector view (Phase 1)

Stage 1 (Product Manager) handoff. Task slug: `sector-app-shell`.
Parent plan: `docs/REDESIGN_SECTOR_APP.md`. Design reference:
`docs/design/sector-app-prototype/` (`HANDOFF.md`, `prototype.dc.html`, `preview.webp`).

## Problem / user

We're rebuilding the sector surface **from scratch** as a "paper terminal" single-page app with a
persistent control bar + a four-view rail (Sector · Company · Compare · Qualitative) and
cross-view state — driven by an external prototype the operator approved. Phase 1 delivers the
**app shell + the Sector view on real data**; the other three views are inert/stub rail entries
built in later phases. The **user** is the sector analyst; success = they land on a polished,
single-page Sector view that reads a sector's composite health, opens any score's decomposition,
expands a theme to its peer strip + dispersion, and switches sectors — all honest, all on real
Track-1 data, with **no good/bad coloring**.

**Frontend-only** — the endpoints exist (Phase 0 + the DuPont/spreads/lifecycle endpoints). No
`src/secfin/` change expected.

## Scope gate (Track 1)

**PASS.** UI over shipped Track-1 endpoints. The prototype's Track-2 / no-backend elements are
**not built with fabricated data**: the **Qualitative view** (Phase 4) is a "Coming — Track 2"
stub; the **filing-event feed** (8-K/Form 4/S-1) is **omitted** in Phase 1; **sub-industry pills**
(SIC-4) and **coverage %/filed %** have no backend → omitted or shown without a fabricated number.

## Scope

1. **App shell** (a new page; route decided in architecture — see R1):
   - Fixed **210px sidebar** — ClearyFi brand + "SEC data", nav (reuse the existing sidebar
     vocabulary; "Sector analytics" active).
   - Sticky **top header** — search stub (⌘K, `preventDefault`) + API-reference link.
   - **Main** (max 1440px): page title "Sector analytics" + as-of note.
   - **Persistent sector control bar**: sector **dropdown** (all sectors from `/v1/sectors/
     theme-scores`), a **meta row** (filer count + as-of FY from real data; a **status legend**
     OK / ≈ approx / ∅ N/A / ~ N/M), and a **"pin to compare"** button (sets `compareA`, shows a
     pinned state). **No fabricated coverage %** and **no sub-industry pills** in Phase 1 (R2/R3).
   - **132px left view rail**: Sector (active) / Company / Compare / Qualitative. The latter three
     render but are **inert/stub** this phase.
   - **Global state store** `{view, sectorIdx, subIdx, expandedTheme, decompTheme, focalTicker,
     compareA, compareB}` that **persists across view switches** (switching to a stub view and back
     keeps the selected sector + expanded theme).
2. **Sector view** on **real data** (`/v1/sectors/theme-scores`, `/v1/sectors/{group}`,
   `/v1/sectors/{group}/spreads`, `/v1/sectors/{group}/lifecycle`):
   - **7-theme scorecard**: 5 scored (from `theme-scores`) + 2 **"not yet scored"** tiles
     (accounting_quality, structure_activity). Each scored tile: theme name; **0–100 score**; an
     **arrow-glyph delta** (↑ / ↓ / → from `delta_vs_prior_fy`, **NO color**); a **percentile line**
     ("vs all sectors"); a **rank** ("N of M"). A **provisional banner** on the scorecard
     ("scores provisional — weighting/normalization per methodology").
   - **Click a score → decomposition panel** (`00 §9a`): each constituent with a **contribution
     bar** (single terracotta accent, magnitude only; sign via ↑/↓), the equal-weight note, and the
     normalization string. **No favorability color.** `stopPropagation` so it doesn't also expand
     the tile.
   - **Click a tile (body) → `expandedTheme`**, which drives **both**: the **peer strip** (one bar
     per scored sector on that theme, focal sector **accented**, others neutral, **no color**) and
     the **theme drill-down** (median + IQR **track tiles** for the theme's distribution-backed
     constituents from `/spreads`; constituents without a distribution **honestly omitted**, honest
     empty when none).
   - **Biggest-shifts list** — metric-level standardized change (reuse the Phase 3 logic) with an
     **arrow glyph** and a basis note; **NO favorability color**.

## Out of scope (this phase — flag, don't build)

- **Company view** (Phase 2 — dot-plot distributions; needs a per-peer-values data-gap decision).
- **Compare view** (Phase 3 — sector-vs-sector paired bars).
- **Qualitative view** (Phase 4 — a "Coming — Track 2" stub, **no fabricated figures**).
- **Filing-event feed**, **sub-industry (SIC-4) pills**, **coverage %/filed %**, **same-store
  logic** — no backend; omitted or shown without a fabricated number.
- Any `src/secfin/` / endpoint change.

## Acceptance criteria (what QA will verify — by driving the page)

**Shell**
- AC-1 The shell renders: sidebar, sticky header (search stub + API-ref), title + as-of, the
  persistent control bar, and the 132px view rail with **Sector active**.
- AC-2 The **sector dropdown** lists sectors and selecting one **re-derives the whole Sector view**
  (scorecard, peer strip, drill-down, meta row) for that sector.
- AC-3 The **view rail** switches `view`; switching to a stub view and back **preserves** the
  selected sector + expanded theme (state persists). Company/Compare/Qualitative render an
  **inert/stub** panel (no fabricated data), Qualitative clearly "Coming — Track 2".
- AC-4 The **meta row** shows real filer count + as-of FY + the **status legend**; **no fabricated
  coverage %**; **no sub-industry pills**.

**Sector view**
- AC-5 The scorecard shows **7 tiles = 5 scored + 2 "not yet scored"** (accounting_quality,
  structure_activity as honest markers, never a fabricated score/0).
- AC-6 Each scored tile shows score, an **arrow-glyph** delta (↑/↓/→), a "vs all sectors"
  percentile, and a rank — **with no green/amber/red anywhere**.
- AC-7 **Click a score → decomposition** (constituents + single-accent contribution bars + sign via
  arrow + equal-weight note + normalization); click again closes; **no color**; clicking the score
  does **not** also expand the tile.
- AC-8 **Click a tile → expandedTheme**: the peer strip re-points to that theme (bar per scored
  sector, focal accented, **no color**) **and** the drill-down shows that theme's IQR track tiles
  (distribution-backed constituents; omitted-not-zeroed otherwise; honest empty when none).
- AC-9 The **biggest-shifts** list renders with arrow glyphs + basis, **no color**.

**Honesty (the brand)**
- AC-10 **No favorability color anywhere** in the new sector UI — direction is arrow glyph + track
  position only, single terracotta accent (the Phase 2 `--positive/--caution/--negative` tokens are
  **not** used here). Verifiable by grep + eyeball.
- AC-11 **N/A never 0** (null delta → "→"/"no prior FY", never 0; omitted constituents/bars never
  zeroed); deferred themes never fabricated; no made-up coverage/sub-industry/feed.
- AC-12 The provisional banner + the endpoint caveats/normalization are surfaced; scores read as a
  **position, not a verdict**; no buy/sell/alpha copy.

**Platform**
- AC-13 **CSP-safe / self-contained** — **no Tailwind, no React, no CDN**; vanilla JS + CSS using the
  existing tokens; theme-aware (light-only app); mobile width holds (control bar, scorecard,
  rail reflow; no clipped labels / horizontal bleed).
- AC-14 The **existing `/sectors` page is unaffected** by this change (per R1 — a new route or a
  behind-a-flag swap; the shipped design stays reachable until the app is approved).
- AC-15 Docker e2e headless render check passes (screenshots eyeballed: shell, scorecard,
  decomposition open, peer strip + drill-down for an expanded theme, a "not yet scored" tile,
  mobile) + `pytest` green (no backend change).

## Risks / open decisions

- **R1 — route (architect/operator).** Replace `/sectors` now, or build at a **new route** (e.g.
  `/sector-analytics`) and swap when the 4-view app is complete? **Recommend a new route during the
  multi-phase build** — replacing `/sectors` now would leave the live route as an incomplete 1-of-4
  app. Architect proposes; confirm with operator.
- **R2 — sub-industry pills.** SIC-4 has no backend. **Omit** in Phase 1 (the prototype shows them);
  add when SIC-4 aggregation exists. Confirm the control bar reads well without them.
- **R3 — coverage %.** No backend. **Omit** the coverage chip (or show "full peer set" with no
  number) — never a fabricated "94% filed".
- **R4 — "pin to compare".** Compare is Phase 3. The button **sets `compareA` + shows a pinned
  state** but has no navigation target yet (Compare stub). Keep it functional-but-parked, or hide
  until Phase 3 — architect decides.
- **R5 — decomposition weights.** The endpoint constituents carry `oriented_z` under **equal
  weight** (not the prototype's per-constituent weights). Present as **equal-weight** contribution
  bars (magnitude = |oriented_z|, sign via arrow); **do not fabricate weights**. Label the method.
- **R6 — reuse vs rewrite.** Much Sector-view logic exists in the current `sectors.js` (scorecard,
  peer strip, shifts, drill-down) but **with Phase 2 favorability color**. The new UI must strip the
  color and adopt the paper-terminal layout — architect decides how much to reuse vs rewrite in a
  new file (a new page likely wants its own JS/CSS).

## Handoff → Principal Architect

Frontend-only (`senior-frontend-engineer`) + a `scripts/headless_check.js` (and possibly a route in
`api/main.py` static routing) touch. Design the new page (route per R1), the shell + control bar +
view rail + state store, the Sector view against the four endpoints with **no favorability color**,
the decomposition/peer-strip/drill-down interactions, and the honest omissions (R2–R5). Decide reuse
vs rewrite (R6). Map every AC to a concrete check.
