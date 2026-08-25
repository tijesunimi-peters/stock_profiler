import { Pager } from "@clearyfi/design-prototype";

/** First page: Prev is disabled, Next is live. */
export function FirstPage() {
  return <Pager page={0} pageCount={129} rangeLabel="1–10 of 1,284" />;
}

/** Mid-run: both controls live. */
export function MiddlePage() {
  return <Pager page={63} pageCount={129} rangeLabel="631–640 of 1,284" />;
}

/** Last page: Next is disabled, and the final range is short of a full page. */
export function LastPage() {
  return <Pager page={128} pageCount={129} rangeLabel="1,281–1,284 of 1,284" />;
}

/**
 * One page renders NOTHING — the contract. Shown inside a labelled frame because an
 * empty card is indistinguishable from a broken one.
 */
export function SinglePageRendersNothing() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 460 }}>
      <span className="micro">pageCount = 1 — the control below renders nothing</span>
      <div
        style={{
          border: "1px dashed var(--border-strong)",
          borderRadius: 8,
          minHeight: 40,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Pager page={0} pageCount={1} rangeLabel="1–7 of 7" />
        <span className="paged-empty-text">(nothing — a short list looks unpaged)</span>
      </div>
    </div>
  );
}
