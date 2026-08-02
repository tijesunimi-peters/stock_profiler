import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * The vertical view rail plus its viewport — used by any page with two or more views
 * (STYLE_GUIDE §5).
 *
 * A view is a **path segment** (`/company/AAPL/statements`), not a client-side tab, so Back
 * and Forward walk views the way a reader expects. One-view pages get no rail.
 */
export function ViewRail({ views, active, onChange, label = "Views", sections, sectionsLabel = "Sections", note, width, children, className, }) {
    return (_jsxs("div", { className: ["shell-body", className].filter(Boolean).join(" "), children: [_jsxs("nav", { className: "shell-rail", "aria-label": label, style: width ? { width: `${width}px` } : undefined, children: [_jsx("div", { className: "shell-rail-label", children: label }), views.map((v) => (_jsx("button", { type: "button", className: ["shell-rail-btn", v.value === active ? "active" : null]
                            .filter(Boolean)
                            .join(" "), onClick: () => onChange?.(v.value), children: v.label }, v.value))), sections?.length ? (_jsxs(_Fragment, { children: [_jsx("div", { className: "shell-rail-rule" }), _jsx("div", { className: "shell-rail-label", children: sectionsLabel }), _jsx("div", { className: "shell-rail-sections", children: sections.map((s) => (_jsxs("a", { href: s.href, className: ["shell-rail-sec", s.current ? "active" : null]
                                        .filter(Boolean)
                                        .join(" "), children: [_jsx("span", { className: "shell-rail-sec-n", children: s.n }), _jsx("span", { children: s.label })] }, s.href))) })] })) : null, note ? (_jsxs(_Fragment, { children: [_jsx("div", { className: "shell-rail-rule" }), _jsx("div", { className: "shell-rail-note", children: note })] })) : null] }), _jsx("div", { className: "shell-viewport", children: children })] }));
}
