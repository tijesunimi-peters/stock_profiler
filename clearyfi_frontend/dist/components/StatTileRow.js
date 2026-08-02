import { jsx as _jsx } from "react/jsx-runtime";
/** Auto-fitting row for `StatTile`s — wraps to as many columns as the container allows. */
export function StatTileRow({ children, className }) {
    return _jsx("div", { className: ["stat-tiles", className].filter(Boolean).join(" "), children: children });
}
