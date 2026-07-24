# Implementation — v2 P0 (shell) + P1 (Sector view re-arch)

Stage 3 (Senior Frontend Engineer). Task slug: `sector-v2`. Branch: `sector-v2` (off `master`;
`sector-parity`/M1 abandoned, not merged). **Frontend-only** — `sectorapp.js` + `sectorapp.css` +
`scripts/headless_check.js`. No backend, no new endpoints (every block reuses the shipped data or is an
honest placeholder).

## What changed & why

### P0 — Shell v2 (`sectorapp.js` `renderApp` + `rightRailHtml`; `sectorapp.css`)
- **960px content cap:** `.pa-viewport` gets `max-width: 960px` (`flex:1; min-width:0` still lets it
  shrink below that when the rail + right rail are present — no overflow).
- **Sticky 262px right rail — Sector view only.** `.pa-body` now has a third child,
  `state.view === "sector" ? rightRailHtml() : ""`. New `rightRailHtml()` renders three cards:
  1. **Sector snapshot** — the sector name + k/v rows: `Filers` (real `peer_count`), `Period` (real
     `FY{yr}`), `Coverage` → **honest placeholder** ("to be defined", italic-muted), `Focused theme`
     (the current tile focus label).
  2. **"What's moving" [Track 2]** — an **honest placeholder** feed ("Filing events · walled off from
     metrics … we don't aggregate yet. To be defined; nothing here is fabricated."). This is the
     prototype's filing-event feed, pulled **out of the Sector flow** into the rail. **No fabricated
     events.**
  3. **How to read this** — the honesty note ("a position vs other sectors, not a good/bad or buy
     verdict") + a `/methodology` link.
- Right rail is **hidden below 1240px** (`@media (max-width:1240px){ .pa-rrail{display:none} }`) — it's
  supplementary; nothing in it is unavailable elsewhere.

### P1 — Sector view re-arch into three numbered scopes (`renderSectorView`)
Replaced the v1 flat stack (scorecard → provisional → decomp → peer strip → shifts → 3fr/2fr drill+feed
row) with three scopes via a new `scopeHead(num, title, sub)` helper:
- **01 Health scorecard** — `scorecardHtml(entry)` (**F4 delta color kept**: `.pa-tile-delta.pos/.neg`)
  + provisional banner + `peerStripHtml()` ("Where this sector sits") + **`geoInsiderRowHtml()`**: a
  `3fr 2fr` row of `geoPlaceholderHtml()` (Geographic revenue mix · ASC 280 — Track-1 not ingested) +
  `insiderPlaceholderHtml()` (Insider flow · Forms 3/4/5 — Track-1 per-CIK only, not sector-aggregated).
  Both **honest placeholders**, no fabricated segment/%/ratio/net figure.
- **02 What drives it** — the **decomposition full-width, open by default** (`ensureDecompTheme()`
  targets the focused/first-scored theme on entry) + `shiftsHtml(g)` ("Biggest shifts").
- **03 Distribution** — new `distributionHtml(entry, g)`: one card with a **`[This theme] / [All
  metrics]` segmented toggle** (`state.drillScope`) over the dispersion box-whiskers. `distMetrics()`
  picks the focused theme's constituents (theme) or every metric with a peer distribution (all);
  `mountDistribution()` paints `P.boxWhiskerChart` per matched metric. Honest empty/loading states
  preserved; the "showing X of Y constituents · others omitted, not zero" cover line kept.

Removed from the Sector flow: the v1 `.pa-drill-row` drill+feed row (feed → right rail; drill →
scope 03) and the M1 DuPont/ROE/lifecycle (never present on this base — dropped per v2 decision 2).
`drilldownHtml`/`mountDrilldown`/`feedPlaceholderHtml` deleted; their box-painting logic lives in
`distributionHtml`/`mountDistribution`.

### Wiring (`wireSectorView`)
Kept the tile-click (`expandTheme` → focuses decomp + peer strip + distribution) and score-button
(`toggleDecomp`) handlers; added the **scope toggle** handler (`.pa-scope-btn[data-scope]` →
`state.drillScope` + `renderApp`).

### CSS (`sectorapp.css`)
`.pa-rrail` + card/snapshot/feed/how-to-read styles; `.pa-dist-head`/`.pa-scope-toggle`/`.pa-scope-btn`
(active = `--accent` fill, the single accent — **no favorability color**); `.pa-geo-row` reuses the
`3fr 2fr` grid; `.pa-geo`/`.pa-insider` placeholder cards (dashed, muted `.pa-ph-body`). Media queries:
right rail hidden ≤1240; geo row + drill row stack ≤900; existing 560 reflows intact.

### e2e (`scripts/headless_check.js`)
Updated the `sectorapp`/`sectorapp-decomp` comments; added **`sectorapp-dist-all`** (clicks the [All
metrics] scope toggle). The `sectorapp` shot at the 1280px default viewport shows the right rail.

## Honesty
- **F4 color kept** (operator deviation, recorded in the v2 roadmap) — scoped to the scorecard delta
  chip, always paired with the arrow glyph; score/value stay neutral. Nowhere else uses favorability
  color (distribution/geo/insider/peer strip all neutral; scope-toggle active state is the accent, an
  identity not a verdict).
- Geo mix, insider flow, and the "What's moving" feed are **honest placeholders** — layout only, every
  data cell an unmistakable "to be defined / no figures shown", **never a fabricated figure**.
- N/A never 0 (the distribution cover keeps "omitted, not zero"); scores remain provisional positions.

## How to verify
- `docker compose --profile test run --rm test` — `pytest` (no backend change; must stay green).
- `docker compose build api` then `docker compose --profile e2e up --abort-on-container-exit
  --exit-code-from e2e`. **Eyeball:** `sectorapp` (3 scopes + right rail + geo/insider placeholders +
  full-width open decomp), `sectorapp-decomp` (tile re-points focus + F4 color), `sectorapp-dist-all`
  (Distribution flipped to All metrics), and confirm Company/Compare/Qualitative + old `/sectors` still
  render.

## For QA to probe
- Right rail present ≥1240px, hidden below; snapshot real values + coverage placeholder.
- 01 geo/insider placeholders carry no digit that reads as data; peer strip under the grid.
- 02 decomp open on load (focused theme); tile click re-points it (not a second panel).
- 03 toggle: This theme → constituents; All metrics → every metric; honest empty when sparse.
- F4 color present + arrow-paired; nothing else colored by favorability.
- Mobile 390px: right rail gone, scopes + geo row stack, no horizontal overflow.
- **INTERACTIVE change → operator hands-on manual UI verification** (per the qa-tester manual gate).
