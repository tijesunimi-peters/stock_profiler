import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * The shared chrome every chart wraps itself in (STYLE_GUIDE §6) — one visual dialect per page,
 * so a chart never looks like a foreign widget dropped onto the paper.
 *
 * The body scrolls horizontally rather than distorting or overflowing, and the caption slot is
 * not optional in spirit: a chart that cannot say what it excludes is a chart that misleads.
 */
export function ChartCard({ title, children, caption, note, className }) {
    return (_jsxs("figure", { className: ["plot-chart", className].filter(Boolean).join(" "), style: { margin: "4px 0 22px" }, children: [_jsx("div", { className: "plot-chart-title", children: title }), _jsx("div", { className: "plot-chart-body", children: children }), caption ? _jsx("figcaption", { className: "plot-chart-caption", children: caption }) : null, note ? _jsx("div", { className: "plot-chart-note", children: note }) : null] }));
}
