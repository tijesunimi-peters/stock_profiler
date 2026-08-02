import { jsx as _jsx } from "react/jsx-runtime";
/**
 * The period / view switcher (STYLE_GUIDE §4.6): 1.5px border, 8px radius, active segment
 * filled terracotta with white text.
 *
 * Use it for a small set of mutually exclusive views — fiscal period, statement type, window
 * length. Beyond about five options it stops scanning well; use the view rail instead.
 */
export function SegmentedControl({ options, value, onChange, className }) {
    return (_jsx("div", { className: ["segmented", className].filter(Boolean).join(" "), role: "tablist", children: options.map((opt) => (_jsx("button", { type: "button", role: "tab", "aria-selected": opt.value === value, className: opt.value === value ? "on" : undefined, onClick: () => onChange?.(opt.value), children: opt.label }, opt.value))) }));
}
