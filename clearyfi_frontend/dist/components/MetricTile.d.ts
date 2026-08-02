import type { MetricValue } from "../types.js";
export interface MetricTileProps {
    metric: MetricValue;
    /** Show the value with the dashed underline that cues an expandable drawer. */
    expandable?: boolean;
    /** Period-over-period move, pre-formatted, e.g. `+2.1pp vs FY2023`. */
    move?: string;
    className?: string;
}
/**
 * The compact snapshot tile used on a company or sector overview — denser than `MetricCard`,
 * for a grid of many figures read at a glance.
 *
 * A drained tile keeps its value slot and its status: `N/A` in muted mono at a smaller size,
 * never a blank cell. An empty-looking tile reads as "we forgot"; a drained one reads as
 * "this does not apply here", and only the second is true.
 */
export declare function MetricTile({ metric, expandable, move, className }: MetricTileProps): import("react").JSX.Element;
