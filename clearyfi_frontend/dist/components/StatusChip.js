import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { STATUS_META } from "../types.js";
/**
 * The status marker that rides alongside every metric and derived value (STYLE_GUIDE §7).
 *
 * Distinguished by **glyph + label + border style**, never by color alone — the accent and the
 * flag color are both warm, so color-only status would be unreadable as well as inaccessible.
 * Solid border = `na` (hard structural), dashed = `nm` (soft judgment); keep that distinction.
 */
export function StatusChip({ status, glyphOnly = false, className }) {
    const meta = STATUS_META[status];
    return (_jsxs("span", { className: ["chip", meta.className, className].filter(Boolean).join(" "), title: meta.description, children: [_jsx("span", { className: "glyph", "aria-hidden": "true", children: meta.glyph }), glyphOnly ? _jsx("span", { className: "sr-only", children: meta.tag }) : meta.tag] }));
}
