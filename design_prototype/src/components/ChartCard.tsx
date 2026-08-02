import type { ReactNode } from "react";

export interface ChartCardProps {
  /** Mono accent eyebrow above the plot. */
  title: string;
  /** The chart itself — an SVG, or any node. */
  children: ReactNode;
  /**
   * The honesty caption. Carry what is **specific to this chart**; a standing caveat (e.g.
   * "reported 13F long positions only") belongs once per page, not under every chart —
   * repeating it trains readers to skip captions (STYLE_GUIDE §6).
   */
  caption?: string;
  /** A second, smaller line for a secondary note. */
  note?: string;
  className?: string;
}

/**
 * The shared chrome every chart wraps itself in (STYLE_GUIDE §6) — one visual dialect per page,
 * so a chart never looks like a foreign widget dropped onto the paper.
 *
 * The body scrolls horizontally rather than distorting or overflowing, and the caption slot is
 * not optional in spirit: a chart that cannot say what it excludes is a chart that misleads.
 */
export function ChartCard({ title, children, caption, note, className }: ChartCardProps) {
  return (
    <figure className={["plot-chart", className].filter(Boolean).join(" ")} style={{ margin: "4px 0 22px" }}>
      <div className="plot-chart-title">{title}</div>
      <div className="plot-chart-body">{children}</div>
      {caption ? <figcaption className="plot-chart-caption">{caption}</figcaption> : null}
      {note ? <div className="plot-chart-note">{note}</div> : null}
    </figure>
  );
}
