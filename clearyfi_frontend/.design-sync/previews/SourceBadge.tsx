import { SourceBadge } from "@clearyfi/design-prototype";

/** The two kinds, side by side — the distinction the badge exists to make. */
export function GaapVsExtension() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <SourceBadge kind="gaap" />
        <span>Standard US-GAAP tag — comparable across filers</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <SourceBadge kind="ext" />
        <span>Company extension tag — the filer's own invention</span>
      </div>
    </div>
  );
}

/** Carrying the tag itself, as it appears beside a statement line. */
export function WithTagLabels() {
  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}
    >
      <SourceBadge kind="gaap" label="RevenueFromContractWithCustomerExcludingAssessedTax" />
      <SourceBadge kind="gaap" label="OperatingIncomeLoss" />
      <SourceBadge kind="ext" label="DataCenterSegmentMember" />
    </div>
  );
}
