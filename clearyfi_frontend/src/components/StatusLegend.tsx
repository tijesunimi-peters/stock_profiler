import { STATUS_META } from "../types.js";
import type { MetricStatus } from "../types.js";
import { StatusChip } from "./StatusChip.js";

export interface StatusLegendProps {
  /** Restrict the legend to a subset. Defaults to all four — usually what you want. */
  statuses?: MetricStatus[];
  className?: string;
}

const ORDER: MetricStatus[] = ["ok", "approximate", "na", "nm"];

/**
 * Explains all four status tokens. **Required near the top of any page that shows metrics**
 * (STYLE_GUIDE §7) — the vocabulary is a product feature, not decoration, so it gets defined
 * where the reader meets it rather than in a help page they will never open.
 */
export function StatusLegend({ statuses = ORDER, className }: StatusLegendProps) {
  return (
    <div className={["legend", className].filter(Boolean).join(" ")}>
      {statuses.map((s) => (
        <span className="legend-item" key={s}>
          <StatusChip status={s} />
          <span className="desc">{STATUS_META[s].description}</span>
        </span>
      ))}
    </div>
  );
}
