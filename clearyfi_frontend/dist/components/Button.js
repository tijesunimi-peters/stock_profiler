import { jsx as _jsx } from "react/jsx-runtime";
/**
 * The action control, in the three shipped treatments (STYLE_GUIDE §4.6–4.7).
 *
 * Terracotta is the only chromatic accent for interactive elements — do not introduce a second
 * accent hue for a different action, and never use the favorability trio here.
 */
export function Button({ children, variant = "primary", href, onClick, disabled, className, }) {
    const cls = [
        variant === "inverse" ? "btn-inverse" : "btn",
        variant === "primary" ? "btn-primary" : variant === "outline" ? "btn-outline" : null,
        className,
    ]
        .filter(Boolean)
        .join(" ");
    if (href) {
        return (_jsx("a", { className: cls, href: href, children: children }));
    }
    return (_jsx("button", { type: "button", className: cls, onClick: onClick, disabled: disabled, children: children }));
}
