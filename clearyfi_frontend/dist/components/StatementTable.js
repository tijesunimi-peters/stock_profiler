import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { SourceBadge } from "./SourceBadge.js";
/**
 * The audit-grade statement table (STYLE_GUIDE §6): mono tabular amounts, a source-tag column
 * with a US-GAAP/extension badge per row, tinted header under a 2px ink underline.
 *
 * The source column is the point. Anyone can render a balance sheet; showing which tag each
 * number came from — and flagging the filer's own extension tags as less comparable — is what
 * makes it checkable. Do not drop that column to save width.
 */
export function StatementTable({ rows, amountHeader = "Amount", labelHeader = "Line item", caption, className, }) {
    return (_jsxs("div", { className: className, children: [_jsx("div", { className: "stmt-wrap", children: _jsxs("table", { className: "stmt-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: labelHeader }), _jsx("th", { className: "amt", children: amountHeader }), _jsx("th", { children: "Source" })] }) }), _jsx("tbody", { children: rows.map((row, i) => (_jsxs("tr", { children: [_jsx("td", { className: "stmt-label", children: row.label }), _jsx("td", { className: "amt", children: _jsx("span", { className: ["stmt-amt", row.drained ? "drained" : null]
                                                .filter(Boolean)
                                                .join(" "), children: row.amount }) }), _jsx("td", { children: row.sourceTag ? (_jsxs("span", { style: { display: "inline-flex", alignItems: "center", gap: 7 }, children: [_jsx("span", { className: "stmt-tag", children: row.sourceTag }), _jsx(SourceBadge, { kind: row.isExtension ? "ext" : "gaap" })] })) : null })] }, i))) })] }) }), caption ? _jsx("div", { className: "stmt-caption", children: caption }) : null] }));
}
