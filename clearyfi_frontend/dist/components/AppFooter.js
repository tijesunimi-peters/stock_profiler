import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const DEFAULT_LINKS = [
    { label: "Company ↗", href: "/company/AAPL" },
    { label: "Coverage ↗", href: "/coverage" },
    { label: "API docs ↗", href: "/docs" },
];
/**
 * The page footer: a thin rule, mono accent links to real routes, and the standing tagline.
 *
 * Every link resolves — placeholder hrefs are forbidden (STYLE_GUIDE §10).
 */
export function AppFooter({ links = DEFAULT_LINKS, tagline = "ClearyFi · public SEC data, cleaned & queryable", className, }) {
    return (_jsxs("div", { className: ["app-footer", className].filter(Boolean).join(" "), children: [links.map((l) => (_jsx("a", { href: l.href, children: l.label }, l.href))), _jsx("span", { className: "tagline", children: tagline })] }));
}
