import type { MetricValue } from "../types.js";
import { STATUS_META, formatMetric, isDrained } from "../types.js";

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
export function MetricTile({ metric, expandable, move, className }: MetricTileProps) {
  const drained = isDrained(metric.status);
  const meta = STATUS_META[metric.status];

  return (
    <div
      className={["mtile", drained ? "drained" : null, className].filter(Boolean).join(" ")}
    >
      <div className="mtile-face">
        <div className="mtile-label">{metric.label}</div>
        <div className={["mtile-value", expandable ? "has-cue" : null].filter(Boolean).join(" ")}>
          {formatMetric(metric)}
        </div>
        <div className="mtile-foot">
          <span
            className={`mtile-status status-${metric.status}`}
            title={metric.reason ?? meta.description}
          >
            {meta.glyph}
          </span>
          {metric.basis ? <span className="mtile-basis">{metric.basis}</span> : null}
          {move ? <span className="mtile-move">{move}</span> : null}
        </div>
      </div>
    </div>
  );
}
