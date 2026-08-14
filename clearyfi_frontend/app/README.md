# ClearyFi prototype app

The SEC Sector Analytics designs, built on the `@clearyfi/design-prototype` component library.

```bash
npm run dev            # http://localhost:5174
npm run app:typecheck
npm run app:build      # -> app-dist/
```

## Which figures are synthetic, and where the line is

**Not all of them any more.** `PROVENANCE.syntheticSurfaces` in `data/api.ts` names the surfaces
still running on `lib/seed.ts` — deterministic-synthetic, shaped to be plausible and never
accurate — and `ui/SyntheticBanner` renders from that list. Removing a name is what removes the
banner from that surface; when the list empties the banner is gone, not merely quiet.

Plumbed onto real endpoints so far: Company hub → Overview (sections 01, 02, 03, 05, 06, 08),
Institutional, Insider activity, Peer-relative, and the **Sector altitude**. Still synthetic:
financial history, qualitative, filings, manager, compare.

Do not port a synthetic figure into production, and do not use one as a test fixture.

## Plumbing in the API

`data/api.ts` is the only file that knows where data comes from. Every view reads through it and
nothing else, and it is already async, so the swap is a body change. The sector altitude, done:

```ts
sectorOverview: async (group, fiscalYear) => {
  const [scores, dupont, spreads, insider, geo] = await Promise.all([...]);
  return { themes: toSectorThemes(scores, group), spreads: toSectorSpreads(spreads), ... };
},
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

Deliberate departures from the prototype, all on ported surfaces:

- The Filings view's **form tabs actually filter**. The prototype wires them to a no-op. A
  control that visibly does nothing is worse than no control, so they were made real.
- The Sector altitude **lost three panels' worth of prototype figures that the data cannot
  support**, and each is now an honest empty state or a different measure. Two of seven themes
  come back `scored: false`; the insider card's "1.4× net buy/sell" is not computable (a buy/sell
  ratio is unbounded and undefined where insiders sold and never bought, which is the ordinary
  case — group 36 is $119M bought against $3.78B sold), so it shows the net dollar figure; the
  geographic mix has no ingest behind it and says so. "Biggest shifts" is now the per-theme move
  against the prior fiscal year, which is the only shift this project computes.
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
which is the case that spec itself flags — and the real list is **59**, so the dropdown was the
right call for a reason nobody knew at the time.

**Sectors are SIC major groups** (operator ruling, 2026-08-14). The prototype navigated eleven
hand-named sectors — Semiconductors, Software, Biotech, Pharma. None of them exists in the filing
record; what exists is the SIC code the SEC assigns each filer, and every materialized table in
this project (`metric_ranks`, `metric_distributions`, `sector_theme_scores`, `sector_dupont`,
`sector_insider_flow`) is keyed on its 2-digit major group. So the nav names what the data is
grouped by, and the labels come from the API's `group_label`.

The alternative was a curated vocabulary over 4-digit code sets — precise names, but the top 20
codes cover only ~51% of profiled filers and the single largest is `6770 Blank Checks` at 10%, so
half the market lands in "Other" and the mapping is one we would own and have to defend. The cost
of the ruling is stated on the page rather than hidden: SIC 2-digit puts pharmaceuticals and
biotech in one group (28), and semiconductors are about a third of group 36.

**No sub-industry.** The prototype's six sub-industry pills and their filer counts (14, 9, 17…)
had no source, and at 2-digit no finer peer set is materialized. The control is gone rather than
present-and-inert. `Selection.subIdx` survives only so an old `?sub=` link still parses.

**Focal mark — a terracotta diamond.** `HANDOFF.md` §5.2 specifies it; the design system's
`DistributionStrip` docstring says the focal mark should be distinguished by shape and size and
never by color. The prototype wins here because terracotta is the app's single *selection*
accent, not a favorability color — it says "this is the one you picked", which is what §3.1
forbids color from doing about *value*. Flagged rather than silently resolved.

**Composite scoring — now the server's, and it says so in the server's words.** `analytical/
sector_theme_scores.py` computes it: the equal-weight mean of each theme's constituent metrics'
z-scored, favourability-oriented per-sector medians, mapped to 0–100 as `50 + 15z` clamped to
[0, 100]. The page prints that sentence verbatim from the payload's `normalization` field rather
than paraphrasing it, and clicking a score still opens its decomposition — now showing the real
equal weights (1/n) and each constituent's oriented z, not the prototype's 0.25/0.30.

Only SCALE-FREE metrics are scored; raw dollar levels are excluded server-side because a
cross-sector z of "free cash flow" would measure sector size. Two of the seven themes are not
scored at all, and the page renders them unscored with the API's reason — asked, and not
answerable — rather than dropping them to a tidy five.

**As-filed vs as-restated** is surfaced on the Financial-history view as an **open spec
question**, stated rather than selectable — there is no point-in-time compute path behind an
as-filed toggle, and offering one would fabricate rigor.

## Layout

```
app/
  charts/     d3 v7 builders + the kernel (see below)
  data/       catalog (metric defs) · metrics (the engine) · surfaces (payloads) · api (the seam)
  lib/        seed (synthetic) · format · useApi · useSectorRoster (the SIC vocabulary, cached)
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

## The global search is live — and it is the only thing on these pages that is

The topbar typeahead (⌘K) is ported from the static UI's `suggest.js` and reads
`/v1/companies/suggest`, so it resolves against the **real** ticker→CIK map. Everything else on
these surfaces is synthetic. A ticker the search offers is therefore one the API genuinely knows
about, while the figures you land on for it are generated — worth remembering when the two seem
to disagree.

`SearchSuggest` never fetches. It takes `onSearch`/`onPick`, and `AppShell` renders the input
**disabled** when a caller supplies neither — a box that accepts typing and never answers is a
worse failure than a visibly dead one.
