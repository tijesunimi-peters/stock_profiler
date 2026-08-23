import { MetricTile } from "@clearyfi/design-prototype";

/** The everyday tile: a value with its period-over-period move. */
export function WithMove() {
  return (
    <MetricTile
      move="+2.1pp vs FY2023"
      metric={{
        metric: "gross_margin",
        label: "Gross Margin",
        value: 0.462,
        unit: "ratio",
        basis: "TTM",
        status: "ok",
      }}
    />
  );
}

/** Expandable — the dashed underline cues a drawer behind the value. */
export function Expandable() {
  return (
    <MetricTile
      expandable
      move="−0.4pp vs FY2023"
      metric={{
        metric: "operating_margin",
        label: "Operating Margin",
        value: 0.315,
        unit: "ratio",
        basis: "TTM",
        status: "ok",
      }}
    />
  );
}

/** A drained tile: not applicable for this filer, and never rendered as zero. */
export function Drained() {
  return (
    <MetricTile
      metric={{
        metric: "inventory_turnover",
        label: "Inventory Turnover",
        value: null,
        unit: "ratio",
        basis: "TTM",
        status: "na",
        reason: "This filer reports no inventory.",
      }}
    />
  );
}
