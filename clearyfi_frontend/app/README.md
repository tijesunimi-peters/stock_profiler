# ClearyFi prototype app

The SEC Sector Analytics designs, built on the `@clearyfi/design-prototype` component library.

```bash
npm run dev            # http://localhost:5174
npm run app:typecheck
npm run app:build      # -> app-dist/
```

## Every figure is synthetic

Nothing here reads SEC data. Every number comes from `lib/seed.ts` — deterministic-synthetic,
shaped to be plausible and never accurate. A standing banner says so at the top of every page.
Do not port a figure from here into production, and do not use one as a test fixture.

## Plumbing in the API

`data/api.ts` is the only file that knows where data comes from. Every view reads through it and
nothing else, and it is already async, so the swap is:

```ts
sector: (sectorId, sub, period) =>
  fetch(`/v1/sectors/${sectorId}?sub=${sub ?? ""}&period=${period}`).then(r => r.json()),
```

`vite.config.ts` proxies `/v1` to `http://127.0.0.1:8000` (override with `CLEARYFI_API`), so the
endpoints are same-origin in dev and need no CORS. When every surface is repointed,
`data/surfaces.ts`, `data/metrics.ts` and `lib/seed.ts` are deleted; `data/catalog.ts` keeps the
metric definitions (favorability, thresholds, formulas, source forms), which are product
knowledge rather than mock data.

`?slow` on any URL adds 900ms of latency so the loading states can be checked without a network.

## Fidelity to the prototype, per view

The reference is `Sector Analytics.dc.html`. Two different things live in this app and it matters
which one you are looking at:

**Ported** — measured against the prototype's own markup, panel for panel and grid for grid:
the shell, Sector altitude, Qualitative, Filings, Company hub → Overview, Financial history,
Institutional 01–07, Insider activity, Peer-relative, the six Manager views, both Compare
surfaces.

**Built from the written specs** — nothing remains. Every data surface in the app is now
measured against the prototype rather than interpreted from `HANDOFF.md`.

Two deliberate departures from the prototype, both on ported surfaces:

- The Filings view's **form tabs actually filter**. The prototype wires them to a no-op. A
  control that visibly does nothing is worse than no control, so they were made real.
- Every page keeps its **"Data notes & coverage" block**, which the prototype has nowhere. These
  carry the standard caveats the product commits to; dropping them app-wide to match a design
  file is a product decision, not a port detail.

A note on what "ported" has to include, learned the expensive way: a section whose headers,
copy and grids all match can still be a third of the work. The prototype hangs a **source link**
off nearly every panel header and a **`ƒ derived` chip** off every figure it computed, and those
two affordances are the page's whole argument — that a reader can check us. A port that renders
the numbers and drops the links looks finished and isn't.

## Decisions taken, and why

**Routing — split by altitude** (`RECONCILIATION.md` §2, resolution 3). `/sectors` keeps
Sector · Qualitative · Filings; the company hub is `/company/:symbol/:view`, managers are
`/manager/:cik/:view`, and the two comparisons are split into `/compare/sectors` and
`/compare/companies` so one word stops meaning two things. A view is a **path segment**, so Back
and Forward walk views. Selection survives the route change in the query string (`state.tsx`).

**Sector selector — dropdown, not a pill row.** The upload spec (00 §11.1) called for a
persistent pill row; the handoff's changelog (#3) records the prototype converting pills →
dropdown, and the prototype is the stated reference. Eleven sectors wrap past two pill rows,
which is the case that spec itself flags. Sub-industries stay pills.

**Focal mark — a terracotta diamond.** `HANDOFF.md` §5.2 specifies it; the design system's
`DistributionStrip` docstring says the focal mark should be distinguished by shape and size and
never by color. The prototype wins here because terracotta is the app's single *selection*
accent, not a favorability color — it says "this is the one you picked", which is what §3.1
forbids color from doing about *value*. Flagged rather than silently resolved.

**Composite scoring — a labeled placeholder** (00 §9). Percentile of the sector median against
the other sectors, favorability-adjusted, weighted. The weights live in `data/catalog.ts`, every
score carries an APPROX chip, and clicking a score opens its decomposition. Metrics with
`favorability: "none"` (capex intensity, DPO, M&A activity) are **excluded from every composite
and say so** rather than being given an arbitrary direction.

**As-filed vs as-restated** is surfaced on the Financial-history view as an **open spec
question**, stated rather than selectable — there is no point-in-time compute path behind an
as-filed toggle, and offering one would fabricate rigor.

## Layout

```
app/
  charts/     d3 v7 builders + the kernel (see below)
  data/       catalog (metric defs) · metrics (the engine) · surfaces (payloads) · api (the seam)
  lib/        seed (synthetic) · format · useApi
  pages/      sectors/ · company/ · manager/ · compare/ · planned · not-found
  ui/         Shell (page frame) · SectorControlBar · primitives (the non-d3 indicators)
```

## The three chart rules

`charts/kernel.ts` implements them; every builder inherits them. All three were bugs before
they were rules:

1. **Entering marks get their final geometry on enter**; only updates animate. Otherwise every
   newly-mounted chart flies in from the origin.
2. **When the page is hidden, draw unanimated and `d3.timerFlush()`.** A throttled frame loop
   never ticks a transition, so marks would sit at their enter state until the tab regained
   focus.
3. **Charts measure their container** (`ResizeObserver`) and use the real pixel width as the
   viewBox width. `preserveAspectRatio:none` on a fixed viewBox stretches circles into ellipses.

Label placement lives there too: edge anchoring via real `getComputedTextLength()`, and
candidate-offset placement for scatter labels that **drops** a label rather than overlapping it.

The §5a indicators (proportion bars, stacked bars, presence matrix, pair bars, ladders) stay
**DOM**, in `ui/primitives.tsx` — they reflow, wrap and inherit tokens for free, and porting
them to d3 would be a regression.

## Not built yet

- Chart **expand** overlays (large-format re-author at overlay width).
- `upsetChart` and the peer adjacency `matrixChart`.
- Small-multiple sparkline grid on the manager views.
- The global search (⌘K) is the design system's placeholder — it is inert on purpose.
