MetricTileGrid from @clearyfi/design-prototype. Use via `window.ClearyFiDS.MetricTileGrid` (bundle loaded from the root `_ds_bundle.js`).

The hairline-ruled grid `MetricTile`s sit in — one bordered block rather than separate
floating cards, which is what makes a dense snapshot read as a single instrument panel.

## Props

```ts
interface MetricTileGridProps {
  /** `MetricTile`s. */
  children: React.ReactNode;
  className?: string;
}
```
