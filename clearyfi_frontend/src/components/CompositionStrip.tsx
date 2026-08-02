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

/** A single-hue ramp: these bands are parts of one quantity, so they don't get separate hues. */
const RAMP = ["#c0703a", "#cd8b5e", "#dba784", "#e8c3aa", "#efe9de"];

/**
 * A 100%-stacked part-to-whole bar — concentration at a glance (top 1 / top 2–5 / top 6–10 /
 * other).
 *
 * Labels sit inside a band only when it is wide enough to hold them, and drop to the legend
 * otherwise; a clipped label is worse than an outside one. Bands share a single-hue ramp
 * because they are parts of one magnitude — a categorical palette here would imply the bands
 * are unrelated entities.
 */
export function CompositionStrip({
  segments,
  insideLabelMin = 0.14,
  className,
}: CompositionStripProps) {
  const total = segments.reduce((sum, s) => sum + s.share, 0) || 1;
  const outside = segments.filter((s) => s.share / total < insideLabelMin);

  return (
    <div className={["composition-block", className].filter(Boolean).join(" ")}>
      <div className="composition-strip-bar">
        {segments.map((seg, i) => {
          const pct = (seg.share / total) * 100;
          const color = seg.color ?? RAMP[i % RAMP.length];
          return (
            <div
              className="composition-strip-seg"
              key={seg.label}
              style={{ width: `${pct}%`, background: color }}
              title={`${seg.label} — ${pct.toFixed(1)}%`}
            >
              {seg.share / total >= insideLabelMin ? (
                <span
                  className="composition-strip-seg-label"
                  style={{ color: i > 2 ? "var(--ink)" : "#fff" }}
                >
                  {seg.label} {pct.toFixed(1)}%
                </span>
              ) : null}
            </div>
          );
        })}
      </div>

      {outside.length ? (
        <div className="composition-strip-outside">
          {outside.map((seg) => {
            const i = segments.indexOf(seg);
            return (
              <span className="composition-strip-outside-item" key={seg.label}>
                <span
                  className="composition-strip-swatch"
                  style={{ background: seg.color ?? RAMP[i % RAMP.length] }}
                />
                {seg.label} {((seg.share / total) * 100).toFixed(1)}%
              </span>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
