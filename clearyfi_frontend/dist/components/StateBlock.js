import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
const DEFAULTS = {
    loading: { title: "Loading", copy: "Fetching the latest filing data." },
    empty: {
        title: "Nothing mapped",
        copy: "A filing is on record for this period, but none of its fields map to our canonical schema yet.",
    },
    notFound: { title: "HTTP 404", copy: "We don't carry that entity. Check the ticker, or try a raw CIK." },
    error: { title: "Request failed", copy: "Something went wrong upstream. Try again in a moment." },
};
/**
 * The four shared non-data states (STYLE_GUIDE §6).
 *
 * The `empty` copy matters more than it looks: **empty is not "nothing was filed"**. Coverage
 * has real floors (XBRL from ~2009–2012, 13D/G structured XML from ~mid-2025), and a state
 * that silently implies absence of filings rather than absence of coverage is a lie by layout.
 */
export function StateBlock({ variant, title, copy, recovery = [], coldNote, className, }) {
    const d = DEFAULTS[variant];
    const isErr = variant === "notFound" || variant === "error";
    return (_jsxs("div", { className: ["state", variant === "loading" ? "state-loading" : null, className]
            .filter(Boolean)
            .join(" "), children: [_jsxs("div", { className: ["state-title", isErr ? "err" : null].filter(Boolean).join(" "), children: [variant === "loading" ? _jsx("span", { className: "dot" }) : null, variant === "notFound" ? (_jsx("span", { className: "http-code", children: title ?? d.title })) : ((title ?? d.title))] }), _jsx("div", { className: "state-copy", children: copy ?? d.copy }), variant === "loading" ? (_jsxs(_Fragment, { children: [_jsx("div", { className: "shimmer", style: { width: "72%" } }), _jsx("div", { className: "shimmer", style: { width: "54%" } }), coldNote ? _jsx("div", { className: "cold-note", children: coldNote }) : null] })) : null, recovery.length ? (_jsx("div", { className: "recovery-chips", children: recovery.map((r) => (_jsx("a", { className: "recovery-chip", href: r.href, children: r.label }, r.href))) })) : null] }));
}
