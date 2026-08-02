MetricCardGrid from @clearyfi/design-prototype. Use via `window.ClearyFiDS.MetricCardGrid` (bundle loaded from the root `_ds_bundle.js`).

The responsive grid metric cards live in — fluid down to one column, capped at four across
so a wide page never strings cards into an unreadable row (STYLE_GUIDE §3).

Always use it rather than a bare flex row: the `gap`-based rhythm is what keeps card grids
aligned across different pages.

## Props

```ts
interface MetricCardGridProps {
  /** `MetricCard`s. */
  children: React.ReactNode;
  className?: string;
}
```
