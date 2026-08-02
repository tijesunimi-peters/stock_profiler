import { jsx as _jsx } from "react/jsx-runtime";
/**
 * The company identity token — mono, ink fill, paper text (STYLE_GUIDE §6).
 *
 * Use it wherever a company is named in a compact context: table rows, entity bars, search
 * results. It is the one place the ink color is used as a fill on a data page.
 */
export function TickerChip({ symbol, className }) {
    return (_jsx("span", { className: ["ticker-chip", className].filter(Boolean).join(" "), children: symbol.toUpperCase() }));
}
