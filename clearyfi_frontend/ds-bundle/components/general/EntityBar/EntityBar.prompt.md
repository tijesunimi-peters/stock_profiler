EntityBar from @clearyfi/design-prototype. Use via `window.ClearyFiDS.EntityBar` (bundle loaded from the root `_ds_bundle.js`).

The control bar for a page with a single focal entity — company, manager, sector.

Its job is to answer "what am I looking at, and how old is it?" before the reader scrolls.
An unresolved cell renders a drained `—`; that is deliberate, and it is why this component
takes `null` rather than making the caller decide what to substitute.

## Props

```ts
interface EntityBarProps {
  cells: EntityCell[];
  className?: string;
}
```
