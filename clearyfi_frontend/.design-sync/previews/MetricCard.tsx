import { MetricCard } from "@clearyfi/design-prototype";

/** A trustworthy value: number, basis tag, and provenance ready to open. */
export function Trustworthy() {
  return (
    <MetricCard
      formula="Net income ÷ Total revenue"
      metric={{
        metric: "net_margin",
        label: "Net Margin",
        value: 0.2397,
        unit: "ratio",
        basis: "TTM",
        restatementBasis: "as-restated",
        asOf: "2024-11-01",
        status: "ok",
      }}
    />
  );
}

/** An approximate value still shows its number — the caveat rides alongside, never instead. */
export function Approximate() {
  return (
    <MetricCard
      formula="Operating income ÷ Segment revenue"
      metric={{
        metric: "segment_operating_margin",
        label: "Segment Operating Margin",
        value: 0.312,
        unit: "ratio",
        basis: "TTM",
        restatementBasis: "as-restated",
        asOf: "2024-11-01",
        status: "approximate",
        reason: "Operating income is tagged; segment revenue is derived from the disclosed split.",
      }}
    />
  );
}

/** Structurally meaningless for this filer — the drained token, never a zero. */
export function NotApplicable() {
  return (
    <MetricCard
      formula="Interest expense ÷ Average total debt"
      metric={{
        metric: "cost_of_debt",
        label: "Cost of Debt",
        value: null,
        unit: "ratio",
        basis: "TTM",
        restatementBasis: "as-restated",
        asOf: "2024-11-01",
        status: "na",
        reason: "This filer reports no interest expense and carries no long-term debt.",
      }}
    />
  );
}

/** Computable, but would mislead — growth measured off a negative base. */
export function NotMeaningful() {
  return (
    <MetricCard
      formula="(Current period ÷ Prior period) − 1"
      metric={{
        metric: "operating_income_growth",
        label: "Operating Income Growth",
        value: null,
        unit: "ratio",
        basis: "TTM",
        restatementBasis: "as-restated",
        asOf: "2024-11-01",
        status: "nm",
        reason: "Prior-period operating income is negative, so a growth rate would invert its sign.",
      }}
    />
  );
}

/** Provenance opened on first render — how the card reads when showing its work. */
export function ProvenanceOpen() {
  return (
    <MetricCard
      provenanceOpen
      formula="Total current assets ÷ Total current liabilities"
      metric={{
        metric: "current_ratio",
        label: "Current Ratio",
        value: 0.87,
        // A current ratio is a MULTIPLE, not a percentage. formatMetric renders any
        // `ratio` with |v| <= 5 as a percent, so sub-5x multiples need `display`.
        display: "0.87×",
        unit: "ratio",
        basis: "as-of",
        restatementBasis: "as-restated",
        asOf: "2024-09-28",
        status: "ok",
      }}
    />
  );
}
