import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { Pager } from "./Pager.js";
/** Formats the pager's range label. Locale pinned so the rendered output is deterministic. */
function rangeLabel(start, shown, total) {
    const n = (v) => v.toLocaleString("en-US");
    return `${n(start + 1)}–${n(start + shown)} of ${n(total)}`;
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
export function PagedTable({ columns, rows, renderRow, pageSize = 10, caption, emptyText, className, }) {
    const [page, setPage] = useState(0);
    const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
    // A shorter row set can strand the page index past the end (a filter narrowed the data, say).
    // Clamp for display rather than resetting, so the last page stays readable instead of blanking.
    const safePage = Math.min(page, pageCount - 1);
    const start = safePage * pageSize;
    const slice = useMemo(() => rows.slice(start, start + pageSize), [rows, start, pageSize]);
    return (_jsxs("div", { className: ["paged-table", className].filter(Boolean).join(" "), children: [_jsx("div", { className: "stmt-wrap", children: _jsxs("table", { className: "stmt-table", children: [_jsx("thead", { children: _jsx("tr", { children: columns.map((c) => (_jsx("th", { children: c }, c))) }) }), _jsx("tbody", { children: slice.length === 0 ? (_jsx("tr", { children: _jsx("td", { className: "stmt-label", colSpan: columns.length, children: _jsx("span", { className: "paged-empty-text", children: emptyText ?? "Nothing to show" }) }) })) : (slice.map((row, i) => _jsx("tr", { children: renderRow(row, start + i) }, start + i))) })] }) }), _jsx(Pager, { page: safePage, pageCount: pageCount, rangeLabel: rangeLabel(start, slice.length, rows.length), onPrev: () => setPage(Math.max(0, safePage - 1)), onNext: () => setPage(Math.min(pageCount - 1, safePage + 1)) }), caption ? _jsx("div", { className: "stmt-caption", children: caption }) : null] }));
}
