import { jsx as _jsx } from "react/jsx-runtime";
/**
 * The hairline-ruled grid `MetricTile`s sit in — one bordered block rather than separate
 * floating cards, which is what makes a dense snapshot read as a single instrument panel.
 */
export function MetricTileGrid({ children, className }) {
    return _jsx("div", { className: ["mtile-grid", className].filter(Boolean).join(" "), children: children });
}
