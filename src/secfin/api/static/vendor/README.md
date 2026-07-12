# Vendored front-end libraries

Self-hosted so data pages never CDN-load a chart library (STYLE_GUIDE §6/§10; the
standalone infographic template is the only page that still imports Plot from a CDN).

| File | Package | Version | License |
|---|---|---|---|
| `d3.min.js` | `d3` | 7.9.0 | ISC |
| `plot.umd.min.js` | `@observablehq/plot` | 0.6.17 | ISC |

Load order matters: the Plot UMD build does **not** bundle d3 — it reads the global
`d3`, so `d3.min.js` must be included first. Together they expose `window.Plot`.

To upgrade, fetch the same artifacts from jsDelivr, e.g.
`https://cdn.jsdelivr.net/npm/@observablehq/plot@<ver>/dist/plot.umd.min.js` and
`https://cdn.jsdelivr.net/npm/d3@<ver>/dist/d3.min.js`, keeping the two versions
compatible (Plot documents its required d3 major).
