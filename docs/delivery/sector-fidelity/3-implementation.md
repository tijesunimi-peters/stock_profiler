# Implementation — Sector view prototype-fidelity pass

**Frontend-only** (per `2-architecture.md`). Branch: **`sector-fidelity`** (off `master`). Uncommitted.

## Frontend (Senior Frontend Engineer) — DONE

All in `sectorapp.js` + `sectorapp.css`; no backend touch. Matches the prototype's altitude-1 layout;
every synthetic element is an **honest labeled placeholder** (never fabricated); color is confined to
the **scorecard trend-delta chip** (operator decision), biggest-shifts stays neutral like the prototype.

- **`sectorapp.js`**
  - **Control-bar placeholders:** a `.pa-subind` "Sub-industry — to be defined" pill (no SIC-4 names) +
    a `.pa-meta-item.pa-ph` "coverage — to be defined" in the meta row (no "% filed").
  - **F5 — tile shows both:** `expandTheme(theme)` now sets **both** `expandedTheme` **and**
    `decompTheme`; secHead copy updated ("click a tile to open its decomposition, peers & dispersion").
    The score-button `toggleDecomp` (stopPropagation) still collapses just the decomposition.
  - **Scorecard delta color:** `deltaClass(d)` → `pos`/`neg`/`""`; applied to `.pa-tile-delta`. Arrow
    stays inside the chip; the score `<button>` stays neutral `--ink`; null delta uncolored.
  - **Biggest-shifts:** row markup reordered for the prototype flex row; a `.pa-shift-flag` "notable"
    chip when `|z| ≥ 1.5` (a real threshold on the real z). No favorability color on the row.
  - **Drill row:** `renderSectorView` wraps `drilldownHtml(...)` + new `feedPlaceholderHtml()` in a
    `.pa-drill-row`. `feedPlaceholderHtml` = a labeled "What's moving · placeholder" card (Track-2
    feed, to be defined) — **no fabricated items**.
- **`sectorapp.css`**
  - `.pa-app` gains local `--ext/--ext-bg/--ext-border` (self-contained; the page doesn't load
    `app.css`) → the provisional banner, approx chip, and shift flag render with the rust tint.
  - `.pa-decomp-row` → `200px 60px 1fr 52px`. `.pa-shift-row` → **flex** (glyph 14px / name flex:1 /
    flag chip / delta 80px / basis 150px). `.pa-drill-row` → `grid 3fr 2fr` (→ 1fr at 900px).
  - `.pa-tile-delta.pos` → `--positive`/`--positive-wash`; `.neg` → `--negative`/`--negative-wash`
    (the **only** favorability-color usage). Placeholder styles: `.pa-ph`, `.pa-subind`, `.pa-ph-pill`,
    `.pa-ph-tag`, `.pa-feed.pa-ph`, `.pa-feed-body`. Mobile: shift-row wraps, drill-row stacks.
- **`scripts/headless_check.js`** — the `sectorapp-decomp` shot now clicks a **tile** (not the score)
  → captures tile-click-both + the `3fr/2fr` drill row + placeholder feed + colored delta.

### Verified (frontend)

- `node --check` clean; favorability tokens referenced **only** on `.pa-tile-delta.pos/.neg`; no
  hardcoded coverage %/sub-industry name/feed item (grep) — placeholders only.
- **`pytest` 511 passed, 6 skipped** (no regression; frontend-only).
- **e2e headless check PASS, errors=0.** **Eyeballed** `sectorapp-decomp` (expanded tile): sub-industry
  + coverage placeholders; ↑+5 green / ↓-3 red / "→ no prior FY" neutral delta chips with neutral
  score numbers; decomposition + peer strip + `3fr/2fr` drill row with the "What's moving · placeholder"
  card; "NOTABLE" flag chips on shifts; rust-tinted provisional banner.

### For QA to probe

- Computed styles: `.pa-decomp-row` = `200px 60px 1fr 52px`; `.pa-drill-row` ≈ 3:2; `.pa-tile-delta.pos`
  = `--positive` / `.neg` = `--negative`, `.pa-tile-score` neutral; provisional banner background not
  transparent. **Tile click** opens both decomposition + peer strip/drill-down. **No fabricated**
  coverage/sub-industry/feed value or count (all placeholders). Null delta "→ no prior FY", never 0/
  colored. **Mobile 390px** overflow=0 (drill row + shift row stack). Company/Compare/Qualitative +
  `/sectors` still render.
