/**
 * Shared data shapes. These mirror the API's own canonical schema
 * (`src/secfin/normalize/schema.py`) so a design built with this DS lines up with real payloads.
 */

/**
 * The four-token status vocabulary (STYLE_GUIDE §7). Maps 1:1 onto `MetricValue.status`.
 *
 * - `ok` — trustworthy value
 * - `approximate` — shown, but flagged imprecise; the number is still useful
 * - `na` — structurally meaningless for this filer, or absent for this period
 * - `nm` — computable, but would mislead (e.g. growth off a negative base)
 *
 * **Never invent a fifth token**, and never render `na`/`nm` as `0`, blank, or a guess.
 */
export type MetricStatus = "ok" | "approximate" | "na" | "nm";

/** Whether a figure is a trailing-twelve-month flow or a point-in-time balance. */
export type MetricBasis = "TTM" | "as-of";

/** Everything we serve today is `as-restated`; the axis is stated, never selectable. */
export type RestatementBasis = "as-restated" | "as-originally-reported";

/**
 * One metric, with the provenance needed to show your work.
 *
 * `value` is `null` whenever `status` is `na` or `nm` — that is the honest representation, and
 * the components render the drained token rather than substituting a number.
 */
export interface MetricValue {
  /** Machine key, e.g. `net_margin`. */
  metric?: string;
  /** Human label, e.g. `Net Margin`. */
  label: string;
  /** Raw reported value in its own unit, or `null` when not applicable/meaningful. */
  value: number | null;
  /** Pre-formatted display string. Overrides the built-in formatter when supplied. */
  display?: string;
  /** Raw unit as reported — `ratio`, `USD`, `shares`, `USD/shares`. */
  unit?: string;
  basis?: MetricBasis;
  restatementBasis?: RestatementBasis;
  /** Filing date this value is current as of (ISO `YYYY-MM-DD`). */
  asOf?: string;
  status: MetricStatus;
  /** Why the value is flagged. Required reading for anything not `ok` (§9.11). */
  reason?: string | null;
  /** Optional short series for an inline sparkline. */
  trend?: MetricTrendPoint[];
}

/** One point in a metric's history. A `null` value is a gap — a line must BREAK, never interpolate. */
export interface MetricTrendPoint {
  /** Period label, e.g. `Q3` or `FY2024`. */
  period: string;
  value: number | null;
  status?: MetricStatus;
}

/** Presentation metadata for the four statuses — glyph, label, and the chip's modifier class. */
export const STATUS_META: Record<
  MetricStatus,
  { glyph: string; tag: string; className: string; description: string }
> = {
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
export function isDrained(status: MetricStatus): boolean {
  return status === "na" || status === "nm";
}

/**
 * Format a metric for display, honestly.
 *
 * Returns the drained token (`N/A` / `N/M`) whenever the status says so — this function will
 * never turn a missing value into `0`. Negatives use accounting parentheses (STYLE_GUIDE §2).
 */
export function formatMetric(mv: Pick<MetricValue, "value" | "unit" | "status" | "display">): string {
  if (mv.display) return mv.display;
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
  let out: string;
  if (a >= 1e12) out = `${(a / 1e12).toFixed(1)}T`;
  else if (a >= 1e9) out = `${(a / 1e9).toFixed(1)}B`;
  else if (a >= 1e6) out = `${(a / 1e6).toFixed(1)}M`;
  else if (a >= 1e3) out = `${(a / 1e3).toFixed(1)}K`;
  else out = String(Math.round(a * 100) / 100);

  if (unit.startsWith("USD")) out = `$${out}`;
  return neg ? `(${out})` : out;
}
