import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { FavorabilityDelta } from "./FavorabilityDelta.js";
/**
 * A sector's composite theme score (sector overview scorecard).
 *
 * The score number itself stays **neutral ink** with a dashed cue — it is deliberately not
 * given a saturated fill, because a colored 82 reads as "good" and the number does not mean
 * that. Only the *direction* chip carries the favorability tint, and only alongside a glyph
 * and a figure (STYLE_GUIDE §1).
 */
export function SectorScoreTile({ sector, score, direction, delta, theme, coverage, className, }) {
    return (_jsxs("div", { className: ["pa-tile", className].filter(Boolean).join(" "), children: [_jsx("div", { className: "pa-tile-name", children: sector }), _jsxs("div", { className: "pa-tile-scorerow", children: [_jsx("span", { className: "pa-tile-score has-cue", children: score }), direction && delta ? _jsx(FavorabilityDelta, { direction: direction, value: delta }) : null] }), _jsxs("div", { className: "mtile-foot", children: [theme ? _jsx("span", { children: theme }) : null, coverage ? _jsx("span", { children: coverage }) : null] })] }));
}
