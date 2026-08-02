import type { MetricStatus } from "../types.js";
export interface StatusLegendProps {
    /** Restrict the legend to a subset. Defaults to all four — usually what you want. */
    statuses?: MetricStatus[];
    className?: string;
}
/**
 * Explains all four status tokens. **Required near the top of any page that shows metrics**
 * (STYLE_GUIDE §7) — the vocabulary is a product feature, not decoration, so it gets defined
 * where the reader meets it rather than in a help page they will never open.
 */
export declare function StatusLegend({ statuses, className }: StatusLegendProps): import("react").JSX.Element;
