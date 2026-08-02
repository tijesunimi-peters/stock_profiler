TickerChip from @clearyfi/design-prototype. Use via `window.ClearyFiDS.TickerChip` (bundle loaded from the root `_ds_bundle.js`).

The company identity token — mono, ink fill, paper text (STYLE_GUIDE §6).

Use it wherever a company is named in a compact context: table rows, entity bars, search
results. It is the one place the ink color is used as a fill on a data page.

## Props

```ts
interface TickerChipProps {
  /** The ticker symbol. Rendered upper-case. */
  symbol: string;
  className?: string;
}
```
