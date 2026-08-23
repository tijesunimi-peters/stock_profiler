import { AppShell, Masthead, SectionHead, StatTile, StatTileRow } from "@clearyfi/design-prototype";

/** A whole page inside the shell — sidebar subjects, topbar search, and page content. */
export function CompanyPage() {
  return (
    <AppShell searchPlaceholder="Search ticker or CIK…" actionsSubject="Companies">
      <Masthead
        title="Apple Inc."
        subtitle="NASDAQ: AAPL · CIK 0000320193 · FY ends September"
        meta={["As of 2024-11-01", "Latest filing: 10-K"]}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 26, marginTop: 26 }}>
        <SectionHead
          n="01"
          title="Coverage"
          subtitle="What we hold for this filer, and as of when."
        />
        <StatTileRow>
          <StatTile label="FILINGS INDEXED" value="1,204" note="10-K, 10-Q, 8-K" />
          <StatTile label="PERIODS" value="48" note="quarterly and annual" />
          <StatTile label="CONCEPTS" value="512" note="distinct US-GAAP tags" />
        </StatTileRow>
      </div>
    </AppShell>
  );
}
