import { EntityBar } from "@clearyfi/design-prototype";

/** The identity strip under a company masthead. */
export function CompanyIdentity() {
  return (
    <EntityBar
      note="Values are as of the latest filing, not real-time."
      cells={[
        { label: "CIK", value: "0000320193" },
        { label: "TICKER", value: "AAPL" },
        { label: "SIC", value: "3571 — Electronic Computers" },
        { label: "FISCAL YEAR END", value: "September" },
        { label: "LATEST FILING", value: "10-K · 2024-11-01" },
      ]}
    />
  );
}

/** An unresolved cell renders drained — never a zero, never a guess. */
export function WithUnresolvedCell() {
  return (
    <EntityBar
      note="Values are as of the latest filing, not real-time."
      cells={[
        { label: "CIK", value: "0001045810" },
        { label: "TICKER", value: "NVDA" },
        { label: "SIC", value: "3674 — Semiconductors" },
        { label: "SHARES OUTSTANDING", value: null },
      ]}
    />
  );
}
