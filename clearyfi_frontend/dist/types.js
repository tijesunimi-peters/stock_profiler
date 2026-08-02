/**
 * Shared data shapes. These mirror the API's own canonical schema
 * (`src/secfin/normalize/schema.py`) so a design built with this DS lines up with real payloads.
 */
/** Presentation metadata for the four statuses — glyph, label, and the chip's modifier class. */
export const STATUS_META = {
    ok: {
        glyph: "●",
        tag: "OK",
        className: "chip-ok",
        description: "Trustworthy value",
    },
    approximate: {
        glyph: "≈",
        tag: "APPROX",
        className: "chip-approx",
        description: "Shown, but flagged imprecise",
    },
    na: {
        glyph: "∅",
        tag: "N/A",
        className: "chip-na",
        description: "Structurally meaningless, or absent for this period",
    },
    nm: {
        glyph: "~",
        tag: "N/M",
        className: "chip-nm",
        description: "Computable, but would mislead",
    },
};
/** `true` when the value must render drained rather than as a number. */
export function isDrained(status) {
    return status === "na" || status === "nm";
}
/**
 * Format a metric for display, honestly.
 *
 * Returns the drained token (`N/A` / `N/M`) whenever the status says so — this function will
 * never turn a missing value into `0`. Negatives use accounting parentheses (STYLE_GUIDE §2).
 */
export function formatMetric(mv) {
    if (mv.display)
        return mv.display;
    if (isDrained(mv.status) || mv.value === null || mv.value === undefined) {
        return STATUS_META[isDrained(mv.status) ? mv.status : "na"].tag;
    }
    const v = mv.value;
    const unit = mv.unit ?? "";
    if (unit === "ratio") {
        // Ratios that read as percentages (margins, growth) vs. multiples (current ratio).
        return Math.abs(v) <= 5 ? `${(v * 100).toFixed(1)}%` : `${v.toFixed(2)}×`;
    }
    const neg = v < 0;
    const a = Math.abs(v);
    let out;
    if (a >= 1e12)
        out = `${(a / 1e12).toFixed(1)}T`;
    else if (a >= 1e9)
        out = `${(a / 1e9).toFixed(1)}B`;
    else if (a >= 1e6)
        out = `${(a / 1e6).toFixed(1)}M`;
    else if (a >= 1e3)
        out = `${(a / 1e3).toFixed(1)}K`;
    else
        out = String(Math.round(a * 100) / 100);
    if (unit.startsWith("USD"))
        out = `$${out}`;
    return neg ? `(${out})` : out;
}
