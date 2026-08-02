/**
 * Display formatting. Rounds to sensible precision and uses tabular figures everywhere
 * (00 §8) — the components already set `font-variant-numeric`, this side just has to not
 * emit float artifacts.
 */

export type Unit = "pct" | "pp" | "x" | "days" | "usd" | "usdm" | "count" | "ratio" | "score";

const NBSP = " ";

export function fmt(value: number | null, unit: Unit = "ratio", dp?: number): string {
  if (value == null || !Number.isFinite(value)) return "—";
  switch (unit) {
    case "pct":
      return `${round(value, dp ?? 1)}%`;
    case "pp":
      return `${signed(round(value, dp ?? 1))}pp`;
    case "x":
      return `${round(value, dp ?? 1)}×`;
    case "days":
      return `${round(value, dp ?? 0)}${NBSP}d`;
    case "usd":
      return usd(value, dp ?? 0);
    case "usdm":
      return usdCompact(value);
    case "count":
      return round(value, dp ?? 0).toLocaleString("en-US");
    case "score":
      return String(Math.round(value));
    default:
      return String(round(value, dp ?? 2));
  }
}

export function round(v: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}

export function signed(v: number): string {
  // Minus sign, not hyphen — it aligns in tabular figures.
  return v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : "0";
}

export function usd(v: number, dp = 0): string {
  const neg = v < 0;
  const s = Math.abs(v).toLocaleString("en-US", {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
  // Accounting parentheses for negatives, matching the DS formatter.
  return neg ? `($${s})` : `$${s}`;
}

/** $1.24B / $312M / $4.1K — for figures spanning orders of magnitude. */
export function usdCompact(v: number): string {
  const neg = v < 0;
  const a = Math.abs(v);
  const [n, suffix] =
    a >= 1e12
      ? [a / 1e12, "T"]
      : a >= 1e9
        ? [a / 1e9, "B"]
        : a >= 1e6
          ? [a / 1e6, "M"]
          : a >= 1e3
            ? [a / 1e3, "K"]
            : [a, ""];
  const s = `$${round(n, n < 10 ? 2 : n < 100 ? 1 : 0)}${suffix}`;
  return neg ? `(${s})` : s;
}

export function compact(v: number): string {
  const a = Math.abs(v);
  const [n, suffix] =
    a >= 1e9 ? [v / 1e9, "B"] : a >= 1e6 ? [v / 1e6, "M"] : a >= 1e3 ? [v / 1e3, "K"] : [v, ""];
  return `${round(n, a >= 1e3 && Math.abs(n) < 10 ? 1 : 0)}${suffix}`;
}

/** `3rd of 11` — the rank badge's ordinal (00 §3a). */
export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** `82nd pctile` */
export function pctile(n: number): string {
  return `${ordinal(n)} pctile`;
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** `12 Mar 2026` — filing dates read better than ISO in prose rows. */
export function humanDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getUTCDate()} ${
    ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][
      d.getUTCMonth()
    ]
  } ${d.getUTCFullYear()}`;
}

/** Whole days between two ISO dates. */
export function daysBetween(a: string, b: string): number {
  const t1 = Date.parse(`${a}T00:00:00Z`);
  const t2 = Date.parse(`${b}T00:00:00Z`);
  return Math.round((t2 - t1) / 86400000);
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
