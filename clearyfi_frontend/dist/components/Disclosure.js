import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** The standing caveats every data page carries. Use these verbatim unless the view narrows them. */
export const STANDARD_DISCLOSURES = {
    financials_floor: "XBRL financial data begins around 2009–2012 depending on filer size. An empty period means we have no structured data for it, not that nothing was filed.",
    institutional_13f: "13F reports quarter-end long positions only — no shorts, no derivatives — and is filed up to 45 days after quarter end. Any buy/sell is DERIVED by diffing consecutive quarters, never a reported trade.",
    ownership_13dg_floor: "Schedule 13D/13G is only available as structured XML from around mid-2025; earlier filings are not covered.",
    not_advice: "This is public SEC filing data, cleaned and re-shaped. It is not investment advice, and nothing here is a recommendation.",
};
/**
 * The dashed data-notes block that carries coverage limits and the not-advice line
 * (STYLE_GUIDE §9.6, §9.8).
 *
 * Every data page ends with one. The point is that a reader can tell the difference between
 * "we have nothing" and "nothing exists" — which is exactly the distinction a silent empty
 * state destroys. `STANDARD_DISCLOSURES` holds the canonical strings.
 */
export function Disclosure({ items, label = "Data notes & coverage", open = false, className, }) {
    return (_jsxs("details", { className: ["disclosure", className].filter(Boolean).join(" "), open: open, children: [_jsx("summary", { children: label }), _jsx("ul", { children: items.map((item, i) => (_jsx("li", { children: item }, i))) })] }));
}
