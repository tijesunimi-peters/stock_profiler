Disclosure from @clearyfi/design-prototype. Use via `window.ClearyFiDS.Disclosure` (bundle loaded from the root `_ds_bundle.js`).

The dashed data-notes block that carries coverage limits and the not-advice line
(STYLE_GUIDE §9.6, §9.8).

Every data page ends with one. The point is that a reader can tell the difference between
"we have nothing" and "nothing exists" — which is exactly the distinction a silent empty
state destroys. `STANDARD_DISCLOSURES` holds the canonical strings.

## Props

```ts
interface DisclosureProps {
  /** The coverage/caveat lines. One per limit — do not merge them into a paragraph. */
  items: string[];
  /** Summary label. */
  label?: string;
  open?: boolean;
  className?: string;
}
```
