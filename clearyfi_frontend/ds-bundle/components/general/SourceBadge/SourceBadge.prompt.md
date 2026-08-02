SourceBadge from @clearyfi/design-prototype. Use via `window.ClearyFiDS.SourceBadge` (bundle loaded from the root `_ds_bundle.js`).

The per-row audit badge that names where a number came from (STYLE_GUIDE §1, §6).

Every canonical fact records its source tag and whether it was a company extension — this
badge is how that reaches the reader, and it is what makes a statement table auditable
rather than merely tidy.

## Props

```ts
interface SourceBadgeProps {
  /** `gaap` for a standard US-GAAP tag; `ext` for a company **extension** tag, which is the filer's own invention and therefo */
  kind: "gaap" | "ext";
  /** The source tag itself, e.g. `Revenues` or `AppleSegmentRevenue`. Defaults to the kind. */
  label?: string;
  className?: string;
}
```
