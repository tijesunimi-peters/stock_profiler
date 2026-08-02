import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { STATUS_META } from "../types.js";
/**
 * The "Show your work" disclosure that any computed figure must carry (STYLE_GUIDE §8).
 *
 * Closed by default, opens in place. This is mandatory for derived numbers, not optional
 * polish: a metric without its formula, basis, and flag reason is an assertion rather than
 * evidence, and the whole product is a bet on the difference.
 */
export function Provenance({ formula, basis, restatementBasis, asOf, status, reason, open = false, className, }) {
    const flagged = status && status !== "ok" && reason;
    return (_jsxs("details", { className: ["provenance", className].filter(Boolean).join(" "), open: open, children: [_jsx("summary", { children: "Show your work" }), _jsx("div", { className: "provenance-body", children: _jsxs("dl", { style: { margin: 0 }, children: [formula ? (_jsxs(_Fragment, { children: [_jsx("dt", { children: "Formula" }), _jsx("dd", { children: formula })] })) : null, basis ? (_jsxs(_Fragment, { children: [_jsx("dt", { children: "Basis" }), _jsxs("dd", { children: [basis, restatementBasis ? ` · ${restatementBasis}` : null] })] })) : null, asOf ? (_jsxs(_Fragment, { children: [_jsx("dt", { children: "As of" }), _jsx("dd", { children: asOf })] })) : null, flagged ? (_jsxs(_Fragment, { children: [_jsxs("dt", { children: ["Why ", STATUS_META[status].tag] }), _jsx("dd", { style: { fontFamily: "var(--font-sans)" }, children: reason })] })) : null] }) })] }));
}
