# Architecture — v2 P0 (shell) + P1 (Sector view)

Stage 2 (Principal Architect). Task slug: `sector-v2`. **Verdict: FRONTEND-ONLY** — `sectorapp.js` +
`sectorapp.css` (+ `headless_check.js`). No backend. Branch off `master`. Owner:
**`senior-frontend-engineer`**. Reference: v2 prototype (Sector ~133–270; right rail ~772–808).

## Scope re-check

Track 1. Re-arrange shipped real blocks + honest placeholders for not-yet-aggregated blocks. No data,
no fabrication. **F4 delta color kept** (operator deviation from the v2 no-color rule).

## Plan — `static/sectorapp.js`

- **State:** add `drillScope: "theme"` (`theme` | `all`).
- **`renderApp` shell:** `.pa-body` → 3 children: `railHtml()` · `<div class="pa-viewport">` ·
  **`state.view === "sector" ? rightRailHtml() : ""`**. (Right rail is Sector-view-only.)
- **`rightRailHtml()`** (new): a `.pa-rrail` aside with 3 cards —
  1. **Sector snapshot**: the sector name + k/v rows (filers · period `FY{yr}` · coverage — to be
     defined · focused theme label).
  2. **"What's moving" [Track 2]**: an **honest placeholder** — "Filing events · walled off from
     metrics — to be defined." **No fabricated events.**
  3. **"How to read this"**: the honesty note + a Methodology link (`/methodology`).
- **`renderSectorView` re-arch** (replace the tail) into three scopes via a `scopeHead(num, title, sub)`
  helper (ported from `secHead`):
  - **01 Health scorecard**: `scopeHead("01","Health scorecard",…)` + `scorecardHtml(entry)` (F4 color
    kept) + provisional banner + `peerStripHtml()` + **`geoInsiderRowHtml()`** (a `3fr 2fr` row:
    `geoPlaceholderHtml()` + `insiderPlaceholderHtml()`).
  - **02 What drives it**: `scopeHead("02","What drives it",…)` + **decomp full-width** (`ensureDecompTheme`
    → open by default on the focused theme; `decompHtml(entry)` full-width) + `shiftsHtml(g)`.
  - **03 Distribution**: `scopeHead("03","Distribution",…)` + **`distributionHtml(entry, g)`** — one
    card with a **`[This theme] / [All metrics]` segmented toggle** + the per-metric dispersion tiles.
  - **Remove** the in-flow `.pa-drill-row` + `feedPlaceholderHtml()` from the Sector flow (feed → right
    rail). Keep `drilldownHtml`/`mountDrilldown` internals but drive them from `distributionHtml`.
- **`distributionHtml(entry, g)` + `mountDistribution(entry, g)`:**
  - `theme` scope → the focused theme's constituent spreads (current `drilldownHtml`/`mountDrilldown`
    body, minus its own card head — the toggle card wraps it).
  - `all` scope → a box-whisker per `state.spreads[g].metrics` (reuse `P.boxWhiskerChart`, like the M1
    `allSpreads` but here as the toggle's "All metrics"); honest empty when none.
  - The toggle buttons set `state.drillScope` + `renderApp()`.
- **`geoPlaceholderHtml()` / `insiderPlaceholderHtml()`** — cards matching the v2 headers
  ("Geographic revenue mix · ASC 280…", "Insider flow · Forms 3/4/5") with an **empty placeholder body**
  ("to be defined" / "no sector-level aggregate yet"), reusing `.pa-ph*`. **No fabricated bar/segment/%
  /ratio.**
- **`wireSectorView`:** wire the distribution scope buttons (`.pa-scope-btn`); keep tile/score/decomp
  handlers (the F5 "tile focuses" behavior + default-open decomp).
- **`mountDistribution`** called after `vp.innerHTML` (like `mountDrilldown`).

## Plan — `static/sectorapp.css`

- `.pa-body` → 3-col flex (rail 132 · viewport `flex:1; max-width:960px` · `.pa-rrail` 262 none).
- `.pa-rrail` (sticky `top:74px`, cards) + its snapshot/feed/how-to-read card styles (reuse tokens).
- `.pa-scope-toggle` / `.pa-scope-btn` segmented control (active = accent-wash-ish, resolving tokens).
- `.pa-geo`/`.pa-insider` placeholder cards (reuse `.pa-ph`/dashed/muted); the `3fr 2fr` row.
- Scope-head reuse of `.pa-sec-head`/`.pa-sec-sub`.
- **Mobile/≤1240:** `.pa-rrail { display:none }` below 1240px; ≤900 the scopes + geo/insider row + the
  distribution stack; the toggle wraps. No horizontal overflow.

## `scripts/headless_check.js`

- The `sectorapp` shot now shows the 3 scopes + peer strip + geo/insider placeholders + full-width
  decomp; add a `sectorapp-dist-all` shot that clicks the **[All metrics]** scope toggle. The
  `sectorapp` shot at ≥1280 shows the right rail.

## Acceptance criteria → concrete checks

| AC | Check |
|----|-------|
| AC-1 | `.pa-viewport` computed max-width 960; `.pa-rrail` present on Sector view (snapshot real + feed placeholder + how-to-read); hidden < 1240px. |
| AC-2 | 01: scorecard (`.pa-tile-delta.pos/.neg` colored) + peer strip + `.pa-geo`/`.pa-insider` placeholders (no digit that reads as data). |
| AC-3 | 02: `.pa-decomp` present on load (full-width, focused theme); tile click re-points it. |
| AC-4 | 03: `.pa-scope-toggle`; clicking All metrics re-renders the dispersion to every metric; This theme → constituents. |
| AC-5 | No fabricated geo/insider/feed; N/A never 0; F4 color present + arrow-paired. |
| AC-6 | 390px overflow=0 (rrail hidden, scopes stack); `pytest` green; e2e PASS + eyeballed. |
| AC-7 | Company/Compare/Qualitative + old `/sectors` render; `?group=`; tile focuses decomp+distribution+peer-strip. |

## Handoff → Senior Frontend Engineer

Frontend-only, branch off `master`. Build the 3-col shell + right rail, the 3-scope Sector re-arch,
the distribution toggle, and the geo/insider/feed placeholders per the v2 prototype; keep the F4 color;
fabricate nothing. Verify: `pytest` green, `docker compose build api` → e2e, eyeball `sectorapp` +
`sectorapp-dist-all` + mobile, confirm the other views + `/sectors`. **Interactive → verdict "PASS —
pending manual UI verification."**
