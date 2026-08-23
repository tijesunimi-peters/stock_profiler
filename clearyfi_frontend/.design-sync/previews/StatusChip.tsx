import { StatusChip } from "@clearyfi/design-prototype";

/** The complete four-token vocabulary, in the order the style guide lists it. */
export function FourStatuses() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <StatusChip status="ok" />
        <span>Trustworthy value, tagged in the filing</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <StatusChip status="approximate" />
        <span>Shown, but flagged imprecise</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <StatusChip status="na" />
        <span>Structurally meaningless for this filer</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <StatusChip status="nm" />
        <span>Computable, but would mislead</span>
      </div>
    </div>
  );
}

/** How the chip actually appears in the product: inline, standing in for an absent figure. */
export function InlineInProse() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 460 }}>
      <div>
        Effective tax rate <StatusChip status="na" /> not tagged by this filer
      </div>
      <div>
        Revenue growth <StatusChip status="nm" /> prior-period base is negative
      </div>
      <div>
        Segment margin <StatusChip status="approximate" /> operating income tagged, revenue derived
      </div>
    </div>
  );
}
