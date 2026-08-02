ViewRail from @clearyfi/design-prototype. Use via `window.ClearyFiDS.ViewRail` (bundle loaded from the root `_ds_bundle.js`).

The vertical view rail plus its viewport — used by any page with two or more views
(STYLE_GUIDE §5).

A view is a **path segment** (`/company/AAPL/statements`), not a client-side tab, so Back
and Forward walk views the way a reader expects. One-view pages get no rail.

## Props

```ts
interface ViewRailProps {
  views: ViewRailItem[];
  /** The active view's `value`. */
  active: string;
  onChange?: (value: string) => void;
  /** The view's content. */
  children: React.ReactNode;
  className?: string;
}
```
