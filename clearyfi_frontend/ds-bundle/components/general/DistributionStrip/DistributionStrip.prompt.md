DistributionStrip from @clearyfi/design-prototype. Use via `window.ClearyFiDS.DistributionStrip` (bundle loaded from the root `_ds_bundle.js`).

Where one company sits among its peers — the descriptive core of peer comparison.

Three honesty properties are built in, and all three are load-bearing:

1. **Peers with no comparable value are excluded and counted** in the caption. Silently
   dropping them would overstate how complete the comparison is.
2. **Every mark takes the same fill.** The focal company is distinguished by *shape and
   size*, never by being the only colored dot — position is the message, and a colored mark
   would read as a verdict (STYLE_GUIDE §6, §9.2).
3. **A single comparable filer draws no median and no middle-half band**, and says so — a
   distribution of one is not a distribution.

## Props

```ts
interface DistributionStripProps {
  peers: DistributionPeer[];
  /** The company to distinguish. Omit for an unfocused distribution. */
  focalId?: string | number;
  /** Chart title (mono accent eyebrow). */
  title: string;
  /** Chart-specific caption. The excluded-peer count is appended automatically. */
  caption?: string;
  /** Formats a value for the axis labels. Defaults to one decimal place. */
  format?: (value: number) => string;
  /** Show min / median / max labels under the strip. */
  axisLabels?: boolean;
  width?: number;
  height?: number;
  className?: string;
}
```
