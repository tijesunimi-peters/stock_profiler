import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * The vertical view rail plus its viewport — used by any page with two or more views
 * (STYLE_GUIDE §5).
 *
 * A view is a **path segment** (`/company/AAPL/statements`), not a client-side tab, so Back
 * and Forward walk views the way a reader expects. One-view pages get no rail.
 */
export function ViewRail({ views, active, onChange, children, className }) {
    return (_jsxs("div", { className: ["shell-body", className].filter(Boolean).join(" "), children: [_jsxs("nav", { className: "shell-rail", "aria-label": "Views", children: [_jsx("div", { className: "shell-rail-label", children: "Views" }), views.map((v) => (_jsx("button", { type: "button", className: ["shell-rail-btn", v.value === active ? "active" : null]
                            .filter(Boolean)
                            .join(" "), onClick: () => onChange?.(v.value), children: v.label }, v.value)))] }), _jsx("div", { className: "shell-viewport", children: children })] }));
}
