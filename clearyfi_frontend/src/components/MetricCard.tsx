import type { MetricValue } from "../types.js";
import { formatMetric, isDrained } from "../types.js";
import { StatusChip } from "./StatusChip.js";
import { Provenance } from "./Provenance.js";

export interface MetricCardProps {
  /** The metric, including its status, basis and reason. */
  metric: MetricValue;
  /** Plain-language formula shown under "Show your work". */
  formula?: string;
  /** Open the provenance disclosure on first render. */
  provenanceOpen?: boolean;
  className?: string;
}

/**
 * The primary metric surface (STYLE_GUIDE §6): name + status chip, big mono value with its
 * basis tag, an optional caveat note, and built-in provenance.
 *
 * An `na`/`nm` metric renders the **drained token** on tint with no shadow — visibly present,
 * visibly not a number. It is never rendered as `0`, blank, or a guess; that rule outranks
 * every aesthetic consideration in this system.
 */
export function MetricCard({ metric, formula, provenanceOpen, className }: MetricCardProps) {
  const drained = isDrained(metric.status);
  return (
    <div
      className={["metric-card", drained ? "na" : null, className].filter(Boolean).join(" ")}
    >
      <div className="metric-head">
        <span className="metric-name">{metric.label}</span>
        <StatusChip status={metric.status} />
      </div>

      <div className={["metric-value", drained ? "drained" : null].filter(Boolean).join(" ")}>
        {formatMetric(metric)}
      </div>
      {metric.basis ? <div className="metric-basis">{metric.basis}</div> : null}

      {/* An APPROX value still shows its number — the caveat rides alongside it, never instead. */}
      {metric.status === "approximate" && metric.reason ? (
        <div className="metric-note">{metric.reason}</div>
      ) : null}

      <div className="metric-actions">
        <Provenance
          formula={formula}
          basis={metric.basis}
          restatementBasis={metric.restatementBasis}
          asOf={metric.asOf}
          status={metric.status}
          reason={metric.reason}
          open={provenanceOpen}
        />
      </div>
    </div>
  );
}
