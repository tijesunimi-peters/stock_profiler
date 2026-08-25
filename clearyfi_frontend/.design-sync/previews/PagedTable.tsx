import { PagedTable } from "@clearyfi/design-prototype";

interface Holder {
  manager: string;
  shares: string;
  pct: string;
  period: string;
}

const NAMES = [
  "Vanguard Group Inc", "BlackRock Inc", "State Street Corp", "Geode Capital Management",
  "Fidelity Management & Research", "Morgan Stanley", "Northern Trust Corp", "Bank of America Corp",
  "Charles Schwab Investment", "Wellington Management Group", "Invesco Ltd", "Legal & General Group",
];
const holders = (n: number): Holder[] =>
  Array.from({ length: n }, (_, i) => ({
    manager: NAMES[i % NAMES.length] + (i >= NAMES.length ? ` (${Math.floor(i / NAMES.length) + 1})` : ""),
    shares: (1_380_000_000 / (i + 1.4)).toLocaleString("en-US", { maximumFractionDigits: 0 }),
    pct: (8.9 / (i + 1.15)).toFixed(2) + "%",
    period: "2026-06-30",
  }));

const COLUMNS = ["Manager", "Shares held", "% of reported", "Quarter end"];
const row = (h: Holder) => (
  <>
    <td className="stmt-label">{h.manager}</td>
    <td className="amt">
      <span className="stmt-amt">{h.shares}</span>
    </td>
    <td className="amt">
      <span className="stmt-amt">{h.pct}</span>
    </td>
    <td>
      <span className="stmt-tag">{h.period}</span>
    </td>
  </>
);

/** The canonical case: a filer's holders, far more than one page. */
export function ManyPages() {
  return (
    <PagedTable
      columns={COLUMNS}
      rows={holders(1284)}
      renderRow={row}
      caption="Reported 13F long positions at quarter end. Charts above summarise all 1,284 holders, not this page."
    />
  );
}

/** Exactly one page's worth: NO pager renders — a short table looks unpaged. */
export function ExactlyOnePage() {
  return (
    <PagedTable
      columns={COLUMNS}
      rows={holders(10)}
      renderRow={row}
      caption="Ten holders — one page, so no pager appears."
    />
  );
}

/** One row past the page size is where the pager first appears. */
export function JustOverOnePage() {
  return (
    <PagedTable
      columns={COLUMNS}
      rows={holders(11)}
      renderRow={row}
      caption="Eleven holders — two pages."
    />
  );
}

/** No rows at all: headers stay, the absence is stated, and no pager appears. */
export function Empty() {
  return (
    <PagedTable
      columns={COLUMNS}
      rows={[]}
      renderRow={row}
      emptyText="No 13F filer reported a position this quarter"
      caption="An absence in the filings, not a gap in coverage."
    />
  );
}
