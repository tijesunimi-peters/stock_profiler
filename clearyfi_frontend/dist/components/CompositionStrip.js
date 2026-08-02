import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
/** A single-hue ramp: these bands are parts of one quantity, so they don't get separate hues. */
const RAMP = ["#c0703a", "#cd8b5e", "#dba784", "#e8c3aa", "#efe9de"];
/**
 * A 100%-stacked part-to-whole bar — concentration at a glance (top 1 / top 2–5 / top 6–10 /
 * other).
 *
 * Labels sit inside a band only when it is wide enough to hold them, and drop to the legend
 * otherwise; a clipped label is worse than an outside one. Bands share a single-hue ramp
 * because they are parts of one magnitude — a categorical palette here would imply the bands
 * are unrelated entities.
 */
export function CompositionStrip({ segments, insideLabelMin = 0.14, className, }) {
    const total = segments.reduce((sum, s) => sum + s.share, 0) || 1;
    const outside = segments.filter((s) => s.share / total < insideLabelMin);
    return (_jsxs("div", { className: ["composition-block", className].filter(Boolean).join(" "), children: [_jsx("div", { className: "composition-strip-bar", children: segments.map((seg, i) => {
                    const pct = (seg.share / total) * 100;
                    const color = seg.color ?? RAMP[i % RAMP.length];
                    return (_jsx("div", { className: "composition-strip-seg", style: { width: `${pct}%`, background: color }, title: `${seg.label} — ${pct.toFixed(1)}%`, children: seg.share / total >= insideLabelMin ? (_jsxs("span", { className: "composition-strip-seg-label", style: { color: i > 2 ? "var(--ink)" : "#fff" }, children: [seg.label, " ", pct.toFixed(1), "%"] })) : null }, seg.label));
                }) }), outside.length ? (_jsx("div", { className: "composition-strip-outside", children: outside.map((seg) => {
                    const i = segments.indexOf(seg);
                    return (_jsxs("span", { className: "composition-strip-outside-item", children: [_jsx("span", { className: "composition-strip-swatch", style: { background: seg.color ?? RAMP[i % RAMP.length] } }), seg.label, " ", ((seg.share / total) * 100).toFixed(1), "%"] }, seg.label));
                }) })) : null] }));
}
