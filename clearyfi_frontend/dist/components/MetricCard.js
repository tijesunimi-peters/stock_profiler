import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { formatMetric, isDrained } from "../types.js";
import { StatusChip } from "./StatusChip.js";
import { Provenance } from "./Provenance.js";
/**
 * The primary metric surface (STYLE_GUIDE §6): name + status chip, big mono value with its
 * basis tag, an optional caveat note, and built-in provenance.
 *
 * An `na`/`nm` metric renders the **drained token** on tint with no shadow — visibly present,
 * visibly not a number. It is never rendered as `0`, blank, or a guess; that rule outranks
 * every aesthetic consideration in this system.
 */
export function MetricCard({ metric, formula, provenanceOpen, className }) {
    const drained = isDrained(metric.status);
    return (_jsxs("div", { className: ["metric-card", drained ? "na" : null, className].filter(Boolean).join(" "), children: [_jsxs("div", { className: "metric-head", children: [_jsx("span", { className: "metric-name", children: metric.label }), _jsx(StatusChip, { status: metric.status })] }), _jsx("div", { className: ["metric-value", drained ? "drained" : null].filter(Boolean).join(" "), children: formatMetric(metric) }), metric.basis ? _jsx("div", { className: "metric-basis", children: metric.basis }) : null, metric.status === "approximate" && metric.reason ? (_jsx("div", { className: "metric-note", children: metric.reason })) : null, _jsx("div", { className: "metric-actions", children: _jsx(Provenance, { formula: formula, basis: metric.basis, restatementBasis: metric.restatementBasis, asOf: metric.asOf, status: metric.status, reason: metric.reason, open: provenanceOpen }) })] }));
}
