import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Pager } from "./Pager.js";

/** Formats the pager's range label. Locale pinned so the rendered output is deterministic. */
function rangeLabel(start: number, shown: number, total: number): string {
  const n = (v: number) => v.toLocaleString("en-US");
  return `${n(start + 1)}–${n(start + shown)} of ${n(total)}`;
}

export interface PagedListProps<T> {
  /** The FULL item set. Paging slices this for display; nothing is dropped. */
  items: T[];
  /** Renders one item. The list owns the `<li>` and its key. */
  renderItem: (item: T, index: number) => ReactNode;
  /**
   * Items per page. Defaults to 10, matching `PagedTable` and every paged surface in the
   * product.
   */
  pageSize?: number;
  /** Mono uppercase micro-label above the list. */
  label?: string;
  /** Mono caption under the list — coverage, the standing caveat. */
  caption?: string;
  /** Shown in place of the items when `items` is empty. */
  emptyText?: string;
  className?: string;
}

/**
 * The same client-side paging as `PagedTable`, for collections that are a row set but not
 * tabular — filing lists, holder lists, event feeds.
 *
 * Exists because the alternative in practice is a hard `.slice(0, n)`, which drops rows with
 * nothing telling the reader they were there. An honest short list says how much it is showing;
 * a truncated one just looks complete.
 *
 * As with `PagedTable`, the component receives every item and pages only the DOM, so anything
 * summarising the collection above it still describes the whole of it.
 */
export function PagedList<T>({
  items,
  renderItem,
  pageSize = 10,
  label,
  caption,
  emptyText,
  className,
}: PagedListProps<T>) {
  const [page, setPage] = useState(0);

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  // Clamp rather than reset: a narrowed item set should leave the last page readable.
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * pageSize;
  const slice = useMemo(() => items.slice(start, start + pageSize), [items, start, pageSize]);

  return (
    <div className={["paged-list", className].filter(Boolean).join(" ")}>
      {label ? <div className="micro">{label}</div> : null}
      {slice.length === 0 ? (
        <div className="paged-list-empty">
          <span className="paged-empty-text">{emptyText ?? "Nothing to show"}</span>
        </div>
      ) : (
        <ul className="paged-list-items">
          {slice.map((item, i) => (
            <li key={start + i}>{renderItem(item, start + i)}</li>
          ))}
        </ul>
      )}
      <Pager
        page={safePage}
        pageCount={pageCount}
        rangeLabel={rangeLabel(start, slice.length, items.length)}
        onPrev={() => setPage(Math.max(0, safePage - 1))}
        onNext={() => setPage(Math.min(pageCount - 1, safePage + 1))}
      />
      {caption ? <div className="stmt-caption">{caption}</div> : null}
    </div>
  );
}
