import { Provenance } from "@clearyfi/design-prototype";

/** Closed by default — provenance never blocks the primary read. */
export function Collapsed() {
  return (
    <Provenance
      formula="Net income ÷ Total revenue"
      basis="TTM"
      restatementBasis="as-restated"
      asOf="2024-11-01"
      status="ok"
    />
  );
}

/** Opened: formula, basis and as-of date, for a trustworthy value. */
export function Opened() {
  return (
    <Provenance
      open
      formula="Total current assets ÷ Total current liabilities"
      basis="as-of"
      restatementBasis="as-restated"
      asOf="2024-09-28"
      status="ok"
    />
  );
}

/** A flagged value carries its reason verbatim — the only place the caveat is stated. */
export function WithReason() {
  return (
    <Provenance
      open
      formula="Operating income ÷ Segment revenue"
      basis="TTM"
      restatementBasis="as-restated"
      asOf="2024-11-01"
      status="approximate"
      reason="Operating income is tagged for this segment; segment revenue is derived from the disclosed split and may not reconcile to consolidated revenue."
    />
  );
}
