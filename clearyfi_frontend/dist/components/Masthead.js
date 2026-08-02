import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * The page header (STYLE_GUIDE §4.3): title → right-aligned mono meta → a single hairline rule
 * → optional intro copy.
 *
 * Every data page opens with one. The meta column is where filing age and coverage caveats
 * live, which is why it sits at the top rather than in a footnote.
 */
export function Masthead({ title, meta = [], lede, eyebrow, className }) {
    return (_jsxs("div", { className: ["masthead", className].filter(Boolean).join(" "), children: [_jsxs("div", { className: "masthead-top", children: [_jsxs("div", { children: [eyebrow ? _jsx("div", { className: "eyebrow", children: eyebrow }) : null, _jsx("h1", { children: title })] }), meta.length ? (_jsx("div", { className: "masthead-meta", children: meta.map((line, i) => (_jsx("div", { children: line }, i))) })) : null] }), _jsx("div", { className: "rule-double" }), lede ? _jsx("p", { className: "lede", children: lede }) : null] }));
}
