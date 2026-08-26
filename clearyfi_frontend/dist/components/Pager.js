import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
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
export function Pager({ page, pageCount, rangeLabel, onPrev, onNext, className }) {
    if (pageCount <= 1)
        return null;
    return (_jsxs("div", { className: ["table-pager", className].filter(Boolean).join(" "), children: [_jsx("button", { type: "button", className: "pager-btn", onClick: onPrev, disabled: page === 0, children: "\u2190 Prev" }), _jsx("span", { className: "pager-label", children: rangeLabel }), _jsx("button", { type: "button", className: "pager-btn", onClick: onNext, disabled: page >= pageCount - 1, children: "Next \u2192" })] }));
}
