CompositionStrip from @clearyfi/design-prototype. Use via `window.ClearyFiDS.CompositionStrip` (bundle loaded from the root `_ds_bundle.js`).

A 100%-stacked part-to-whole bar — concentration at a glance (top 1 / top 2–5 / top 6–10 /
other).

Labels sit inside a band only when it is wide enough to hold them, and drop to the legend
otherwise; a clipped label is worse than an outside one. Bands share a single-hue ramp
because they are parts of one magnitude — a categorical palette here would imply the bands
are unrelated entities.

## Props

```ts
interface CompositionStripProps {
  segments: CompositionSegment[];
  /** Minimum share a band needs before its label sits *inside* it. Narrower bands move their label to the legend below rather */
  insideLabelMin?: number;
  className?: string;
}
```
