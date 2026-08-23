import { MetricTile, MetricTileGrid } from "@clearyfi/design-prototype";

/** The grid as it appears at the top of a company overview — mixed statuses, honestly. */
export function ProfitabilityRow() {
  return (
    <MetricTileGrid>
      <MetricTile
        move="+2.1pp vs FY2023"
        metric={{ label: "Gross Margin", value: 0.462, unit: "ratio", basis: "TTM", status: "ok" }}
      />
      <MetricTile
        move="−0.4pp vs FY2023"
        metric={{
          label: "Operating Margin",
          value: 0.315,
          unit: "ratio",
          basis: "TTM",
          status: "ok",
        }}
      />
      <MetricTile
        metric={{ label: "Net Margin", value: 0.2397, unit: "ratio", basis: "TTM", status: "ok" }}
      />
      <MetricTile
        metric={{
          label: "Return on Equity",
          value: null,
          unit: "ratio",
          basis: "TTM",
          status: "nm",
          reason: "Shareholders' equity is negative, so the ratio would invert its sign.",
        }}
      />
    </MetricTileGrid>
  );
}
