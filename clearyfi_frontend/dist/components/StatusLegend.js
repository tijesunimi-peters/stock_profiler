import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { STATUS_META } from "../types.js";
import { StatusChip } from "./StatusChip.js";
const ORDER = ["ok", "approximate", "na", "nm"];
/**
 * Explains all four status tokens. **Required near the top of any page that shows metrics**
 * (STYLE_GUIDE §7) — the vocabulary is a product feature, not decoration, so it gets defined
 * where the reader meets it rather than in a help page they will never open.
 */
export function StatusLegend({ statuses = ORDER, className }) {
    return (_jsx("div", { className: ["legend", className].filter(Boolean).join(" "), children: statuses.map((s) => (_jsxs("span", { className: "legend-item", children: [_jsx(StatusChip, { status: s }), _jsx("span", { className: "desc", children: STATUS_META[s].description })] }, s))) }));
}
