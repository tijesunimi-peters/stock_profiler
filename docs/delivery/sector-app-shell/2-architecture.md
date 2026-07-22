# Architecture — Sector Analytics app: shell + Sector view (Phase 1)

Stage 2 (Principal Architect). Designs against `1-brief.md`. **Frontend-only** (single stage).
Owner: `senior-frontend-engineer`. Reference: `docs/design/sector-app-prototype/`.

Scope re-check: **Track 1, in-architecture.** A new static page over shipped endpoints + one static
route in `api/main.py` (the established pattern). No `src/secfin/` data/logic change, no new
dependency, CSP-safe (vanilla JS/CSS, no Tailwind/React/CDN). Track-2 elements are stubbed/omitted,
never fabricated.

## Decisions resolved

### R1 — new route, `/sectors` untouched (CONFIRMED, flag for operator)
New page at **`GET /sector-analytics`** → `FileResponse(STATIC_DIR / "sector-analytics.html")`
(mirrors `/guide`, `/coverage` in `api/main.py`). The shipped `/sectors` page + its assets are
**not touched** — both routes coexist until the operator approves swapping `/sectors` → the app (a
later, trivial route change). **Flag for operator confirmation at the QA/commit gate.**

### R6 — own JS/CSS, reuse only shared helpers (CONFIRMED)
A **new self-contained asset set** — `static/sector-analytics.html`, `static/sectorapp.css`,
`static/sectorapp.js`. It does **not** import `sectors.js`/`sectors.css` (those carry the Phase 2
favorability color + the old single-sector shell). It **reuses**: `static/style.css` (the `:root`
tokens — identical to the prototype) and `static/app.js`'s `window.ClearyFi.*` helpers (`api`,
`esc`, `fmt`, `measuredWidth`, `boxWhiskerChart`, `states`). It builds the **paper-terminal shell
inline** (its own sidebar/header/control bar/view rail per the prototype) — it does **not** load
`script.js` (the shared shell renderer). The favorability tokens (`--positive/--caution/--negative`)
are **never referenced** here.

### R2/R3/R4/R5 — honest handling of prototype elements with no backend
- **R2 sub-industry pills — OMIT** (SIC-4 has no backend). The control bar's sub-industry row is left
  out this phase; `subIdx` stays in the store for later.
- **R3 coverage % — OMIT** the coverage chip; the meta row shows filer count + as-of FY + "full peer
  set" (no fabricated %).
- **R4 pin-to-compare — PARKED**: the button sets `compareA = sectorIdx` and shows a pinned state;
  Compare is a stub so there's no navigation yet (no-op beyond the state flag).
- **R5 decomposition — equal-weight** contribution bars: magnitude = `|oriented_z|` normalized to the
  largest constituent, single terracotta accent, **sign via ↑/↓ glyph** (favorable/unfavorable by
  the constituent's `higher_is_better` + z sign, but **no color**). The equal-weight note + the
  payload `normalization` are shown. **No fabricated per-constituent weights.**

## Data flow (existing endpoints, fetched by `sectorapp.js`)

- `GET /v1/sectors` — the **sector universe** for the dropdown + per-sector `peer_count` (filers) +
  `fiscal_year` (as-of). Fetched once.
- `GET /v1/sectors/theme-scores` — the **scorecard** (5 scored + 2 deferred per sector) + the
  **decomposition** constituents + drives the **peer strip** (all sectors' score on a theme).
  Fetched once (carries every sector).
- `GET /v1/sectors/{group}` — DuPont FY series → the **biggest-shifts** (with lifecycle) + (optional)
  a compact trend. Lazy per sector.
- `GET /v1/sectors/{group}/spreads` — the **theme drill-down** IQR track tiles. Lazy per sector.
- `GET /v1/sectors/{group}/lifecycle` — lifecycle FY series → the **biggest-shifts** lifecycle
  metrics. Lazy per sector.

Standardized-shift math + the metric direction map are **ported from Phase 3's `sectors.js`**
(`standardizedShift`, `SHIFT_DIRECTION`) — but rendered **without color** (arrow glyph only).

## `static/sector-analytics.html`

Minimal: `<head>` loads fonts (already vendored/allowed as in other pages), `style.css`,
`sectorapp.css`; `<body>` a single `<div id="app"></div>`; scripts `app.js` then `sectorapp.js`.
`<title>` "ClearyFi — Sector analytics". (Match the existing pages' head; **no CDN**.)

## `static/sectorapp.js` — structure

```
window.ClearyFi (P) helpers reused. One IIFE. A store:
state = { view:'sector', sectorIdx, subIdx:null, expandedTheme, decompTheme, focalTicker:null,
          compareA:null, compareB:null,
          sectors:null (/sectors), themeScores:null, series:{}, spreads:{}, lifecycle:{} }
```
- `renderShell()` — sidebar (210px, brand + nav links to existing pages, "Sector analytics" active),
  sticky header (search stub ⌘K `preventDefault`, API-ref link), the **control bar**
  (`renderControlBar()`), the **view rail** (`renderRail()`), and a `#viewport` for the active view.
- `renderControlBar()` — sector **dropdown** (button + absolute menu, outside-click closes; lists
  `state.sectors`), meta row (filers + as-of FY + status legend OK/≈/∅/~), **pin** button (R4).
  Selecting a sector: set `sectorIdx`, reset `subIdx`, re-fetch-if-needed + re-render the active view.
- `renderRail()` — Sector (active) / Company / Compare / Qualitative; click sets `state.view` and
  re-renders `#viewport`. **State persists** (only `view` changes).
- `renderView()` — dispatch on `state.view`: `renderSectorView()` (real), else a **stub panel**
  (Company/Compare "Coming in a later phase"; Qualitative "Coming — Track 2 · not derived from
  filings"). No fabricated data in stubs.
- **Sector view** (`renderSectorView()`), no favorability color:
  - `scorecard()` — "01 Health scorecard" + provisional banner; 7 tiles from the selected sector's
    `themeScores` entry (5 scored + the 2 deferred as "not yet scored"). Scored tile: theme name,
    score (mono), **arrow-glyph delta** (`deltaGlyph(delta_vs_prior_fy)` → ↑/↓/→, neutral ink),
    "P## · vs all sectors", "N of M". Tile body click → `expandedTheme`; score `<button>` click
    (`stopPropagation`) → `decompTheme`.
  - `decompPanel()` — inline (like the prototype), equal-weight contribution bars (R5).
  - `peerStrip()` — one bar per sector scoring `expandedTheme` (from `themeScores`), focal
    **accented**, others `--border-strong`; caption names theme + N sectors + FY. No color, not
    clickable.
  - `drilldown()` — the expanded theme's constituents ∩ `spreads[group].metrics` → `P.boxWhiskerChart`
    track tiles (IQR band + median tick); "N of M with a distribution"; honest omit/empty.
  - `biggestShifts()` — ported standardized-shift rows, **arrow glyph only, no color**.
  - Default `expandedTheme` = first scored theme; persists across sector switch (fall back if the new
    sector omits it) — same rule as Phase 3.
- Honest states: honest-empty scorecard when the sector has no theme scores; per-panel loading/empty.

## `static/sectorapp.css`

Paper-terminal styles from the prototype (exact spacing in `prototype.dc.html`): shell grid, sidebar,
header, control bar card (soft shadow), view rail, scorecard grid `repeat(auto-fit,minmax(158px,1fr))`,
tile, arrow-glyph delta, decomposition bars, peer-strip bars, drill-down tracks, shift rows, stub
panels. **Tokens only** (`var(--…)` from `style.css`); **no `--positive/--caution/--negative`**.
Mobile reflow.

## Files to touch
**New:** `static/sector-analytics.html`, `static/sectorapp.css`, `static/sectorapp.js`.
**Edit:** `api/main.py` (add the `/sector-analytics` route), `scripts/headless_check.js` (shots).
Docs: `docs/REDESIGN_SECTOR_APP.md` Phase 1 status. **No `src/secfin/` data/logic change**; the e2e
fixture already seeds theme-scores/spreads/lifecycle (Phase 0–3) — **no `seed_fixture.py` change**.

e2e shots (`headless_check.js`): `sectorapp` (`/sector-analytics` — shell + scorecard + default
expanded theme's peer strip + drill-down + shifts), `sectorapp-decomp` (click a score → decomposition
open), `sectorapp-stub` (`/sector-analytics` then click the Qualitative rail → "Coming — Track 2"
stub). Group 73 is the fixture's default (largest peer_count) and has theme scores.

## AC → concrete check

| AC | Check |
|----|-------|
| AC-1 | e2e `sectorapp`: sidebar + sticky header + title/as-of + control bar + view rail (Sector active) all render. |
| AC-2 | Drive: open the sector dropdown, pick a sector → scorecard/peer-strip/drill-down/meta re-derive for it. |
| AC-3 | Drive: click Company rail → stub panel; back to Sector → selected sector + expanded theme preserved; Qualitative stub says "Coming — Track 2". |
| AC-4 | Meta row: real filer count + "FYyyyy" + status legend; **no coverage %**, **no sub-industry pills** (grep the DOM). |
| AC-5 | Scorecard: 7 tiles = 5 scored + 2 "not yet scored" (accounting_quality, structure_activity); no fabricated score/0. |
| AC-6 | Each scored tile: score + arrow glyph (↑/↓/→) + "vs all sectors" + rank; **no green/amber/red** (computed-style check on delta/tile). |
| AC-7 | Drive: score click → inline decomposition (contribution bars, single accent, arrow sign, equal-weight note, normalization); re-click closes; focus/expand unaffected (stopPropagation). |
| AC-8 | Drive: tile click → expandedTheme; peer strip re-points (bar per scoring sector, focal accented, no color) + drill-down shows IQR tiles (omit-not-zero). |
| AC-9 | Biggest-shifts rows render with arrow glyph + basis, **no color**. |
| AC-10 | Grep `sectorapp.css`/`.js` for `--positive`/`--caution`/`--negative` → **absent**; computed styles of deltas/shifts are ink/accent only. |
| AC-11 | Null delta → "→"/neutral, never 0; omitted constituents/bars never zeroed; no made-up coverage/sub-industry/feed. |
| AC-12 | Provisional banner + caveats/normalization surfaced; no buy/sell/alpha copy. |
| AC-13 | `sector-analytics.html` loads **no** CDN/Tailwind/React (grep); vanilla JS/CSS; mobile 390px reflow, no overflow. |
| AC-14 | `/sectors` still serves the shipped page unchanged (route + file untouched). |
| AC-15 | `docker compose build api` → e2e PASS (errors=0), shots eyeballed; `pytest` green. |

## Handoff → `senior-frontend-engineer`
Branch off `master` (`sector-app-shell`). **Invoke `/frontend-design:frontend-design` first** — match
the prototype's paper-terminal spacing/type within our tokens, no favorability color. Order:
(1) `api/main.py` route; (2) `sector-analytics.html`; (3) `sectorapp.js` shell + state + control bar
+ rail + stub views; (4) `sectorapp.js` Sector view (scorecard → decomposition → peer strip →
drill-down → shifts), porting the shift math from `sectors.js` **minus color**; (5) `sectorapp.css`;
(6) `headless_check.js` shots; (7) docs. Self-verify: `pytest` green, `docker compose build api` +
e2e, **eyeball** every shot incl. mobile + the `/sectors` regression (still the old page).
