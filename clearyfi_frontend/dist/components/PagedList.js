import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { Pager } from "./Pager.js";
/** Formats the pager's range label. Locale pinned so the rendered output is deterministic. */
function rangeLabel(start, shown, total) {
    const n = (v) => v.toLocaleString("en-US");
    return `${n(start + 1)}–${n(start + shown)} of ${n(total)}`;
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
export function PagedList({ items, renderItem, pageSize = 10, label, caption, emptyText, className, }) {
    const [page, setPage] = useState(0);
    const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
    // Clamp rather than reset: a narrowed item set should leave the last page readable.
    const safePage = Math.min(page, pageCount - 1);
    const start = safePage * pageSize;
    const slice = useMemo(() => items.slice(start, start + pageSize), [items, start, pageSize]);
    return (_jsxs("div", { className: ["paged-list", className].filter(Boolean).join(" "), children: [label ? _jsx("div", { className: "micro", children: label }) : null, slice.length === 0 ? (_jsx("div", { className: "paged-list-empty", children: _jsx("span", { className: "paged-empty-text", children: emptyText ?? "Nothing to show" }) })) : (_jsx("ul", { className: "paged-list-items", children: slice.map((item, i) => (_jsx("li", { children: renderItem(item, start + i) }, start + i))) })), _jsx(Pager, { page: safePage, pageCount: pageCount, rangeLabel: rangeLabel(start, slice.length, items.length), onPrev: () => setPage(Math.max(0, safePage - 1)), onNext: () => setPage(Math.min(pageCount - 1, safePage + 1)) }), caption ? _jsx("div", { className: "stmt-caption", children: caption }) : null] }));
}
