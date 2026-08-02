import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { ChartCard } from "./ChartCard.js";
function quantile(sorted, q) {
    const pos = (sorted.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    const next = sorted[base + 1];
    return next !== undefined ? sorted[base] + rest * (next - sorted[base]) : sorted[base];
}
/**
 * Where one company sits among its peers — the descriptive core of peer comparison.
 *
 * Three honesty properties are built in, and all three are load-bearing:
 *
 * 1. **Peers with no comparable value are excluded and counted** in the caption. Silently
 *    dropping them would overstate how complete the comparison is.
 * 2. **Every mark takes the same fill.** The focal company is distinguished by *shape and
 *    size*, never by being the only colored dot — position is the message, and a colored mark
 *    would read as a verdict (STYLE_GUIDE §6, §9.2).
 * 3. **A single comparable filer draws no median and no middle-half band**, and says so — a
 *    distribution of one is not a distribution.
 */
export function DistributionStrip({ peers, focalId, title, caption, format = (v) => v.toFixed(1), axisLabels = false, width = 560, height = 66, className, }) {
    const comparable = peers.filter((p) => p.value !== null && p.value !== undefined);
    const excluded = peers.length - comparable.length;
    const notes = [];
    if (excluded > 0) {
        notes.push(`${excluded} of ${peers.length} peers have no comparable value and are excluded.`);
    }
    if (comparable.length === 1) {
        notes.push("Only one comparable filer — no median or middle-half band is drawn.");
    }
    const fullCaption = [caption, ...notes].filter(Boolean).join(" ");
    if (!comparable.length) {
        return (_jsx(ChartCard, { title: title, caption: fullCaption || undefined, className: className, children: _jsxs("div", { className: "state", style: { padding: "18px 20px" }, children: [_jsx("div", { className: "state-title", children: "Nothing comparable yet" }), _jsx("div", { className: "state-copy", children: "No peer in this group reports a comparable value for this metric." })] }) }));
    }
    const values = comparable.map((p) => p.value).sort((a, b) => a - b);
    const min = values[0];
    const max = values[values.length - 1];
    const span = max - min || 1;
    const pad = 18;
    const plotW = width - pad * 2;
    const midY = height / 2;
    const x = (v) => pad + ((v - min) / span) * plotW;
    const showBand = comparable.length > 1;
    const q1 = showBand ? quantile(values, 0.25) : 0;
    const q3 = showBand ? quantile(values, 0.75) : 0;
    const median = showBand ? quantile(values, 0.5) : values[0];
    const focal = comparable.find((p) => p.id === focalId);
    return (_jsx(ChartCard, { title: title, caption: fullCaption || undefined, className: className, children: _jsxs("svg", { className: "dist-strip", width: width, height: axisLabels ? height + 18 : height, viewBox: `0 0 ${width} ${axisLabels ? height + 18 : height}`, role: "img", "aria-label": `${title}: ${comparable.length} comparable filers`, children: [showBand ? (_jsx("rect", { x: x(q1), y: midY - 13, width: Math.max(x(q3) - x(q1), 1), height: 26, rx: 4, fill: "var(--border-tint)" })) : null, showBand ? (_jsx("line", { x1: x(median), x2: x(median), y1: midY - 16, y2: midY + 16, stroke: "var(--ink-soft)", strokeWidth: 1.5 })) : null, comparable.map((p) => (_jsx("circle", { className: "dist-strip-dot", cx: x(p.value), cy: midY, r: 4, fill: "var(--ink-soft)", children: _jsx("title", { children: `${p.label} — ${format(p.value)}` }) }, p.id))), focal ? (_jsx("g", { transform: `translate(${x(focal.value)}, ${midY}) rotate(45)`, children: _jsx("rect", { x: -6, y: -6, width: 12, height: 12, fill: "var(--ink)", rx: 1.5, children: _jsx("title", { children: `${focal.label} — ${format(focal.value)}` }) }) })) : null, axisLabels ? (_jsxs(_Fragment, { children: [_jsx("text", { className: "dist-strip-axis", x: pad, y: height + 12, textAnchor: "start", children: format(min) }), showBand ? (_jsx("text", { className: "dist-strip-axis is-median", x: x(median), y: height + 12, textAnchor: "middle", children: format(median) })) : null, _jsx("text", { className: "dist-strip-axis", x: width - pad, y: height + 12, textAnchor: "end", children: format(max) })] })) : null] }) }));
}
