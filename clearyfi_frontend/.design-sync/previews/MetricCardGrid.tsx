import { MetricCard, MetricCardGrid } from "@clearyfi/design-prototype";

/** Cards in a grid — the primary metric surface of a company view. */
export function LiquidityAndReturns() {
  return (
    <MetricCardGrid>
      <MetricCard
        formula="Net income ÷ Total revenue"
        metric={{
          label: "Net Margin",
          value: 0.2397,
          unit: "ratio",
          basis: "TTM",
          restatementBasis: "as-restated",
          asOf: "2024-11-01",
          status: "ok",
        }}
      />
      <MetricCard
        formula="Total current assets ÷ Total current liabilities"
        metric={{
          label: "Current Ratio",
          value: 0.87,
          display: "0.87×",
          unit: "ratio",
          basis: "as-of",
          restatementBasis: "as-restated",
          asOf: "2024-09-28",
          status: "ok",
        }}
      />
      <MetricCard
        formula="Interest expense ÷ Average total debt"
        metric={{
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
    </MetricCardGrid>
  );
}
