import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Fragment } from "react";
/**
 * The control bar for a page with a single focal entity — company, manager, sector.
 *
 * Its job is to answer "what am I looking at, and how old is it?" before the reader scrolls.
 * An unresolved cell renders a drained `—`; that is deliberate, and it is why this component
 * takes `null` rather than making the caller decide what to substitute.
 */
export function EntityBar({ cells, note, footer, className }) {
    return (_jsxs("div", { className: ["shell-entity", className].filter(Boolean).join(" "), children: [_jsxs("div", { className: "shell-entity-row", children: [cells.map((cell, i) => (_jsxs(Fragment, { children: [i > 0 ? _jsx("div", { className: "shell-entity-sep" }) : null, _jsxs("div", { className: "shell-entity-cell", children: [_jsx("div", { className: "shell-entity-label", children: cell.label }), _jsxs("div", { className: [
                                            "shell-entity-value",
                                            cell.primary ? "is-primary" : null,
                                            cell.mono && !cell.primary ? "is-mono" : null,
                                            cell.value === null ? "is-pending" : null,
                                        ]
                                            .filter(Boolean)
                                            .join(" "), children: [cell.swatch ? (_jsx("span", { className: "shell-entity-swatch", style: { background: cell.swatch } })) : null, cell.value ?? "—"] })] })] }, `${cell.label}-${i}`))), note ? (_jsxs(_Fragment, { children: [_jsx("div", { className: "shell-entity-spacer" }), _jsx("span", { className: "shell-entity-note", children: note })] })) : null] }), footer ? _jsx("div", { className: "shell-entity-foot", children: footer }) : null] }));
}
