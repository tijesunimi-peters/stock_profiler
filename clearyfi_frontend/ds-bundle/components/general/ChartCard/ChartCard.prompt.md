ChartCard from @clearyfi/design-prototype. Use via `window.ClearyFiDS.ChartCard` (bundle loaded from the root `_ds_bundle.js`).

The shared chrome every chart wraps itself in (STYLE_GUIDE §6) — one visual dialect per page,
so a chart never looks like a foreign widget dropped onto the paper.

The body scrolls horizontally rather than distorting or overflowing, and the caption slot is
not optional in spirit: a chart that cannot say what it excludes is a chart that misleads.

## Props

```ts
interface ChartCardProps {
  /** Mono accent eyebrow above the plot. */
  title: string;
  /** The chart itself — an SVG, or any node. */
  children: React.ReactNode;
  /** The honesty caption. Carry what is **specific to this chart**; a standing caveat (e.g. "reported 13F long positions only */
  caption?: string;
  /** A second, smaller line for a secondary note. */
  note?: string;
  className?: string;
}
```
