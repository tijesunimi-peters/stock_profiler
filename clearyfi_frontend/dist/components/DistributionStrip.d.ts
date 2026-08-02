export interface DistributionPeer {
    id: string | number;
    /** Company name, shown on hover and on the focal mark. */
    label: string;
    /** The comparable value, or `null` when this peer has none. Nulls are excluded and counted. */
    value: number | null;
}
export interface DistributionStripProps {
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
/**
 * Where one company sits among its peers — the descriptive core of peer comparison.
 *
 * Three honesty properties are built in, and all three are load-bearing:
 *
 * 1. **Peers with no comparable value are excluded and counted** in the caption. Silently
 *    dropping them would overstate how complete the comparison is.
 * 2. **Every mark takes the same fill.** The focal company is distinguished by *shape and
 *    size*, never by being the only colored dot — position is the message, and a colored mark
 *    would read as a verdict (STYLE_GUIDE §6, §9.2).
 * 3. **A single comparable filer draws no median and no middle-half band**, and says so — a
 *    distribution of one is not a distribution.
 */
export declare function DistributionStrip({ peers, focalId, title, caption, format, axisLabels, width, height, className, }: DistributionStripProps): import("react").JSX.Element;
