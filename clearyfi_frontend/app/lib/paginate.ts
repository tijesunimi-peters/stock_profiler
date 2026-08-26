/**
 * Derived paging maths for the row sets that grow without bound — a filer's Section 16 ledger,
 * an issuer's 13F register. Pure: the caller owns the page state (a `useState` near its other
 * hooks, so it sits above any early return) and passes it in.
 *
 * Pairs with the design system's `Pager`, which is presentational and does no counting of its
 * own. `PagedTable`/`PagedList` do this same arithmetic internally; this exists for surfaces
 * that already have their own tuned row markup and want the paging without the table styling.
 *
 * Paging is DISPLAY-ONLY. Every caller keeps the full array and slices for the DOM, so the
 * summaries, charts and counts above a table still describe all of it. Never derive a total
 * from `slice`.
 */
export interface Paged<T> {
  /** The page actually shown — clamped, so a shrunken list cannot strand a stale index. */
  page: number;
  pageCount: number;
  /** Index of the first shown item within the FULL array. Use it for stable React keys. */
  start: number;
  slice: T[];
  /** Pre-formatted for `Pager`, e.g. `1–10 of 1,284`. Locale pinned for deterministic output. */
  rangeLabel: string;
}

export function paginate<T>(items: T[], page: number, pageSize = 10): Paged<T> {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  // Clamp rather than reset: if a filter narrowed the set, the last page stays readable
  // instead of blanking out.
  const safePage = Math.min(Math.max(0, page), pageCount - 1);
  const start = safePage * pageSize;
  const slice = items.slice(start, start + pageSize);
  const n = (v: number) => v.toLocaleString("en-US");
  return {
    page: safePage,
    pageCount,
    start,
    slice,
    rangeLabel: `${n(start + 1)}–${n(start + slice.length)} of ${n(items.length)}`,
  };
}
