import { SectionHead } from "@clearyfi/design-prototype";

/** A numbered section header with the how-to-read line the product always carries. */
export function Numbered() {
  return (
    <SectionHead
      n="03"
      title="Reportable segments"
      subtitle="ASC 280 splits as the filer disclosed them. Shares are of the disclosed total, which need not sum to consolidated revenue."
    />
  );
}

/** Several in sequence — how the numbering reads down a long view. */
export function InSequence() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 30 }}>
      <SectionHead n="01" title="Income statement" subtitle="As reported, in USD." />
      <SectionHead
        n="02"
        title="Balance sheet"
        subtitle="Point-in-time balances at the fiscal period end."
      />
      <SectionHead
        n="03"
        title="Reportable segments"
        subtitle="ASC 280 splits as the filer disclosed them."
      />
    </div>
  );
}
