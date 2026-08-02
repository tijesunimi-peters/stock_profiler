/**
 * ⚠️ DEPRECATED — the PRE-PORT synthetic catalog. Do not wire anything new to it.
 *
 * Superseded by the ported fixtures (`hub.ts`, `insider.ts`, `peers.ts`, `qualitative.ts`,
 * `manager.ts`, `prototype.ts`), which are the figures the accepted design was drawn against.
 * As of P0b **no view or page reads this module** — every surface goes through `data/api.ts`.
 *
 * Kept rather than deleted (operator, 2026-08-02). Two reasons it earns its keep:
 *
 *   * Its TYPES are still the shape several seam payloads are written against, so deleting it is
 *     a wider change than it looks.
 *   * It is the only place some of the honesty copy exists in full — the reason strings that
 *     distinguish "does not apply" from "we have nothing". That wording is worth having to hand
 *     when Phase A writes the real empty states, and re-deriving it from scratch would be worse
 *     than reading it.
 *
 * **If you are adding a view: use `data/api.ts`.** If you are removing the last reference to a
 * symbol here, leave the symbol — this file goes when Phase A is finished, not before.
 */
/**
 * The metric engine — the one place a number is produced.
 *
 * Everything downstream (scorecard, decomposition, distribution strips, peer dots, company
 * tiles, compare bars) reads from these functions, so the figures on two views of the same
 * subject cannot disagree. That is RECONCILIATION §4.4 ("one fact, one source"), and most of
 * the prototype's bug fixes were violations of it.
 *
 * The composite scoring function is a clearly-labeled PLACEHOLDER (00 §9): percentile of the
 * sector's median against the other sectors, favorability-adjusted, weighted-averaged. It is
 * not a final method and every surface that shows a score says so.
 */
import type { MetricStatus, MetricValue } from "@ds";
import { fmt, round, signed } from "../lib/format";
import { chance, percentileOf, quantiles, sd, walk } from "../lib/seed";
import {
  FILERS,
  METRIC_BY_KEY,
  METRICS,
  SECTORS,
  THEME_BY_KEY,
  type MetricDef,
  type ThemeKey,
  filersOfSector,
  trailingQuarters,
} from "./catalog";

/** Plausible centre and spread per metric, in the metric's own display unit. */
const SHAPE: Record<string, { centre: number; spread: number; floor?: number }> = {
  gross_margin: { centre: 48, spread: 14, floor: 5 },
  operating_margin: { centre: 22, spread: 15 },
  net_margin: { centre: 17, spread: 13 },
  roa: { centre: 9, spread: 6 },
  roe: { centre: 18, spread: 11 },
  roic: { centre: 14, spread: 8 },
  rev_growth_yoy: { centre: 8, spread: 22 },
  rev_growth_qoq: { centre: 2, spread: 9 },
  rev_cagr_3y: { centre: 11, spread: 12 },
  growth_dispersion: { centre: 31, spread: 12, floor: 4 },
  debt_equity: { centre: 0.62, spread: 0.5, floor: 0 },
  net_debt_ebitda: { centre: 1.6, spread: 1.6 },
  interest_coverage: { centre: 12, spread: 10, floor: 0.2 },
  current_ratio: { centre: 2.4, spread: 1.1, floor: 0.4 },
  quick_ratio: { centre: 1.7, spread: 0.9, floor: 0.2 },
  ocf_margin: { centre: 26, spread: 13 },
  fcf_margin: { centre: 18, spread: 12 },
  fcf_conversion: { centre: 92, spread: 35, floor: 0 },
  capex_intensity: { centre: 8, spread: 6, floor: 0.3 },
  rd_intensity: { centre: 17, spread: 9, floor: 0 },
  inventory_turnover: { centre: 3.6, spread: 1.8, floor: 0.3 },
  dso: { centre: 58, spread: 22, floor: 8 },
  dpo: { centre: 47, spread: 18, floor: 6 },
  cash_conversion_cycle: { centre: 86, spread: 44 },
  asset_turnover: { centre: 0.68, spread: 0.32, floor: 0.05 },
  revenue_per_employee: { centre: 690000, spread: 380000, floor: 60000 },
  restatement_rate: { centre: 2.1, spread: 1.8, floor: 0 },
  material_weakness_rate: { centre: 3.4, spread: 2.6, floor: 0 },
  late_filing_rate: { centre: 4.2, spread: 3.4, floor: 0 },
  accruals_ratio: { centre: 2.6, spread: 3.2 },
  net_entrants: { centre: 3, spread: 6 },
  ma_activity: { centre: 9, spread: 7, floor: 0 },
  insider_net: { centre: 0.7, spread: 0.6, floor: 0.02 },
  institutional_flow: { centre: 1.1, spread: 3.4 },
};

function clampFloor(key: string, v: number): number {
  const f = SHAPE[key]?.floor;
  return f == null ? v : Math.max(f, v);
}

/** The sector's own offset from the metric's global centre. Stable per (sector, metric). */
function sectorOffset(sectorId: string, key: string): number {
  const s = SHAPE[key];
  return sd(`sector:${sectorId}:${key}`, -s.spread * 0.7, s.spread * 0.7, 4);
}

/** A period's drift, so trailing quarters move rather than repeat. */
function periodDrift(period: string, key: string): number {
  const s = SHAPE[key];
  return sd(`period:${period}:${key}`, -s.spread * 0.22, s.spread * 0.22, 4);
}

/**
 * Whether a filer tags this concept at all.
 *
 * An untagged concept is `na` with a REASON, never 0 — and the reason distinguishes a
 * structural absence from missing data (RECONCILIATION §4.3).
 */
function tagging(symbol: string, key: string): { status: MetricStatus; reason: string | null } {
  const def = METRIC_BY_KEY[key];
  if (!chance(`tagged:${symbol}:${key}`, 0.91)) {
    return {
      status: "na",
      reason:
        key === "revenue_per_employee"
          ? "This filer does not state an employee count in Item 1, so the ratio has no denominator."
          : `${def.label} is not tagged in this filer's XBRL for the period — the line item is absent, not zero.`,
    };
  }
  if (chance(`approx:${symbol}:${key}`, 0.08)) {
    return {
      status: "approximate",
      reason: `Derived from a company extension tag rather than a standard US-GAAP element, so it is less comparable across filers.`,
    };
  }
  return { status: "ok", reason: null };
}

export interface FilerMetric {
  key: string;
  def: MetricDef;
  value: number | null;
  status: MetricStatus;
  reason: string | null;
  display: string;
}

/** One filer's value for one metric in one period. */
export function filerMetric(symbol: string, key: string, period: string): FilerMetric {
  const def = METRIC_BY_KEY[key];
  const s = SHAPE[key];
  const filer = FILERS.find((f) => f.symbol === symbol);
  const { status, reason } = tagging(symbol, key);
  if (status === "na") {
    return { key, def, value: null, status, reason, display: "N/A" };
  }
  const base =
    s.centre +
    sectorOffset(filer?.sector ?? "semis", key) +
    periodDrift(period, key) +
    sd(`filer:${symbol}:${key}`, -s.spread, s.spread, 4);
  const value = clampFloor(key, round(base, key === "revenue_per_employee" ? 0 : 3));
  return { key, def, value, status, reason, display: fmt(value, def.unit) };
}

/** Every filer's value for one metric — the input to a distribution strip. */
export function peerValues(
  sectorId: string,
  key: string,
  period: string,
  subIndustry?: string | null,
): { symbol: string; name: string; value: number | null; status: MetricStatus }[] {
  return filersOfSector(sectorId, subIndustry).map((f) => {
    const m = filerMetric(f.symbol, key, period);
    return { symbol: f.symbol, name: f.name, value: m.value, status: m.status };
  });
}

export interface Distribution {
  key: string;
  def: MetricDef;
  lo: number;
  q1: number;
  med: number;
  q3: number;
  hi: number;
  n: number;
  excluded: number;
}

/**
 * The sector's distribution for one metric.
 *
 * For the sector we hold filers for, this is the real spread of the values every other view
 * renders. For the other ten sectors there is no filer list, so a sector-level draw stands in —
 * and the caller is told which it got via `n`.
 */
export function distribution(
  sectorId: string,
  key: string,
  period: string,
  subIndustry?: string | null,
): Distribution {
  const def = METRIC_BY_KEY[key];
  const peers = peerValues(sectorId, key, period, subIndustry);
  if (peers.length) {
    const q = quantiles(peers.map((p) => p.value));
    return { key, def, ...q };
  }
  const s = SHAPE[key];
  const med = clampFloor(key, s.centre + sectorOffset(sectorId, key) + periodDrift(period, key));
  const iqr = Math.abs(sd(`iqr:${sectorId}:${key}`, s.spread * 0.4, s.spread * 1.1, 3));
  return {
    key,
    def,
    lo: clampFloor(key, med - iqr * 1.8),
    q1: clampFloor(key, med - iqr * 0.5),
    med,
    q3: clampFloor(key, med + iqr * 0.5),
    hi: clampFloor(key, med + iqr * 1.8),
    n: SECTORS.find((x) => x.id === sectorId)?.filers ?? 0,
    excluded: 0,
  };
}

export function sectorMedian(sectorId: string, key: string, period: string): number {
  return distribution(sectorId, key, period).med;
}

/**
 * Favorability-adjusted percentile of a sector's median against every other sector.
 *
 * `favorability: "none"` returns `null` — there is no direction to adjust toward, so the metric
 * is excluded from scoring rather than given an arbitrary one.
 */
export function sectorPercentile(sectorId: string, key: string, period: string): number | null {
  const def = METRIC_BY_KEY[key];
  if (def.favorability === "none") return null;
  const all = SECTORS.map((s) => sectorMedian(s.id, key, period));
  const mine = sectorMedian(sectorId, key, period);
  const p = percentileOf(mine, all);
  return def.favorability === "lower" ? 100 - p : p;
}

export interface Constituent {
  key: string;
  label: string;
  weight: number;
  median: number;
  medianDisplay: string;
  /** Favorability-adjusted percentile vs the other sectors, or null when excluded. */
  percentile: number | null;
  /** Weighted points this constituent contributed to the composite. */
  contribution: number | null;
  favorability: "higher" | "lower" | "none";
  excludedReason?: string;
}

export interface ThemeScore {
  theme: ThemeKey;
  label: string;
  short: string;
  score: number | null;
  /** Always `approximate` when scored: a provisional composite is never an `ok` figure. */
  status: MetricStatus;
  reason: string;
  delta: number;
  direction: "up" | "flat" | "down";
  /** Cross-sector percentile — the one place a cross-sector percentile is allowed (01 §3). */
  percentile: number | null;
  rank: number;
  of: number;
  constituents: Constituent[];
  scoreable: number;
  excluded: string[];
}

function rawScore(sectorId: string, theme: ThemeKey, period: string): number | null {
  const { weights } = THEME_BY_KEY[theme];
  let acc = 0;
  let w = 0;
  for (const [key, weight] of Object.entries(weights)) {
    const p = sectorPercentile(sectorId, key, period);
    if (p == null) continue;
    acc += p * weight;
    w += weight;
  }
  return w > 0 ? acc / w : null;
}

/** One theme's provisional composite, with the decomposition it must be openable into. */
export function themeScore(sectorId: string, theme: ThemeKey, period: string): ThemeScore {
  const def = THEME_BY_KEY[theme];
  const score = rawScore(sectorId, theme, period);
  const prior = trailingQuarters(period, 2)[0];
  const priorScore = rawScore(sectorId, theme, prior);
  const delta = score != null && priorScore != null ? round(score - priorScore, 1) : 0;

  const constituents: Constituent[] = Object.entries(def.weights).map(([key, weight]) => {
    const m = METRIC_BY_KEY[key];
    const median = sectorMedian(sectorId, key, period);
    const percentile = sectorPercentile(sectorId, key, period);
    return {
      key,
      label: m.label,
      weight,
      median,
      medianDisplay: fmt(median, m.unit),
      percentile,
      contribution: percentile == null ? null : round(percentile * weight, 1),
      favorability: m.favorability,
      excludedReason:
        m.favorability === "none"
          ? "No agreed direction — a higher number is neither favorable nor unfavorable without a thesis, so it is excluded from the composite rather than given an arbitrary sign."
          : undefined,
    };
  });

  const scoreable = constituents.filter((c) => c.percentile != null).length;
  const excluded = constituents.filter((c) => c.percentile == null).map((c) => c.label);

  // Rank against the other sectors on this theme, ordered by favorability (00 §3a).
  const board = SECTORS.map((s) => ({ id: s.id, v: rawScore(s.id, theme, period) ?? -1 })).sort(
    (a, b) => b.v - a.v,
  );
  const rank = board.findIndex((b) => b.id === sectorId) + 1;

  return {
    theme,
    label: def.label,
    short: def.short,
    score: score == null ? null : Math.round(score),
    status: score == null ? "nm" : "approximate",
    reason:
      score == null
        ? "No constituent of this theme has an agreed favorability direction, so a composite would assert a judgment the data does not support."
        : "Provisional composite — the rollup method is a placeholder (percentile of the sector median vs other sectors, favorability-adjusted, weighted). It is not a final scoring method.",
    delta,
    direction: delta > 0.5 ? "up" : delta < -0.5 ? "down" : "flat",
    percentile: score == null ? null : Math.round(score),
    rank,
    of: SECTORS.length,
    constituents,
    scoreable,
    excluded,
  };
}

export function scorecard(sectorId: string, period: string): ThemeScore[] {
  return (Object.keys(THEME_BY_KEY) as ThemeKey[]).map((t) => themeScore(sectorId, t, period));
}

/** One bar per sector on the focused theme — the peer strip (00 §3b). */
export function themePeerStrip(
  theme: ThemeKey,
  period: string,
): { id: string; label: string; short: string; score: number | null }[] {
  return SECTORS.map((s) => ({
    id: s.id,
    label: s.label,
    short: s.short,
    score: rawScore(s.id, theme, period) == null ? null : Math.round(rawScore(s.id, theme, period)!),
  }));
}

export interface Shift {
  key: string;
  label: string;
  theme: ThemeKey;
  /** Raw move in the metric's own unit. */
  delta: number;
  deltaDisplay: string;
  /** Move standardized against the metric's own 8-quarter history — the ranking basis. */
  z: number;
  basis: string;
  favorability: "higher" | "lower" | "none";
  /** Set when the metric crossed its stored threshold (00 §13). */
  flag?: string;
}

/**
 * The metrics that moved most RELATIVE TO THEIR OWN HISTORY (01 §5) — not the largest absolute
 * move, which would let the same volatile metric win every period.
 */
export function biggestShifts(
  sectorId: string,
  period: string,
  coverage: Coverage,
  limit = 5,
): Shift[] {
  const prior = trailingQuarters(period, 2)[0];
  const rows: Shift[] = METRICS.map((m) => {
    const now = sectorMedian(sectorId, m.key, period);
    const then = sectorMedian(sectorId, m.key, prior);
    const hist = trailingQuarters(period, 8).map((p) => sectorMedian(sectorId, m.key, p));
    const diffs = hist.slice(1).map((v, i) => v - hist[i]);
    const sigma =
      Math.sqrt(diffs.reduce((a, d) => a + d * d, 0) / Math.max(1, diffs.length)) || 1e-6;
    const delta = round(now - then, 2);
    const t = m.threshold;
    const crossed =
      t && (t.direction === "above" ? now > t.value : now < t.value)
        ? `${m.label} ${fmt(now, m.unit)} — ${t.note}`
        : undefined;
    return {
      key: m.key,
      label: m.label,
      theme: m.theme,
      delta,
      // The delta wears the metric's own unit — a raw float here reads as a different quantity
      // than the metric it belongs to.
      deltaDisplay:
        m.unit === "pct"
          ? `${signed(round(delta, 2))}pp`
          : m.unit === "usdm" || m.unit === "usd"
            ? `${delta < 0 ? "−" : "+"}${fmt(Math.abs(delta), "usdm")}`
            : m.unit === "count"
              ? signed(round(delta, 0))
              : `${signed(round(delta, 2))}${m.unit === "x" ? "×" : m.unit === "days" ? " d" : ""}`,
      z: round(Math.abs(delta / sigma), 2),
      basis: coverage.sameStore
        ? `same-store, ${coverage.reported} of ${coverage.total} filers`
        : "vs prior quarter",
      favorability: m.favorability,
      flag: crossed,
    };
  });
  const flagged = rows.filter((r) => r.flag).sort((a, b) => b.z - a.z);
  const rest = rows.filter((r) => !r.flag).sort((a, b) => b.z - a.z);
  return [...flagged, ...rest].slice(0, limit);
}

export interface Coverage {
  reported: number;
  total: number;
  pct: number;
  /** True while coverage is below threshold — every delta is then same-store (00 §6). */
  sameStore: boolean;
  threshold: number;
}

export function coverageFor(sectorId: string, period: string, filers: number): Coverage {
  const pct = Math.round(sd(`coverage:${sectorId}:${period}`, 61, 97, 0));
  const reported = Math.round((pct / 100) * filers);
  const threshold = 80;
  return { reported, total: filers, pct, sameStore: pct < threshold, threshold };
}

/** An 8-quarter history of one sector metric, with disclosure gaps left as nulls. */
export function metricHistory(
  sectorId: string,
  key: string,
  period: string,
  n = 8,
): { period: string; value: number | null }[] {
  const qs = trailingQuarters(period, n);
  return qs.map((p, i) => ({
    period: p,
    // A period a sector did not disclose stays null — the line breaks here (HANDOFF §3.4).
    value: chance(`gap:${sectorId}:${key}:${p}`, i === n - 1 ? 0 : 0.06)
      ? null
      : sectorMedian(sectorId, key, p),
  }));
}

/** One filer's 8-quarter history, same gap rule. */
export function filerHistory(
  symbol: string,
  key: string,
  period: string,
  n = 8,
): { period: string; value: number | null }[] {
  return trailingQuarters(period, n).map((p, i) => {
    const m = filerMetric(symbol, key, p);
    const gap = chance(`fgap:${symbol}:${key}:${p}`, i === n - 1 ? 0 : 0.08);
    return { period: p, value: gap ? null : m.value };
  });
}

/** Adapt an engine value into the design system's `MetricValue`. */
export function toMetricValue(
  m: FilerMetric,
  extra: Partial<MetricValue> = {},
): MetricValue {
  return {
    metric: m.key,
    label: m.def.label,
    value: m.value,
    display: m.status === "na" || m.status === "nm" ? undefined : m.display,
    status: m.status,
    reason: m.reason,
    basis: m.def.unit === "x" || m.def.unit === "days" ? "as-of" : "TTM",
    restatementBasis: "as-restated",
    ...extra,
  };
}

/** A short deterministic series for an inline sparkline. */
export function spark(key: string, n = 8): (number | null)[] {
  return walk(key, n, 50, 6, 0.4);
}
