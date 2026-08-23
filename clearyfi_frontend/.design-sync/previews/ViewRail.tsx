import { SectionHead, ViewRail } from "@clearyfi/design-prototype";

const VIEWS = [
  { value: "overview", label: "Overview" },
  { value: "statements", label: "Statements" },
  { value: "history", label: "History" },
  { value: "peers", label: "Peers" },
  { value: "insider", label: "Insider" },
  { value: "institutional", label: "Institutional" },
];

/** The rail as it stands in a company view, with a section jump list. */
export function WithSections() {
  return (
    <ViewRail
      views={VIEWS}
      active="statements"
      width={196}
      note="Scoped to AAPL, FY2024"
      sectionsLabel="On this page"
      sections={[
        { n: "01", label: "Income statement", href: "#s1", current: true },
        { n: "02", label: "Balance sheet", href: "#s2" },
        { n: "03", label: "Cash flow", href: "#s3" },
        { n: "04", label: "Reportable segments", href: "#s4" },
      ]}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <SectionHead n="01" title="Income statement" subtitle="As reported, in USD." />
        <p style={{ maxWidth: 520 }}>
          Every line carries the US-GAAP tag it was read from, so a figure can be traced back to
          the filing that reported it.
        </p>
      </div>
    </ViewRail>
  );
}

/** Without a jump list — a short view earns only the rail. */
export function ViewsOnly() {
  return (
    <ViewRail views={VIEWS} active="peers" note="Scoped to SIC 3674">
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <SectionHead n="01" title="Peer comparison" subtitle="Ranked within SIC group." />
        <p style={{ maxWidth: 520 }}>
          Peers are companies sharing the filer's SIC group, ranked on the selected metric.
        </p>
      </div>
    </ViewRail>
  );
}
