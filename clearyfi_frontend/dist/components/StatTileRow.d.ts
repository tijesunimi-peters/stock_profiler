import type { ReactNode } from "react";
export interface StatTileRowProps {
    /** `StatTile`s. */
    children: ReactNode;
    className?: string;
}
/** Auto-fitting row for `StatTile`s — wraps to as many columns as the container allows. */
export declare function StatTileRow({ children, className }: StatTileRowProps): import("react").JSX.Element;
