StatusChip from @clearyfi/design-prototype. Use via `window.ClearyFiDS.StatusChip` (bundle loaded from the root `_ds_bundle.js`).

The status marker that rides alongside every metric and derived value (STYLE_GUIDE §7).

Distinguished by **glyph + label + border style**, never by color alone — the accent and the
flag color are both warm, so color-only status would be unreadable as well as inaccessible.
Solid border = `na` (hard structural), dashed = `nm` (soft judgment); keep that distinction.

## Props

```ts
interface StatusChipProps {
  /** Which of the four statuses this value carries. */
  status: "ok" | "approximate" | "na" | "nm";
  /** Hide the text tag and show only the glyph. Use sparingly — the label is half the signal. */
  glyphOnly?: boolean;
  className?: string;
}
```
