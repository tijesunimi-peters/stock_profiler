import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * The control bar for a page with a single focal entity — company, manager, sector.
 *
 * Its job is to answer "what am I looking at, and how old is it?" before the reader scrolls.
 * An unresolved cell renders a drained `—`; that is deliberate, and it is why this component
 * takes `null` rather than making the caller decide what to substitute.
 */
export function EntityBar({ cells, className }) {
    return (_jsx("div", { className: ["shell-entity", className].filter(Boolean).join(" "), children: cells.map((cell, i) => (_jsxs("div", { className: "shell-entity-cell", children: [_jsx("div", { className: "shell-entity-label", children: cell.label }), _jsx("div", { className: [
                        "shell-entity-value",
                        cell.primary ? "is-primary" : null,
                        cell.mono && !cell.primary ? "is-mono" : null,
                        cell.value === null ? "is-pending" : null,
                    ]
                        .filter(Boolean)
                        .join(" "), children: cell.value ?? "—" })] }, `${cell.label}-${i}`))) }));
}
