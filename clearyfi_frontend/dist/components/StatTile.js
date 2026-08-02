import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * A compact single-figure tile for concentration and coverage stats — the summary numbers that
 * sit above a chart rather than inside it.
 *
 * Lighter than `MetricCard`: no status chip, no provenance. Use it for descriptive counts and
 * shares; anything **derived** needs the full card so it can show its work.
 */
export function StatTile({ label, value, note, drained, className }) {
    return (_jsxs("div", { className: ["stat-tile", className].filter(Boolean).join(" "), children: [_jsx("div", { className: "stat-tile-label", children: label }), _jsx("div", { className: ["stat-tile-value", drained ? "drained" : null].filter(Boolean).join(" "), children: value }), note ? _jsx("div", { className: "stat-tile-note", children: note }) : null] }));
}
