# Building with ClearyFi

A warm "paper terminal" system for SEC filings data: Hanken Grotesk for text, IBM Plex Mono for
every number and label, warm paper surfaces, one terracotta accent.

## Setup — the wrapper is not optional

Import the stylesheet once at the app root, then wrap your page in `.cf-root`:

```jsx
import '@clearyfi/design-prototype/styles.css';

<div className="cf-root">
  <div className="page">{/* your page */}</div>
</div>
```

`.cf-root` sets the paper background (`--bg-page`), ink colour and `--font-sans`. **Without it the
page renders on default white in the browser's default font** while the components themselves still
look styled — a mismatch that is easy to miss. `AppShell` applies `.cf-root` itself, so wrap only
when you are NOT using `AppShell`. There is no provider and no theme context: the tokens live on
`:root` in the stylesheet, so any component works standalone once the CSS is loaded.

## Styling idiom — tokens, not new colours

Components carry their own class names and need no styling from you. For your own layout glue,
use the CSS custom properties; never hard-code a hex value, and never restyle a component's
internals.

| Family | Tokens |
|---|---|
| Surfaces | `--bg-page` `--bg-card` `--bg-tint` `--bg-badge` `--panel-bg` |
| Ink | `--ink` `--ink-body` `--ink-muted` `--ink-soft` `--mono-muted` |
| Accent | `--accent` `--accent-hover` `--accent-ink` `--accent-wash` `--accent-wash-border` |
| Lines | `--border` `--border-strong` `--border-tint` `--border-tint-rule` `--rule` |
| Direction | `--positive` `--positive-wash` `--caution` `--caution-wash` `--negative` `--negative-wash` |
| Type | `--font-sans` `--font-mono` |
| Depth | `--shadow` `--shadow-soft` |

There is no spacing scale — use plain pixel values for your own layout gaps.

Direction tokens describe **movement, not judgement** — never use them to imply good/bad.

These utility classes are safe to use directly:

| Class | Use |
|---|---|
| `.page` | page container — max-width and padding |
| `.eyebrow` | mono accent kicker above a title |
| `.lede` | intro paragraph under a rule |
| `.micro` | mono uppercase micro-label |
| `.num` | mono tabular numerals — use for every figure |
| `.rule-double` | hairline rule under a header |
| `.card-grid` | responsive auto-fill card grid |
| `.legend` | legend row on tint |

## The honesty rules — these outrank aesthetics

This system exists to make filings data checkable. Three rules are load-bearing:

1. **Four statuses, never a fifth**: `ok` · `approximate` · `na` · `nm`. Pass them to `StatusChip`
   or a `MetricValue.status`.
2. **Never render a missing value as `0`, blank, or a guess.** An `na`/`nm` metric gets `value:
   null` and renders a drained token. `StatTile` and `StatementTable` rows take `drained`.
3. **Keep the source column.** `StatementTable` rows carry `sourceTag` plus `isExtension`, badged
   via `SourceBadge`. Showing which tag a number came from is the point; do not drop it for width.

## Where the truth lives

- `_ds/<folder>/styles.css` and its imports — the real tokens and classes.
- `components/<group>/<Name>/<Name>.prompt.md` — per-component usage.
- `components/<group>/<Name>/<Name>.d.ts` — the prop contract. `MetricValue` and `StatementRow`
  are referenced but defined in the package's `types` module, not inlined.

## Idiomatic example

```jsx
<div className="cf-root">
  <div className="page">
    <Masthead
      title="Apple Inc."
      subtitle="NASDAQ: AAPL · CIK 0000320193"
      meta={['As of 2024-11-01']}
    />
    <SectionHead n="01" title="Profitability" subtitle="Trailing twelve months." />
    <MetricCardGrid>
      <MetricCard
        formula="Net income ÷ Total revenue"
        metric={{ label: 'Net Margin', value: 0.2397, unit: 'ratio', basis: 'TTM', status: 'ok' }}
      />
      <MetricCard
        metric={{ label: 'Cost of Debt', value: null, basis: 'TTM', status: 'na',
                  reason: 'This filer carries no long-term debt.' }}
      />
    </MetricCardGrid>
    <p className="micro" style={{ marginTop: 16 }}>
      Figures as reported, in USD.
    </p>
  </div>
</div>
```
