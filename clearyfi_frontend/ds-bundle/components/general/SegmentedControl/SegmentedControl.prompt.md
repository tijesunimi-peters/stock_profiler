SegmentedControl from @clearyfi/design-prototype. Use via `window.ClearyFiDS.SegmentedControl` (bundle loaded from the root `_ds_bundle.js`).

The period / view switcher (STYLE_GUIDE §4.6): 1.5px border, 8px radius, active segment
filled terracotta with white text.

Use it for a small set of mutually exclusive views — fiscal period, statement type, window
length. Beyond about five options it stops scanning well; use the view rail instead.

## Props

```ts
interface SegmentedControlProps {
  options: SegmentedControlOption[];
  /** The currently active option's `value`. */
  value: string;
  onChange?: (value: string) => void;
  className?: string;
}
```
