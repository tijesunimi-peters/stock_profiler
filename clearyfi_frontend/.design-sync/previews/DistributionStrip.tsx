import { DistributionStrip } from "@clearyfi/design-prototype";

const PEERS = [
  { id: "AAPL", label: "Apple Inc.", value: 0.462 },
  { id: "MSFT", label: "Microsoft Corporation", value: 0.697 },
  { id: "NVDA", label: "NVIDIA Corporation", value: 0.751 },
  { id: "AMD", label: "Advanced Micro Devices", value: 0.503 },
  { id: "INTC", label: "Intel Corporation", value: 0.312 },
  { id: "TXN", label: "Texas Instruments", value: 0.581 },
  { id: "QCOM", label: "QUALCOMM Incorporated", value: 0.561 },
  { id: "AVGO", label: "Broadcom Inc.", value: 0.634 },
];

/** A peer distribution with the focal company distinguished. */
export function WithFocalCompany() {
  return (
    <DistributionStrip
      title="GROSS MARGIN VS PEERS"
      caption="SIC 3674 filers with gross margin tagged for the trailing four quarters."
      peers={PEERS}
      focalId="NVDA"
      axisLabels
      format={(v) => `${(v * 100).toFixed(0)}%`}
    />
  );
}

/** Peers with no comparable value are excluded and counted, never plotted as zero. */
export function WithExcludedPeers() {
  return (
    <DistributionStrip
      title="OPERATING MARGIN VS PEERS"
      caption="SIC 3674 filers."
      peers={[
        ...PEERS,
        { id: "WOLF", label: "Wolfspeed, Inc.", value: null },
        { id: "WOLF2", label: "Navitas Semiconductor", value: null },
      ]}
      focalId="AAPL"
      axisLabels
      format={(v) => `${(v * 100).toFixed(0)}%`}
    />
  );
}
