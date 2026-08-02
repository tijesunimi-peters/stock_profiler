import type { ReactNode } from "react";
export interface MetricTileGridProps {
    /** `MetricTile`s. */
    children: ReactNode;
    className?: string;
}
/**
 * The hairline-ruled grid `MetricTile`s sit in — one bordered block rather than separate
 * floating cards, which is what makes a dense snapshot read as a single instrument panel.
 */
export declare function MetricTileGrid({ children, className }: MetricTileGridProps): import("react").JSX.Element;
