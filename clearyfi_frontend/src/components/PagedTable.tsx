import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Pager } from "./Pager.js";

/** Formats the pager's range label. Locale pinned so the rendered output is deterministic. */
function rangeLabel(start: number, shown: number, total: number): string {
  const n = (v: number) => v.toLocaleString("en-US");
  return `${n(start + 1)}–${n(start + shown)} of ${n(total)}`;
}

export interface PagedTableProps<T> {
  /** Column header labels, left to right. */
  columns: string[];
  /** The FULL row set. Paging slices this for display; nothing is dropped. */
  rows: T[];
  /**
   * Renders one row's cells — return the `<td>`s, not the `<tr>`. The table owns the row element
   * and its key, so a caller cannot accidentally break reconciliation while paging.
   */
  renderRow: (row: T, index: number) => ReactNode;
  /**
   * Rows per page. Defaults to 10, which is what every call site in the product uses and which
   * keeps the whole table inside a viewport so the pager stays visible while reading.
   */
  pageSize?: number;
  /** Mono caption under the table — units, coverage, the standing caveat. */
  caption?: string;
  /** Shown in place of the body when `rows` is empty. Headers still render. */
  emptyText?: string;
  className?: string;
}

/**
 * A statement-styled table that pages client-side, for collections with no natural bound —
 * a filer's 13F holdings, an issuer's holders, derived activity.
 *
 * **Paging is display-only, and that is load-bearing.** The component receives the entire row
 * set and slices it for the DOM; it never asks for a page. So any chart or tile above it still
 * summarises *all* the data, and turning a page never changes what those numbers mean. A
 * server-paged variant would quietly break that: a total computed from one visible page is the
 * kind of number this system exists not to print.
 *
 * Ported from the static UI's `ClearyFi.paginatedTable`, including its contract that a
 * single-page collection renders no pager at all.
 *
 * Deliberately has **no sticky header**. At the default page size the whole table is on screen,
 * so there is nothing to pin — and the table renders inside `.stmt-wrap` (`overflow-x: auto`),
 * where a sticky `th` pins itself to the *wrapper* rather than the viewport. The product hit
 * exactly that and had to undo it for its scrolling matrices.
 */
export function PagedTable<T>({
  columns,
  rows,
  renderRow,
  pageSize = 10,
  caption,
  emptyText,
  className,
}: PagedTableProps<T>) {
  const [page, setPage] = useState(0);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  // A shorter row set can strand the page index past the end (a filter narrowed the data, say).
  // Clamp for display rather than resetting, so the last page stays readable instead of blanking.
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * pageSize;
  const slice = useMemo(() => rows.slice(start, start + pageSize), [rows, start, pageSize]);

  return (
    <div className={["paged-table", className].filter(Boolean).join(" ")}>
      <div className="stmt-wrap">
        <table className="stmt-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.length === 0 ? (
              <tr>
                <td className="stmt-label" colSpan={columns.length}>
                  <span className="paged-empty-text">{emptyText ?? "Nothing to show"}</span>
                </td>
              </tr>
            ) : (
              slice.map((row, i) => <tr key={start + i}>{renderRow(row, start + i)}</tr>)
            )}
          </tbody>
        </table>
      </div>
      <Pager
        page={safePage}
        pageCount={pageCount}
        rangeLabel={rangeLabel(start, slice.length, rows.length)}
        onPrev={() => setPage(Math.max(0, safePage - 1))}
        onNext={() => setPage(Math.min(pageCount - 1, safePage + 1))}
      />
      {caption ? <div className="stmt-caption">{caption}</div> : null}
    </div>
  );
}
