# ClearyFiDS (@clearyfi/design-prototype@0.1.0)

This design system is the published @clearyfi/design-prototype React library, bundled as a single
browser global. All 27 components are the real upstream code.

## Where things are

- `_ds_bundle.js` — the whole-DS bundle at the project root; loads every component to `window.ClearyFiDS`. First line is a `/* @ds-bundle: … */` metadata header.
- `styles.css` — the single stylesheet entry: it `@import`s the tokens, fonts, and component styles (`_ds_bundle.css`). Link this one file.
- `components/<group>/<Name>/<Name>.prompt.md` (example JSX + variants), `<Name>.d.ts` (types), `<Name>.html` (variant grid).
- `tokens/*.css` — CSS custom properties, names verbatim from upstream.
- `fonts/` — `@font-face` files + `fonts.css` (when the package ships fonts).

For a specific component, `read_file("components/<group>/<Name>/<Name>.prompt.md")`.

## Loading

Add these two lines to your page once (React must be on the page first):

```html
<link rel="stylesheet" href="styles.css">
<script src="_ds_bundle.js"></script>
```

Components are then available at `window.ClearyFiDS.*`. Mount into a dedicated child node (e.g. `<div id="ds-root">`), not the host page's own React root, so the two trees don't collide:

```jsx
const { AppFooter } = window.ClearyFiDS;
ReactDOM.createRoot(document.getElementById('ds-root')).render(<AppFooter />);
```

## Tokens

43 CSS custom properties from @clearyfi/design-prototype. Names are
preserved verbatim from upstream. They are declared inside `_ds_bundle.css` (this DS ships one compiled stylesheet rather than separate token files).

- **color** (10): `--bg-page`, `--bg-card`, `--bg-tint`, …
- **typography** (2): `--font-sans`, `--font-mono`
- **shadow** (2): `--shadow-soft`, `--shadow`
- **other** (29): `--ink`, `--ink-body`, `--ink-muted`, …

## Components

### general
- `AppFooter` — The page footer: a thin rule, mono accent links to real routes, and the standing tagline.
- `AppShell` — The one product shell every data page lives in (STYLE_GUIDE 4.2, 5): a fixed subject
- `Button` — The action control, in the three shipped treatments (STYLE_GUIDE 4.64.7).
- `ChartCard` — The shared chrome every chart wraps itself in (STYLE_GUIDE 6)  one visual dialect per page,
- `CompositionStrip` — A 100-stacked part-to-whole bar  concentration at a glance (top 1 / top 25 / top 610 /
- `Disclosure` — The dashed data-notes block that carries coverage limits and the not-advice line
- `DistributionStrip` — Where one company sits among its peers  the descriptive core of peer comparison.
- `EntityBar` — The control bar for a page with a single focal entity  company, manager, sector.
- `FavorabilityDelta` — The scoped favorability chip for a sector score's direction (STYLE_GUIDE 1).
- `Masthead` — The page header (STYLE_GUIDE 4.3): title  right-aligned mono meta  a single hairline rule
- `MetricCard` — The primary metric surface (STYLE_GUIDE 6): name + status chip, big mono value with its
- `MetricCardGrid` — The responsive grid metric cards live in  fluid down to one column, capped at four across
- `MetricTile` — The compact snapshot tile used on a company or sector overview  denser than MetricCard,
- `MetricTileGrid` — The hairline-ruled grid MetricTiles sit in  one bordered block rather than separate
- `Provenance` — The Show your work disclosure that any computed figure must carry (STYLE_GUIDE 8).
- `SectionHead` — The numbered section header (STYLE_GUIDE 4.5): mono accent number + Hanken 800 name over a
- `SectorScoreTile` — A sector's composite theme score (sector overview scorecard).
- `SegmentedControl` — The period / view switcher (STYLE_GUIDE 4.6): 1.5px border, 8px radius, active segment
- `SourceBadge` — The per-row audit badge that names where a number came from (STYLE_GUIDE 1, 6).
- `StateBlock` — The four shared non-data states (STYLE_GUIDE 6).
- `StatementTable` — The audit-grade statement table (STYLE_GUIDE 6): mono tabular amounts, a source-tag column
- `StatTile` — A compact single-figure tile for concentration and coverage stats  the summary numbers that
- `StatTileRow` — Auto-fitting row for StatTiles  wraps to as many columns as the container allows.
- `StatusChip` — The status marker that rides alongside every metric and derived value (STYLE_GUIDE 7).
- `StatusLegend` — Explains all four status tokens. Required near the top of any page that shows metrics
- `TickerChip` — The company identity token  mono, ink fill, paper text (STYLE_GUIDE 6).
- `ViewRail` — The vertical view rail plus its viewport  used by any page with two or more views
