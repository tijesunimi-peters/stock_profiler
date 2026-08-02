StatusLegend from @clearyfi/design-prototype. Use via `window.ClearyFiDS.StatusLegend` (bundle loaded from the root `_ds_bundle.js`).

Explains all four status tokens. **Required near the top of any page that shows metrics**
(STYLE_GUIDE §7) — the vocabulary is a product feature, not decoration, so it gets defined
where the reader meets it rather than in a help page they will never open.

## Props

```ts
interface StatusLegendProps {
  /** Restrict the legend to a subset. Defaults to all four — usually what you want. */
  statuses?: MetricStatus[];
  className?: string;
}
```
