import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * The numbered section header (STYLE_GUIDE §4.5): mono accent number + Hanken 800 name over a
 * 2px ink underline.
 *
 * The numbering is not decorative — it is what the view rail's section jump list addresses, so
 * keep numbers stable and sequential down the page.
 */
export function SectionHead({ n, title, className }) {
    return (_jsxs("div", { className: ["section-head", className].filter(Boolean).join(" "), children: [_jsx("span", { className: "n", children: n }), _jsx("h2", { children: title })] }));
}
