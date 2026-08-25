import { PagedList, StatusChip } from "@clearyfi/design-prototype";

interface Filing {
  form: string;
  filed: string;
  note: string;
}

const FORMS = ["10-K", "10-Q", "8-K", "4", "13F-HR", "DEF 14A"];
const filings = (n: number): Filing[] =>
  Array.from({ length: n }, (_, i) => ({
    form: FORMS[i % FORMS.length],
    filed: `2026-${String(12 - (i % 12)).padStart(2, "0")}-${String(((i * 7) % 27) + 1).padStart(2, "0")}`,
    note: i % 5 === 0 ? "Amended" : "Original",
  }));

const item = (f: Filing) => (
  <span style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
    <span className="stmt-tag" style={{ minWidth: 62 }}>{f.form}</span>
    <span className="num" style={{ fontSize: 12 }}>{f.filed}</span>
    <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>{f.note}</span>
  </span>
);

/** A filing history — long, and paged rather than truncated. */
export function FilingHistory() {
  return (
    <PagedList
      label="Filing history"
      items={filings(347)}
      renderItem={item}
      caption="EDGAR's rolling indexed window. An absence here is scoped to that window, not to all time."
    />
  );
}

/** Short enough for one page: no pager, exactly as an unpaged list would look. */
export function SinglePage() {
  return <PagedList label="Recent filings" items={filings(6)} renderItem={item} />;
}

/** Empty, stated honestly rather than rendered as a blank region. */
export function Empty() {
  return (
    <PagedList
      label="Filing history"
      items={[]}
      renderItem={item}
      emptyText="Nothing indexed for this filer in EDGAR's current window"
    />
  );
}

/** Mixed content — the list holds whatever the caller renders, including status chips. */
export function WithStatusRows() {
  const rows = [
    { label: "Effective tax rate", status: "na" as const, why: "not tagged by this filer" },
    { label: "Revenue growth", status: "nm" as const, why: "prior-period base is negative" },
    { label: "Segment margin", status: "approximate" as const, why: "revenue derived from the split" },
    { label: "Net margin", status: "ok" as const, why: "both legs tagged" },
  ];
  return (
    <PagedList
      label="Metric coverage"
      pageSize={3}
      items={rows}
      renderItem={(r) => (
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <StatusChip status={r.status} />
          <span style={{ fontSize: 13 }}>{r.label}</span>
          <span style={{ fontSize: 12, color: "var(--mono-muted)" }}>{r.why}</span>
        </span>
      )}
      caption="pageSize=3 — a caller can opt out of the default 10."
    />
  );
}
