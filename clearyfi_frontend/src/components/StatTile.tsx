export interface StatTileProps {
  /** Mono uppercase micro-label. */
  label: string;
  /** The figure. Pass a pre-formatted string — the tile does not invent formatting. */
  value: string;
  /** Optional one-line qualifier under the value. */
  note?: string;
  /**
   * Render the value drained, for a figure that is structurally unavailable. Use this rather
   * than passing `0` or `—` for something we cannot source (STYLE_GUIDE §9.1).
   */
  drained?: boolean;
  className?: string;
}

/**
 * A compact single-figure tile for concentration and coverage stats — the summary numbers that
 * sit above a chart rather than inside it.
 *
 * Lighter than `MetricCard`: no status chip, no provenance. Use it for descriptive counts and
 * shares; anything **derived** needs the full card so it can show its work.
 */
export function StatTile({ label, value, note, drained, className }: StatTileProps) {
  return (
    <div className={["stat-tile", className].filter(Boolean).join(" ")}>
      <div className="stat-tile-label">{label}</div>
      <div className={["stat-tile-value", drained ? "drained" : null].filter(Boolean).join(" ")}>
        {value}
      </div>
      {note ? <div className="stat-tile-note">{note}</div> : null}
    </div>
  );
}
