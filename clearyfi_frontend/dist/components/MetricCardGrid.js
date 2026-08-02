import { jsx as _jsx } from "react/jsx-runtime";
/**
 * The responsive grid metric cards live in — fluid down to one column, capped at four across
 * so a wide page never strings cards into an unreadable row (STYLE_GUIDE §3).
 *
 * Always use it rather than a bare flex row: the `gap`-based rhythm is what keeps card grids
 * aligned across different pages.
 */
export function MetricCardGrid({ children, className }) {
    return _jsx("div", { className: ["card-grid", className].filter(Boolean).join(" "), children: children });
}
