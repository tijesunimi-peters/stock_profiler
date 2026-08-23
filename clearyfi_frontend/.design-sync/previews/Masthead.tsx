import { Masthead } from "@clearyfi/design-prototype";

/** A company page header: what it is, what it is scoped to, and as of when. */
export function CompanyPage() {
  return (
    <Masthead
      title="Apple Inc."
      subtitle="NASDAQ: AAPL · CIK 0000320193 · FY ends September"
      meta={["As of 2024-11-01", "Latest filing: 10-K, 2024-11-01", "Basis: as-restated"]}
      lede="Financial statements normalised from the company's own XBRL filings. Every figure carries the US-GAAP tag it was read from."
    />
  );
}

/** With the mono kicker, for a page seen outside the app shell. */
export function WithEyebrow() {
  return (
    <Masthead
      eyebrow="SECTOR ANALYTICS"
      title="Semiconductors & Related Devices"
      subtitle="SIC 3674 · 118 filers with usable coverage"
      meta={["As of 2024-11-01", "Trailing four quarters"]}
    />
  );
}
