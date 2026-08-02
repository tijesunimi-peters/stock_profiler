StatTile from @clearyfi/design-prototype. Use via `window.ClearyFiDS.StatTile` (bundle loaded from the root `_ds_bundle.js`).

A compact single-figure tile for concentration and coverage stats — the summary numbers that
sit above a chart rather than inside it.

Lighter than `MetricCard`: no status chip, no provenance. Use it for descriptive counts and
shares; anything **derived** needs the full card so it can show its work.

## Props

```ts
interface StatTileProps {
  /** Mono uppercase micro-label. */
  label: string;
  /** The figure. Pass a pre-formatted string — the tile does not invent formatting. */
  value: string;
  /** Optional one-line qualifier under the value. */
  note?: string;
  /** Render the value drained, for a figure that is structurally unavailable. Use this rather than passing `0` or `—` for som */
  drained?: boolean;
  className?: string;
}
```

## Related

`StatTileRow`
