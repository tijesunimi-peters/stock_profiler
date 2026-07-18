# Vendored front-end libraries

Self-hosted so data pages never CDN-load a chart library (STYLE_GUIDE §6/§10; the
standalone infographic template is the only page that still imports Plot from a CDN).

| File | Package | Version | License |
|---|---|---|---|
| `d3.min.js` | `d3` | 7.9.0 | ISC |
| `plot.umd.min.js` | `@observablehq/plot` | 0.6.17 | ISC |
| `us-states.geojson` | US state boundaries (50 + DC), from **us-atlas** `states-10m` (US Census TIGER, topology-validated TopoJSON) | us-atlas@3 | Public domain (US Census) |

`us-states.geojson` is a `FeatureCollection` of 50 states + DC; each feature carries only
`properties.name` (full state name), which `ClearyFi.holderGeographyChart` joins on. It's
fetched same-origin at chart-build time and rendered with Plot's built-in `albers-usa`
projection.

**Why us-atlas (not a hand-rolled states file):** TopoJSON stores shared borders as arcs, so
it is topology-validated — degenerate/zero-area rings can't slip in. An earlier
PublicaMundi-derived file had a malformed Virginia ring (4 collinear points) that
`albers-usa` projected across the entire map as a solid fill; TopoJSON eliminates that class
of bug. Regenerated from `us-atlas@3` via `topojson-client` (feature extraction) +
`topojson-simplify` and 3-decimal coordinate rounding to keep the assets small, then
validated: every feature projects to a sane bounding box, no degenerate rings, all 51 names
matching `STATE_CODE_TO_NAME`.

Load order matters: the Plot UMD build does **not** bundle d3 — it reads the global
`d3`, so `d3.min.js` must be included first. Together they expose `window.Plot`.

To upgrade, fetch the same artifacts from jsDelivr, e.g.
`https://cdn.jsdelivr.net/npm/@observablehq/plot@<ver>/dist/plot.umd.min.js` and
`https://cdn.jsdelivr.net/npm/d3@<ver>/dist/d3.min.js`, keeping the two versions
compatible (Plot documents its required d3 major).
