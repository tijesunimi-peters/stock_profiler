import type { ReactNode } from "react";

export interface StatTileRowProps {
  /** `StatTile`s. */
  children: ReactNode;
  className?: string;
}

/** Auto-fitting row for `StatTile`s — wraps to as many columns as the container allows. */
export function StatTileRow({ children, className }: StatTileRowProps) {
  return <div className={["stat-tiles", className].filter(Boolean).join(" ")}>{children}</div>;
}
