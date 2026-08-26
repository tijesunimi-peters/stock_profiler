import type { ReactNode } from "react";
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
export declare function PagedList<T>({ items, renderItem, pageSize, label, caption, emptyText, className, }: PagedListProps<T>): import("react").JSX.Element;
