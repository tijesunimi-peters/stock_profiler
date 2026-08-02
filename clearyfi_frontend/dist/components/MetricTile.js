import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { STATUS_META, formatMetric, isDrained } from "../types.js";
/**
 * The compact snapshot tile used on a company or sector overview — denser than `MetricCard`,
 * for a grid of many figures read at a glance.
 *
 * A drained tile keeps its value slot and its status: `N/A` in muted mono at a smaller size,
 * never a blank cell. An empty-looking tile reads as "we forgot"; a drained one reads as
 * "this does not apply here", and only the second is true.
 */
export function MetricTile({ metric, expandable, move, className }) {
    const drained = isDrained(metric.status);
    const meta = STATUS_META[metric.status];
    return (_jsx("div", { className: ["mtile", drained ? "drained" : null, className].filter(Boolean).join(" "), children: _jsxs("div", { className: "mtile-face", children: [_jsx("div", { className: "mtile-label", children: metric.label }), _jsx("div", { className: ["mtile-value", expandable ? "has-cue" : null].filter(Boolean).join(" "), children: formatMetric(metric) }), _jsxs("div", { className: "mtile-foot", children: [_jsx("span", { className: `mtile-status status-${metric.status}`, title: metric.reason ?? meta.description, children: meta.glyph }), metric.basis ? _jsx("span", { className: "mtile-basis", children: metric.basis }) : null, move ? _jsx("span", { className: "mtile-move", children: move }) : null] })] }) }));
}
