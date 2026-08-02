import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const GLYPH = { up: "▲", flat: "▬", down: "▼" };
const CLS = { up: "pos", flat: "flat", down: "neg" };
/**
 * The scoped favorability chip for a sector score's direction (STYLE_GUIDE §1).
 *
 * This is the **one sanctioned exception** to "terracotta is the only chromatic accent", and it
 * comes with three rules that are not negotiable:
 *
 * 1. Only for favorability of direction on a sector score — **not** a general good/bad palette.
 * 2. Always paired with a **glyph** and a **number**, so meaning never rests on color alone.
 * 3. The underlying score is a **position relative to other sectors**, not a verdict and never
 *    a buy/sell signal.
 *
 * The palette is a muted moss/amber/brick trio precisely so it does not read as a green-red
 * stoplight. Do not swap in saturated colors.
 */
export function FavorabilityDelta({ direction, value, context, className, }) {
    return (_jsxs("span", { className: ["pa-tile-delta", CLS[direction], className].filter(Boolean).join(" "), children: [_jsx("span", { "aria-hidden": "true", children: GLYPH[direction] }), _jsx("span", { children: value }), context ? _jsx("span", { style: { color: "var(--mono-muted)" }, children: context }) : null] }));
}
