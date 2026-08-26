export interface PagerProps {
    /** Current page, zero-based. */
    page: number;
    /** Total number of pages. The control renders nothing when this is 1 or fewer. */
    pageCount: number;
    /** The range this page covers, e.g. `1–10 of 1,284`. Pre-formatted — the pager does not count. */
    rangeLabel: string;
    onPrev?: () => void;
    onNext?: () => void;
    className?: string;
}
/**
 * The Prev/Next control that sits under a paged table or list.
 *
 * **Renders `null` when there is one page or fewer.** That is the contract, not an optimisation:
 * a collection that fits on a single page must look exactly as it would with no pagination at
 * all, with no dead control implying there is more to see. Ported from the static UI's
 * `paginatedTable`, which builds its pager only when `pages > 1` for the same reason.
 *
 * Presentational: it owns no page state and does no counting. `PagedTable` and `PagedList` hold
 * the state and hand this the already-computed label, so the same control serves both.
 */
export declare function Pager({ page, pageCount, rangeLabel, onPrev, onNext, className }: PagerProps): import("react").JSX.Element | null;
