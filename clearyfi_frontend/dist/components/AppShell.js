import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * The seven subjects. **Four ship planned-and-inert on purpose** — hiding them would suppress
 * real information about what the product covers.
 */
const DEFAULT_SUBJECTS = [
    { label: "Companies", href: "/company/AAPL", current: true },
    { label: "Sectors", href: "/sectors" },
    { label: "Managers", href: "/manager/1067983" },
    { label: "People", title: "Insiders across companies — planned" },
    { label: "Auditors", title: "Audit firms and their filers — planned" },
    { label: "Funds", title: "Fund families and mandates — planned" },
    { label: "Events", title: "Filing events timeline — planned" },
];
const DEFAULT_ACTIONS = [
    { label: "Compare", href: "/compare" },
    { label: "Screen", href: "/screen" },
    { label: "Coverage", href: "/coverage" },
];
/** The standing reference group — always last, always the same three. */
const DEFAULT_REFERENCE = [
    { label: "Docs & guide", href: "/guide" },
    { label: "Methodology", href: "/methodology" },
    { label: "API reference", href: "/docs" },
];
function NavItem({ item }) {
    const cls = [
        "shell-nav-item",
        item.current ? "is-current" : null,
        item.href ? null : "is-planned",
    ]
        .filter(Boolean)
        .join(" ");
    // No href and no handler for a planned subject — the cursor must not invite a click.
    if (!item.href) {
        return (_jsxs("span", { className: cls, title: item.title, children: [_jsx("span", { children: item.label }), _jsx("span", { className: "shell-planned-badge", children: "Planned" })] }));
    }
    return (_jsx("a", { className: cls, href: item.href, children: _jsx("span", { children: item.label }) }));
}
/**
 * The one product shell every data page lives in (STYLE_GUIDE §4.2, §5): a fixed subject
 * sidebar and a sticky topbar carrying the global search.
 *
 * The sidebar names **the entity you are analysing** — the claim that the product is
 * entity-centric rather than report-centric. There is exactly one shell; do not build a second
 * nav for a new page.
 */
export function AppShell({ children, subjects = DEFAULT_SUBJECTS, actions = DEFAULT_ACTIONS, actionsSubject, reference = DEFAULT_REFERENCE, searchPlaceholder = "Ticker or CIK…", className, }) {
    return (_jsxs("div", { className: ["cf-root", "cf-shell", className].filter(Boolean).join(" "), children: [_jsxs("aside", { className: "app-side", "aria-label": "Primary navigation", children: [_jsxs("a", { className: "shell-brand", href: "/", children: [_jsx("span", { className: "shell-brand-name", children: "ClearyFi" }), _jsx("span", { className: "shell-brand-tag", children: "SEC data" })] }), _jsx("div", { className: "shell-nav-label", children: "Subjects" }), subjects.map((s) => (_jsx(NavItem, { item: s }, s.label))), actions.length ? (_jsxs(_Fragment, { children: [_jsx("div", { className: "shell-nav-label", children: actionsSubject ? `Actions · ${actionsSubject}` : "Actions" }), actions.map((a) => (_jsx(NavItem, { item: a }, a.label)))] })) : null, reference.length ? (_jsxs(_Fragment, { children: [_jsx("div", { className: "shell-nav-label", children: "Reference" }), reference.map((r) => (_jsx(NavItem, { item: r }, r.label)))] })) : null, _jsx("div", { className: "shell-side-foot", children: "Data, not investment advice." })] }), _jsxs("div", { className: "app-main", children: [_jsxs("header", { className: "app-topbar", children: [_jsxs("div", { className: "shell-search", children: [_jsx("span", { className: "shell-search-ic", children: "\u2315" }), _jsx("input", { className: "shell-search-input", placeholder: searchPlaceholder }), _jsx("span", { className: "shell-kbd", children: "\u2318K" })] }), _jsx("a", { className: "shell-apiref", href: "/docs", children: "API reference \u2197" })] }), _jsx("main", { className: "page", children: children })] })] }));
}
