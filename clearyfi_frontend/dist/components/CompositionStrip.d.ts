export interface CompositionSegment {
    /** Band label, e.g. `Top 1` or `Vanguard`. */
    label: string;
    /** Share of the whole, 0–1. */
    share: number;
    /** Fill. Defaults walk a single-hue terracotta ramp — bands are parts of one whole. */
    color?: string;
}
export interface CompositionStripProps {
    segments: CompositionSegment[];
    /**
     * Minimum share a band needs before its label sits *inside* it. Narrower bands move their
     * label to the legend below rather than being clipped (STYLE_GUIDE §12.1).
     */
    insideLabelMin?: number;
    className?: string;
}
/**
 * A 100%-stacked part-to-whole bar — concentration at a glance (top 1 / top 2–5 / top 6–10 /
 * other).
 *
 * Labels sit inside a band only when it is wide enough to hold them, and drop to the legend
 * otherwise; a clipped label is worse than an outside one. Bands share a single-hue ramp
 * because they are parts of one magnitude — a categorical palette here would imply the bands
 * are unrelated entities.
 */
export declare function CompositionStrip({ segments, insideLabelMin, className, }: CompositionStripProps): import("react").JSX.Element;
