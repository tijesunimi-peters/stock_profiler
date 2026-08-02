import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * The numbered section header (STYLE_GUIDE §4.5): mono accent number + Hanken 800 name, an
 * optional mono subtitle, all over a 2px ink underline.
 *
 * The numbering is not decorative — it is what the view rail's section jump list addresses, so
 * keep numbers stable and sequential down the page.
 */
export function SectionHead({ n, title, subtitle, className }) {
    return (_jsxs("div", { className: ["section-head", subtitle ? "has-sub" : null, className].filter(Boolean).join(" "), children: [_jsxs("div", { className: "section-head-top", children: [_jsx("span", { className: "n", children: n }), _jsx("h2", { children: title })] }), subtitle ? _jsx("div", { className: "section-head-sub", children: subtitle }) : null] }));
}
