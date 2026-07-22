# Implementation — Sector Analytics app: shell + Sector view (Phase 1)

Stage 3 (Senior Frontend Engineer) handoff → QA. **Frontend-only.** Branch: **`sector-app-shell`**
(off `master`). Uncommitted.

## What changed and why

A **new, self-contained "paper terminal" single-page app** at **`/sector-analytics`**, rebuilding
the approved prototype (`docs/design/sector-app-prototype/`) in our **vanilla-JS/CSS, CSP-safe**
stack. Phase 1 = the app shell + the Sector view on real data; the other three views are inert
stubs. The shipped `/sectors` page is **untouched**.

- **`api/main.py`** — new `@app.get("/sector-analytics")` → `FileResponse(sector-analytics.html)`
  (mirrors `/guide`, `/coverage`). No other backend change.
- **`static/sector-analytics.html`** (new) — loads `style.css` (tokens) + `sectorapp.css`; vendored
  `d3`/`plot` (for the drill-down box-whisker) + `app.js` (ClearyFi helpers) + `sectorapp.js`. **No
  CDN/Tailwind/React.** Does **not** load `app.css`/`company.css`/`sectors.css` or `script.js`.
- **`static/sectorapp.js`** (new) — the whole app: a state store `{view, sectorIdx, subIdx,
  expandedTheme, decompTheme, focalTicker, compareA, compareB, …}` persisting across views; the shell
  (sidebar, sticky header, **control bar** — sector dropdown + meta row + status legend + pin, **no**
  coverage%/sub-industry — and the **view rail**); the Sector view over `/v1/sectors`,
  `/sectors/theme-scores`, `/sectors/{group}` (+ `/spreads`, `/lifecycle`); stub panels for
  Company/Compare/Qualitative. Ports the standardized-shift math from `sectors.js` **minus color**.
- **`static/sectorapp.css`** (new) — paper-terminal styles, **tokens only**, `--positive/--caution/
  --negative` **never referenced**; mobile reflow.
- **`scripts/headless_check.js`** — `sectorapp`, `sectorapp-decomp` (click a score), `sectorapp-stub`
  (click the Qualitative rail).
- Docs: `docs/REDESIGN_SECTOR_APP.md` Phase 1 status.

## Honesty (the brand)

- **No favorability color anywhere** — direction is arrow glyphs (↑ ↓ →) + track position; single
  terracotta accent. (Grep: the only `positive/caution/negative` occurrence is a CSS comment noting
  they're not used.)
- **N/A never 0** — a null delta renders "→ no prior FY"; omitted constituents/bars never zeroed.
- **Deferred themes** (accounting_quality, structure_activity) are honest "not yet scored" tiles.
- **No fabricated** coverage %, sub-industry pills, or filing feed — omitted.
- Provisional banner + "position vs other sectors, not a good/bad or buy verdict" framing; the
  decomposition states equal-weight + the normalization + "excluded, never counted as zero".
- **Qualitative stub**: "Coming — Track 2 · not yet derived from filings … nothing here is
  fabricated."

## How I verified

- Static: no favorability tokens used (only a comment); **no CDN/Tailwind/React** in the page.
- **`pytest` (Docker):** 506 passed, 6 skipped (the `main.py` route change).
- **e2e headless render check** (`docker compose build api` → e2e): **PASS**, `errors=0`. **Eyeballed:**
  - `sectorapp`: the full paper-terminal shell + control bar (59 filers · FY2025 · full peer set +
    status legend; no coverage %/sub-industry) + view rail; scorecard 5 scored (arrow-glyph deltas,
    "no prior FY" on the null case) + 2 "not yet scored"; provisional banner; peer strip (4 sectors,
    focal accent); biggest-shifts (arrows, no color); drill-down "3 of 4" box tiles.
  - `sectorapp-decomp`: score click → decomposition (equal-weight 1/4, single-accent bars, ↑ signs,
    "excluded, never counted as zero").
  - `sectorapp-stub`: Qualitative rail → honest "Coming — Track 2" stub; sector state preserved.

## What QA should probe

- **AC-2** sector dropdown → the whole Sector view re-derives for the picked sector.
- **AC-3** state persistence: switch to Company/Compare stub and back → selected sector + expanded
  theme preserved. Qualitative/Company/Compare stubs carry **no fabricated data**.
- **AC-7** score-click opens decomposition and does **not** expand the tile (stopPropagation);
  tile-body click expands (peer strip + drill-down) without opening the decomposition.
- **AC-8** click a different theme tile → peer strip re-points + drill-down swaps.
- **AC-10** grep + computed styles: no green/amber/red anywhere.
- **AC-13** mobile 390px (control bar, scorecard, rail, decomposition, shifts reflow; no overflow) —
  I did not capture a mobile shot; please drive it.
- **AC-14** `/sectors` still serves the **old** page (route + files untouched).

## Notes

- Full re-render on each state change (data cached in `state`); box-whisker nodes remounted per
  render (lazy fetch guarded).
- Phases 2–4 (Company dot-plots, sector Compare, Qualitative) build on this shell.
