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
 * Surface payloads — one builder per view, all reading the metric engine so no two views can
 * disagree about the same fact (RECONCILIATION §4.4).
 *
 * Structural absences carry a REASON, and the reason distinguishes "does not apply" from
 * "we have nothing" (§4.3). Those strings are the load-bearing half of the honesty argument,
 * so they are written out in full rather than templated into something generic.
 */
import type { MetricStatus } from "@ds";
import { daysBetween, fmt, humanDate, isoDate, round, signed, usdCompact } from "../lib/format";
import { chance, percentileOf, pick, quantiles, ri, sd } from "../lib/seed";
import {
  FILERS,
  FILER_BY_SYMBOL,
  MANAGERS,
  MANAGER_BY_CIK,
  METRICS,
  METRIC_BY_KEY,
  SECTORS,
  SECTOR_BY_ID,
  THEMES,
  type FilerDef,
  type ThemeKey,
  filersOfSector,
  metricsOfTheme,
  periodEnd,
  trailingQuarters,
} from "./catalog";
import {
  biggestShifts,
  coverageFor,
  distribution,
  filerHistory,
  filerMetric,
  metricHistory,
  peerValues,
  scorecard,
  sectorMedian,
  sectorPercentile,
  themePeerStrip,
  type Coverage,
  type Distribution,
  type Shift,
  type ThemeScore,
} from "./metrics";

// ============================================================ shared bits

export interface FeedEvent {
  id: string;
  title: string;
  source: string;
  date: string;
  severity: "flag" | "accent" | "quiet";
}

/**
 * The filing-event feed. DAILY cadence, 8-K/Form 4/S-1 sourced, and deliberately walled off
 * from the analytical panels — merging it with "biggest shifts" would make a quarterly
 * aggregate look like breaking news (00 §12).
 */
function feed(sectorId: string, period: string): FeedEvent[] {
  const filers = filersOfSector(sectorId);
  const pool = filers.length ? filers : [{ symbol: SECTOR_BY_ID[sectorId].short.toUpperCase(), name: SECTOR_BY_ID[sectorId].label }];
  const kinds: [string, string, FeedEvent["severity"]][] = [
    ["names a new chief financial officer", "8-K Item 5.02", "accent"],
    ["files a non-reliance notice on prior financials", "8-K Item 4.02", "flag"],
    ["changes its registered public accounting firm", "8-K Item 4.01", "accent"],
    ["announces a definitive acquisition agreement", "8-K Item 1.01", "quiet"],
    ["reports a material cybersecurity incident", "8-K Item 1.05", "flag"],
    ["registers an initial public offering", "S-1", "quiet"],
    ["deregisters its common stock", "Form 15", "quiet"],
    ["reports quarterly results", "8-K Item 2.02", "quiet"],
  ];
  const end = periodEnd(period);
  return Array.from({ length: 7 }, (_x, i) => {
    const f = pool[ri(`feed:${sectorId}:${period}:${i}:f`, 0, pool.length - 1)];
    const [what, src, severity] = kinds[ri(`feed:${sectorId}:${period}:${i}:k`, 0, kinds.length - 1)];
    const back = ri(`feed:${sectorId}:${period}:${i}:d`, 1, 58);
    const d = new Date(`${end}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - back);
    return {
      id: `${sectorId}-${period}-${i}`,
      title: `${f.symbol} ${what}`,
      source: src,
      date: isoDate(d),
      severity,
    };
  }).sort((a, b) => (a.date < b.date ? 1 : -1));
}

export interface MetricRow {
  key: string;
  label: string;
  unit: string;
  median: number;
  medianDisplay: string;
  dist: Distribution;
  peers: { symbol: string; name: string; value: number | null; status: MetricStatus }[];
  history: { period: string; value: number | null }[];
  caption: string;
  favorability: "higher" | "lower" | "none";
  formula: string;
  source: string;
  normalizationRisk?: string;
}

function metricRow(sectorId: string, key: string, period: string, sub: string | null): MetricRow {
  const def = METRIC_BY_KEY[key];
  const dist = distribution(sectorId, key, period, sub);
  const peers = peerValues(sectorId, key, period, sub);
  const spread = dist.q3 - dist.q1;
  const range = dist.hi - dist.lo || 1;
  const wide = spread / range > 0.42;
  return {
    key,
    label: def.label,
    unit: def.unit,
    median: dist.med,
    medianDisplay: fmt(dist.med, def.unit),
    dist,
    peers,
    history: metricHistory(sectorId, key, period),
    caption: wide
      ? "wide spread — the middle half covers most of the range, so the median describes few filers well"
      : "tight spread — most filers sit close to the median on this measure",
    favorability: def.favorability,
    formula: def.formula,
    source: def.source,
    normalizationRisk: def.normalizationRisk,
  };
}

// ============================================================ 01 · sector

export interface GeoRegion {
  key: string;
  label: string;
  share: number;
}

export interface SectorSurface {
  sector: (typeof SECTORS)[number];
  subIndustry: string | null;
  period: string;
  coverage: Coverage;
  filers: number;
  scorecard: ThemeScore[];
  peerStrip: { id: string; label: string; short: string; score: number | null }[];
  shifts: Shift[];
  geo: { regions: GeoRegion[]; coveragePct: number; excluded: number };
  insider: { ratio: number; buyers: number; sellers: number; windowDays: number; filers: number };
  events: FeedEvent[];
  themeRows: MetricRow[];
  allRows: MetricRow[];
  asOf: string;
}

export function sectorSurface(sectorId: string, sub: string | null, period: string): SectorSurface {
  const sector = SECTOR_BY_ID[sectorId];
  const filers = sub ? filersOfSector(sectorId, sub).length || Math.round(sector.filers / 4) : sector.filers;
  const coverage = coverageFor(sectorId, period, filers);
  const board = scorecard(sectorId, period);

  const regions: GeoRegion[] = [
    { key: "domestic", label: "United States", share: sd(`geo:${sectorId}:us`, 22, 58, 1) },
    { key: "china", label: "China", share: sd(`geo:${sectorId}:cn`, 8, 34, 1) },
    { key: "apac", label: "Rest of Asia-Pacific", share: sd(`geo:${sectorId}:ap`, 6, 26, 1) },
    { key: "emea", label: "Europe, Middle East & Africa", share: sd(`geo:${sectorId}:eu`, 5, 22, 1) },
  ];
  const other = Math.max(2, 100 - regions.reduce((a, r) => a + r.share, 0));
  regions.push({ key: "other", label: "Other & unallocated", share: round(other, 1) });

  return {
    sector,
    subIndustry: sub,
    period,
    coverage,
    filers,
    scorecard: board,
    peerStrip: [],
    shifts: biggestShifts(sectorId, period, coverage),
    geo: {
      regions,
      coveragePct: Math.round(sd(`geocov:${sectorId}:${period}`, 54, 88, 0)),
      excluded: ri(`geoex:${sectorId}`, 3, 14),
    },
    insider: {
      ratio: sectorMedian(sectorId, "insider_net", period),
      buyers: ri(`ins:${sectorId}:${period}:b`, 4, 38),
      sellers: ri(`ins:${sectorId}:${period}:s`, 18, 96),
      windowDays: 90,
      filers,
    },
    events: feed(sectorId, period),
    themeRows: [],
    allRows: [],
    asOf: periodEnd(period),
  };
}

/** Theme-scoped drill rows, recomputed when the expanded theme changes. */
export function themeRows(sectorId: string, theme: ThemeKey, period: string, sub: string | null): MetricRow[] {
  return metricsOfTheme(theme)
    .slice(0, 4)
    .map((m) => metricRow(sectorId, m.key, period, sub));
}

export function allRows(sectorId: string, period: string, sub: string | null): MetricRow[] {
  return METRICS.map((m) => metricRow(sectorId, m.key, period, sub));
}

export function peerStripFor(theme: ThemeKey, period: string) {
  return themePeerStrip(theme, period);
}

// ============================================================ 04 · qualitative

export interface RiskTheme {
  id: string;
  label: string;
  /** Share of filers whose Item 1A carries this theme. */
  coverage: number;
  filers: number;
  direction: "new" | "rising" | "fading" | "stable";
  deltaPp: number;
  excerpt: string;
  excerptSource: string;
  tickers: string[];
}

export interface QualitativeSurface {
  sector: (typeof SECTORS)[number];
  period: string;
  filers: number;
  themes: RiskTheme[];
  emerging: { label: string; count: number; tickers: string[] }[];
  goingConcern: { count: number; tickers: string[] };
  litigation: { total: number; tickers: string[]; categories: { label: string; count: number; tickers: string[] }[] };
  signals: { symbol: string; name: string; riskCount: number; newCount: number; goingConcern: boolean; litigation: boolean }[];
  landscape: {
    cyber: { disclosing: number; incidents: number; incidentTickers: string[]; note: string };
    cams: { avg: number; topics: { label: string; count: number }[] };
    auditors: { name: string; filers: number; avgTenure: number }[];
    auditorChanges: { count: number; tickers: string[] };
    riskVolume: { period: string; value: number | null }[];
    netNewRisks: number;
    nonGaap: { usage: number; chargeFilers: number; tickers: string[] };
    deficient: { late: number; materialWeakness: number; restatement: number; tickers: string[] };
    humanCapital: { disclosing: number; median: number | null; climate: number };
  };
  asOf: string;
}

const RISK_THEMES: [string, string, string][] = [
  ["supply", "Supply chain & component availability", "We depend on a limited number of third-party foundries and outsourced assembly and test providers, and any disruption in their operations could materially delay shipments."],
  ["export", "Export controls & trade restrictions", "New or expanded export licensing requirements applicable to our advanced products have restricted, and may further restrict, sales to certain customers and regions."],
  ["concentration", "Customer concentration", "A small number of customers account for a substantial portion of our revenue, and the loss of any one of them would materially harm our results."],
  ["cyber", "Cybersecurity & data protection", "We have experienced, and expect to continue to experience, attempts to gain unauthorized access to our systems and to the confidential information we maintain."],
  ["talent", "Talent & key personnel", "Competition for engineering talent in our industry is intense, and the loss of key technical personnel could delay our product roadmap."],
  ["ip", "Intellectual property & litigation", "We are subject to claims that our products infringe third-party intellectual property rights, and adverse outcomes could require us to pay significant damages."],
  ["capacity", "Capacity & capital intensity", "Our manufacturing operations require substantial capital investment made well in advance of demand, and underutilized capacity would reduce our gross margin."],
  ["climate", "Climate & environmental regulation", "Evolving greenhouse-gas reporting obligations may impose additional compliance costs, though the scope of the applicable rules remains uncertain."],
];

export function qualitativeSurface(sectorId: string, period: string): QualitativeSurface {
  const sector = SECTOR_BY_ID[sectorId];
  const filerList = filersOfSector(sectorId);
  const pool = filerList.length ? filerList : [];
  const filers = pool.length || sector.filers;

  const themes: RiskTheme[] = RISK_THEMES.map(([id, label, excerpt], i) => {
    const cov = sd(`risk:${sectorId}:${id}:cov`, 0.18, 0.94, 3);
    const delta = sd(`risk:${sectorId}:${id}:d`, -14, 18, 1);
    const n = Math.round(cov * filers);
    return {
      id,
      label,
      coverage: cov,
      filers: n,
      direction: (delta > 9 ? "new" : delta > 3 ? "rising" : delta < -4 ? "fading" : "stable") as RiskTheme["direction"],
      deltaPp: delta,
      excerpt,
      excerptSource: `${pool[i % Math.max(1, pool.length)]?.symbol ?? sector.short} · 10-K Item 1A · filed ${humanDate(periodEnd(period))}`,
      tickers: pool.slice(0, n).map((f) => f.symbol),
    };
  }).sort((a, b) => b.coverage - a.coverage);

  const gcCount = ri(`gc:${sectorId}:${period}`, 0, 3);
  const litCount = ri(`lit:${sectorId}:${period}`, 2, 11);

  return {
    sector,
    period,
    filers,
    themes,
    emerging: themes
      .filter((t) => t.direction === "new")
      .slice(0, 3)
      .map((t) => ({ label: t.label, count: t.filers, tickers: t.tickers.slice(0, 8) })),
    goingConcern: { count: gcCount, tickers: pool.slice(0, gcCount).map((f) => f.symbol) },
    litigation: {
      total: litCount,
      tickers: pool.slice(0, litCount).map((f) => f.symbol),
      categories: [
        { label: "Patent infringement", count: ri(`lit:${sectorId}:pat`, 1, 6), tickers: pool.slice(0, 4).map((f) => f.symbol) },
        { label: "Securities class action", count: ri(`lit:${sectorId}:sec`, 0, 4), tickers: pool.slice(2, 5).map((f) => f.symbol) },
        { label: "Antitrust", count: ri(`lit:${sectorId}:anti`, 0, 3), tickers: pool.slice(1, 3).map((f) => f.symbol) },
        { label: "Environmental", count: ri(`lit:${sectorId}:env`, 0, 2), tickers: pool.slice(5, 6).map((f) => f.symbol) },
      ],
    },
    signals: pool.map((f) => ({
      symbol: f.symbol,
      name: f.name,
      riskCount: ri(`sig:${f.symbol}:rc`, 14, 48),
      newCount: ri(`sig:${f.symbol}:nc`, 0, 7),
      goingConcern: chance(`sig:${f.symbol}:gc`, 0.05),
      litigation: chance(`sig:${f.symbol}:lit`, 0.3),
    })),
    landscape: {
      cyber: {
        disclosing: Math.round(filers * sd(`cyb:${sectorId}`, 0.86, 1, 3)),
        incidents: ri(`cybinc:${sectorId}`, 0, 4),
        incidentTickers: pool.slice(0, ri(`cybinc:${sectorId}`, 0, 4)).map((f) => f.symbol),
        note: "Item 1C has been required since the 2023 rule, so near-total coverage is the expected baseline — a filer WITHOUT it is the signal, not one with it.",
      },
      cams: {
        avg: sd(`cams:${sectorId}`, 1.1, 2.4, 1),
        topics: [
          { label: "Revenue recognition", count: ri(`cam:${sectorId}:rev`, 4, 22) },
          { label: "Inventory valuation", count: ri(`cam:${sectorId}:inv`, 3, 18) },
          { label: "Goodwill & intangibles", count: ri(`cam:${sectorId}:gw`, 2, 14) },
          { label: "Income taxes", count: ri(`cam:${sectorId}:tax`, 1, 11) },
        ],
      },
      auditors: [
        { name: "PricewaterhouseCoopers LLP", filers: ri(`aud:${sectorId}:pwc`, 3, 18), avgTenure: sd(`aud:${sectorId}:pwc:t`, 6, 24, 0) },
        { name: "Ernst & Young LLP", filers: ri(`aud:${sectorId}:ey`, 3, 17), avgTenure: sd(`aud:${sectorId}:ey:t`, 5, 22, 0) },
        { name: "Deloitte & Touche LLP", filers: ri(`aud:${sectorId}:dt`, 2, 15), avgTenure: sd(`aud:${sectorId}:dt:t`, 5, 21, 0) },
        { name: "KPMG LLP", filers: ri(`aud:${sectorId}:kpmg`, 2, 13), avgTenure: sd(`aud:${sectorId}:kpmg:t`, 4, 19, 0) },
        { name: "Other firms", filers: ri(`aud:${sectorId}:oth`, 1, 9), avgTenure: sd(`aud:${sectorId}:oth:t`, 3, 12, 0) },
      ],
      auditorChanges: {
        count: ri(`audch:${sectorId}`, 0, 4),
        tickers: pool.slice(0, ri(`audch:${sectorId}`, 0, 4)).map((f) => f.symbol),
      },
      riskVolume: trailingQuarters(period, 8).map((p, i) => ({
        period: p,
        // Item 1A is an ANNUAL section — the interim quarters genuinely have nothing to count.
        value: i % 4 === 3 ? Math.round(sd(`rv:${sectorId}:${p}`, 6200, 13800, 0)) : null,
      })),
      netNewRisks: ri(`nnr:${sectorId}`, -4, 12),
      nonGaap: {
        usage: Math.round(filers * sd(`ng:${sectorId}`, 0.72, 0.98, 3)),
        chargeFilers: ri(`ngc:${sectorId}`, 2, 14),
        tickers: pool.slice(0, 6).map((f) => f.symbol),
      },
      deficient: {
        late: ri(`def:${sectorId}:late`, 0, 5),
        materialWeakness: ri(`def:${sectorId}:mw`, 0, 4),
        restatement: ri(`def:${sectorId}:rs`, 0, 3),
        tickers: pool.slice(0, 5).map((f) => f.symbol),
      },
      humanCapital: {
        disclosing: Math.round(filers * sd(`hc:${sectorId}`, 0.62, 0.95, 3)),
        median: chance(`hcmed:${sectorId}`, 0.85) ? ri(`hcmed:${sectorId}:v`, 1200, 48000) : null,
        climate: Math.round(filers * sd(`cl:${sectorId}`, 0.05, 0.34, 3)),
      },
    },
    asOf: periodEnd(period),
  };
}

// ============================================================ 05 · filings

export interface FilingRow {
  id: string;
  symbol: string;
  name: string;
  accession: string;
  form: "10-K" | "10-Q" | "8-K";
  filed: string;
  section: string;
  passage: string;
}

export interface FilingsSurface {
  sector: (typeof SECTORS)[number];
  theme: RiskTheme | null;
  rows: FilingRow[];
  asOf: string;
}

export function filingsSurface(sectorId: string, themeId: string, period: string): FilingsSurface {
  const q = qualitativeSurface(sectorId, period);
  const theme = q.themes.find((t) => t.id === themeId) ?? q.themes[0] ?? null;
  const pool = filersOfSector(sectorId);
  const forms: FilingRow["form"][] = ["10-K", "10-Q", "10-Q", "8-K"];
  const sections: Record<FilingRow["form"], string> = {
    "10-K": "Item 1A — Risk Factors",
    "10-Q": "Part II, Item 1A — Risk Factors",
    "8-K": "Item 8.01 — Other Events",
  };
  const end = periodEnd(period);
  const rows: FilingRow[] = Array.from({ length: 14 }, (_x, i) => {
    const f = pool[i % Math.max(1, pool.length)];
    const form = forms[ri(`fl:${sectorId}:${themeId}:${i}:f`, 0, forms.length - 1)];
    const back = ri(`fl:${sectorId}:${themeId}:${i}:d`, 4, 300);
    const d = new Date(`${end}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - back);
    return {
      id: `${themeId}-${i}`,
      symbol: f?.symbol ?? "—",
      name: f?.name ?? SECTOR_BY_ID[sectorId].label,
      accession: `0000${ri(`acc:${themeId}:${i}`, 100000, 999999)}-${String(d.getUTCFullYear()).slice(2)}-${String(ri(`acc2:${themeId}:${i}`, 1, 999)).padStart(6, "0")}`,
      form,
      filed: isoDate(d),
      section: sections[form],
      passage: theme?.excerpt ?? "",
    };
  }).sort((a, b) => (a.filed < b.filed ? 1 : -1));

  return { sector: SECTOR_BY_ID[sectorId], theme, rows, asOf: end };
}

// ============================================================ 03 · compare sectors

export interface CompareSectorsSurface {
  a: (typeof SECTORS)[number];
  b: (typeof SECTORS)[number];
  period: string;
  themes: { theme: ThemeKey; label: string; short: string; a: number | null; b: number | null; gap: number | null }[];
  metrics: {
    key: string;
    label: string;
    unit: string;
    inverted: boolean;
    aMed: number;
    bMed: number;
    aDist: Distribution;
    bDist: Distribution;
  }[];
  coverageA: Coverage;
  coverageB: Coverage;
}

export function compareSectors(aId: string, bId: string, period: string): CompareSectorsSurface {
  const a = SECTOR_BY_ID[aId];
  const b = SECTOR_BY_ID[bId];
  const boardA = scorecard(aId, period);
  const boardB = scorecard(bId, period);
  return {
    a,
    b,
    period,
    themes: THEMES.map((t, i) => {
      const av = boardA[i].score;
      const bv = boardB[i].score;
      return {
        theme: t.key,
        label: t.label,
        short: t.short,
        a: av,
        b: bv,
        gap: av != null && bv != null ? av - bv : null,
      };
    }),
    metrics: METRICS.filter((m) => m.favorability !== "none")
      .slice(0, 10)
      .map((m) => ({
        key: m.key,
        label: m.label,
        unit: m.unit,
        inverted: m.favorability === "lower",
        aMed: sectorMedian(aId, m.key, period),
        bMed: sectorMedian(bId, m.key, period),
        aDist: distribution(aId, m.key, period),
        bDist: distribution(bId, m.key, period),
      })),
    coverageA: coverageFor(aId, period, a.filers),
    coverageB: coverageFor(bId, period, b.filers),
  };
}

// ============================================================ 02 · company hub

export interface CompanySurface {
  filer: (typeof FILERS)[number];
  sector: (typeof SECTORS)[number];
  period: string;
  asOf: string;
  latestFiling: { form: string; filed: string; accession: string };
  themeRail: { theme: ThemeKey; label: string; short: string; percentile: number | null; status: MetricStatus; reason?: string }[];
  compositeRank: { rank: number; of: number; score: number | null };
  tiles: { key: string; label: string; value: number | null; display: string; status: MetricStatus; reason: string | null; move: string; unit: string }[];
  segments: { key: string; label: string; share: number }[];
  geography: { key: string; label: string; share: number }[];
  segmentCoverage: string;
  filings: { id: string; form: string; filed: string; accession: string; note: string; flag?: "restatement" | "material-weakness" | "late" }[];
  flags: { label: string; present: boolean; note: string }[];
}

function latestFilingFor(symbol: string, period: string) {
  const end = periodEnd(period);
  const d = new Date(`${end}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + ri(`lf:${symbol}:${period}`, 18, 44));
  return {
    form: pick(`lff:${symbol}:${period}`, ["10-Q", "10-K"]),
    filed: isoDate(d),
    accession: `0000${ri(`lfa:${symbol}`, 100000, 999999)}-26-0${ri(`lfa2:${symbol}`, 10000, 99999)}`,
  };
}

/**
 * The filer a symbol names — never a DIFFERENT company.
 *
 * `FILER_BY_SYMBOL[symbol] ?? FILERS[0]` silently returned `FILERS[0]`, which is NVIDIA, for any
 * ticker outside the fourteen-name semiconductor demo universe. So Apple's own control bar read
 * "Company NVDA · Peer set Semiconductors & related devices" while every section beneath it showed
 * Apple's real filings. A page asserting the wrong company's identity next to the right company's
 * data is the worst failure this product has: not a missing value, a confident wrong one.
 *
 * An unknown symbol now resolves to ITSELF. The peer machinery still runs against the fixture
 * universe — that half is synthetic and labelled as such — but `label` says so instead of naming a
 * sector the company is not in.
 */
function resolveFiler(symbol: string): { filer: FilerDef; known: boolean } {
  const known = FILER_BY_SYMBOL[symbol];
  if (known) return { filer: known, known: true };
  return {
    filer: { symbol, name: symbol, cik: 0, sector: FILERS[0].sector, subIndustry: "" },
    known: false,
  };
}

/** The peer set, or an honest statement that this company is not in the demo universe. */
function resolveSector(filer: FilerDef, known: boolean) {
  const base = SECTOR_BY_ID[filer.sector];
  return known ? base : { ...base, label: "Peer set not available for this company" };
}


export function companySurface(symbol: string, period: string, sub: string | null): CompanySurface {
  const { filer, known } = resolveFiler(symbol);
  const sector = resolveSector(filer, known);
  const peers = filersOfSector(filer.sector, sub);

  const themeRail = THEMES.map((t) => {
    // The company's percentile WITHIN its peer set, per theme — never cross-sector (00 §4).
    const constituents = Object.keys(t.weights).filter((k) => METRIC_BY_KEY[k].favorability !== "none");
    const scores: number[] = [];
    for (const key of constituents) {
      const mine = filerMetric(symbol, key, period);
      if (mine.value == null) continue;
      const others = peers
        .map((p) => filerMetric(p.symbol, key, period).value)
        .filter((v): v is number => v != null);
      if (others.length < 2) continue;
      const p = percentileOf(mine.value, others);
      scores.push(METRIC_BY_KEY[key].favorability === "lower" ? 100 - p : p);
    }
    if (!scores.length)
      return {
        theme: t.key,
        label: t.label,
        short: t.short,
        percentile: null,
        status: "na" as MetricStatus,
        reason: `${filer.symbol} tags none of this theme's constituents for ${period}, so there is nothing to rank it on.`,
      };
    return {
      theme: t.key,
      label: t.label,
      short: t.short,
      percentile: Math.round(scores.reduce((x, y) => x + y, 0) / scores.length),
      status: "approximate" as MetricStatus,
      reason: `Mean of ${scores.length} constituent percentiles within the peer set — a provisional rollup, not a final method.`,
    };
  });

  const tiles = ["gross_margin", "operating_margin", "rev_growth_yoy", "fcf_margin", "net_debt_ebitda", "roic"].map(
    (key) => {
      const m = filerMetric(symbol, key, period);
      const prior = filerMetric(symbol, key, trailingQuarters(period, 2)[0]);
      const move =
        m.value != null && prior.value != null
          ? `${signed(round(m.value - prior.value, 1))}${m.def.unit === "pct" ? "pp" : ""} vs prior quarter`
          : "no prior-period value to compare";
      return {
        key,
        label: m.def.label,
        value: m.value,
        display: m.display,
        status: m.status,
        reason: m.reason,
        move,
        unit: m.def.unit,
      };
    },
  );

  const segShares = [
    sd(`seg:${symbol}:1`, 26, 62, 1),
    sd(`seg:${symbol}:2`, 12, 34, 1),
    sd(`seg:${symbol}:3`, 6, 22, 1),
  ];
  const segTotal = segShares.reduce((a, b) => a + b, 0);
  const segNames = ["Data center", "Client & edge", "Automotive & industrial", "Licensing & other"];

  const flags: CompanySurface["flags"] = [
    {
      label: "Restatement (8-K 4.02)",
      present: chance(`flag:${symbol}:rs`, 0.08),
      note: "A non-reliance notice on previously issued financials.",
    },
    {
      label: "Material weakness (Item 9A)",
      present: chance(`flag:${symbol}:mw`, 0.12),
      note: "Management concluded ICFR was not effective for the period.",
    },
    {
      label: "Timely filer",
      present: !chance(`flag:${symbol}:late`, 0.09),
      note: "No Form 12b-25 filed for the periods in the indexed window.",
    },
  ];

  const end = periodEnd(period);
  const filings = Array.from({ length: 8 }, (_x, i) => {
    const d = new Date(`${end}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ri(`cf:${symbol}:${i}:d`, 5, 420));
    const form = pick(`cf:${symbol}:${i}:f`, ["10-Q", "10-K", "8-K", "8-K", "4"]);
    return {
      id: `${symbol}-${i}`,
      form,
      filed: isoDate(d),
      accession: `0000${ri(`cfa:${symbol}:${i}`, 100000, 999999)}-${String(d.getUTCFullYear()).slice(2)}-0${ri(`cfa2:${symbol}:${i}`, 10000, 99999)}`,
      note:
        form === "8-K"
          ? pick(`cfn:${symbol}:${i}`, ["Item 2.02 — results of operations", "Item 5.02 — officer appointment", "Item 1.01 — material agreement"])
          : form === "4"
            ? "Section 16 transaction report"
            : "Periodic report",
      flag: undefined,
    };
  }).sort((a, b) => (a.filed < b.filed ? 1 : -1));

  const composite = themeRail.filter((t) => t.percentile != null);
  return {
    filer,
    sector,
    period,
    asOf: end,
    latestFiling: latestFilingFor(symbol, period),
    themeRail,
    compositeRank: {
      rank: ri(`rank:${symbol}:${period}`, 1, Math.max(2, peers.length)),
      of: peers.length,
      score: composite.length
        ? Math.round(composite.reduce((a, t) => a + (t.percentile as number), 0) / composite.length)
        : null,
    },
    tiles,
    segments: segNames.slice(0, 3).map((label, i) => ({
      key: `s${i}`,
      label,
      share: round((segShares[i] / segTotal) * 100, 1),
    })),
    geography: [
      { key: "us", label: "United States", share: sd(`cgeo:${symbol}:us`, 18, 52, 1) },
      { key: "cn", label: "China", share: sd(`cgeo:${symbol}:cn`, 10, 36, 1) },
      { key: "apac", label: "Rest of Asia-Pacific", share: sd(`cgeo:${symbol}:ap`, 8, 28, 1) },
      { key: "emea", label: "EMEA", share: sd(`cgeo:${symbol}:eu`, 5, 20, 1) },
    ],
    segmentCoverage:
      "ASC 280 segment and geographic disclosure is an ANNUAL footnote. Interim quarters are not re-disclosed, so this is the latest annual split carried forward, not a quarter-end figure.",
    filings,
    flags,
  };
}

export interface CompanyHistorySurface {
  filer: (typeof FILERS)[number];
  period: string;
  statement: { label: string; amount: string; drained?: boolean; sourceTag?: string; isExtension?: boolean }[];
  metrics: { key: string; label: string; unit: string; series: { period: string; value: number | null }[] }[];
  periods: string[];
}

export function companyHistory(symbol: string, period: string): CompanyHistorySurface {
  const { filer } = resolveFiler(symbol);
  const rev = sd(`rev:${symbol}`, 2.4e9, 4.1e10, 0);
  const gm = filerMetric(symbol, "gross_margin", period).value ?? 45;
  const om = filerMetric(symbol, "operating_margin", period).value ?? 20;
  const grossProfit = rev * (gm / 100);
  const opInc = rev * (om / 100);
  const rd = rev * ((filerMetric(symbol, "rd_intensity", period).value ?? 15) / 100);
  const tagged = chance(`stmt:${symbol}:sga`, 0.88);

  return {
    filer,
    period,
    statement: [
      { label: "Total revenue", amount: usdCompact(rev), sourceTag: "RevenueFromContractWithCustomerExcludingAssessedTax" },
      { label: "Cost of revenue", amount: usdCompact(rev - grossProfit), sourceTag: "CostOfRevenue" },
      { label: "Gross profit", amount: usdCompact(grossProfit), sourceTag: "GrossProfit" },
      { label: "Research & development", amount: usdCompact(rd), sourceTag: "ResearchAndDevelopmentExpense" },
      tagged
        ? { label: "Selling, general & administrative", amount: usdCompact(rev * 0.09), sourceTag: "SellingGeneralAndAdministrativeExpense" }
        : {
            label: "Selling, general & administrative",
            amount: "N/A",
            drained: true,
            sourceTag: "—",
          },
      { label: "Operating income", amount: usdCompact(opInc), sourceTag: "OperatingIncomeLoss" },
      {
        label: "Segment operating margin",
        amount: usdCompact(opInc * 0.82),
        sourceTag: `${filer.symbol}SegmentOperatingIncome`,
        isExtension: true,
      },
    ],
    metrics: ["gross_margin", "operating_margin", "rev_growth_yoy", "fcf_margin"].map((key) => ({
      key,
      label: METRIC_BY_KEY[key].label,
      unit: METRIC_BY_KEY[key].unit,
      series: filerHistory(symbol, key, period, 20),
    })),
    periods: trailingQuarters(period, 20),
  };
}

export interface CompanyInstitutionalSurface {
  filer: (typeof FILERS)[number];
  period: string;
  asOf: string;
  holders: { cik: number; name: string; positions: number; shares: number; prior: number; pctOut: number }[];
  sharesOutstanding: number;
  concentration: { label: string; share: number }[];
  registerOverTime: { periods: string[]; bands: { key: string; label: string; values: number[] }[] };
  thirteenDG: { name: string; points: { date: string; value: number }[] }[];
  npx: { proposal: string; managers: number; forPct: number }[];
  lorenz: number[];
  cohort: { rows: string[]; cols: string[]; cells: { row: string; col: string; value: number | null }[] };
}

export function companyInstitutional(symbol: string, period: string): CompanyInstitutionalSurface {
  const { filer } = resolveFiler(symbol);
  const sharesOut = Math.round(sd(`so:${symbol}`, 2.2e8, 2.4e10, 0));
  const holders = MANAGERS.map((m) => {
    const shares = Math.round(sharesOut * sd(`hold:${symbol}:${m.cik}`, 0.001, 0.085, 5));
    const prior = Math.round(shares * sd(`holdp:${symbol}:${m.cik}`, 0.72, 1.28, 3));
    return {
      cik: m.cik,
      name: m.short,
      positions: ri(`pos:${symbol}:${m.cik}`, 40, 3200),
      shares,
      prior,
      pctOut: round((shares / sharesOut) * 100, 2),
    };
  }).sort((a, b) => b.shares - a.shares);

  const total = holders.reduce((a, h) => a + h.shares, 0);
  const quarters = trailingQuarters(period, 8);

  return {
    filer,
    period,
    asOf: periodEnd(period),
    holders,
    sharesOutstanding: sharesOut,
    concentration: [
      { label: "Top 1 holder", share: holders[0].shares / total },
      { label: "Holders 2–5", share: holders.slice(1, 5).reduce((a, h) => a + h.shares, 0) / total },
      { label: "Holders 6–10", share: holders.slice(5, 10).reduce((a, h) => a + h.shares, 0) / total },
      { label: "All other reported holders", share: holders.slice(10).reduce((a, h) => a + h.shares, 0) / total },
    ],
    registerOverTime: {
      periods: quarters,
      bands: holders.slice(0, 4).map((h) => ({
        key: String(h.cik),
        label: h.name,
        values: quarters.map((q) => Math.round(h.shares * sd(`rot:${symbol}:${h.cik}:${q}`, 0.7, 1.3, 3))),
      })),
    },
    thirteenDG: holders.slice(0, 3).map((h) => ({
      name: h.name,
      points: quarters.map((q, i) => ({
        date: periodEnd(q),
        value: round(sd(`dg:${symbol}:${h.cik}:${i}`, 3.2, 9.4, 2), 2),
      })),
    })),
    npx: [
      { proposal: "Election of directors", managers: ri(`npx:${symbol}:1`, 6, 12), forPct: sd(`npxf:${symbol}:1`, 78, 99, 1) },
      { proposal: "Say-on-pay (advisory)", managers: ri(`npx:${symbol}:2`, 5, 12), forPct: sd(`npxf:${symbol}:2`, 52, 96, 1) },
      { proposal: "Ratification of auditor", managers: ri(`npx:${symbol}:3`, 6, 12), forPct: sd(`npxf:${symbol}:3`, 88, 100, 1) },
      { proposal: "Shareholder proposal — reporting", managers: ri(`npx:${symbol}:4`, 2, 9), forPct: sd(`npxf:${symbol}:4`, 8, 48, 1) },
    ],
    lorenz: holders.map((h) => h.shares),
    cohort: {
      rows: ["2024 entrants", "2025 H1", "2025 H2", "2026 entrants"],
      cols: quarters.slice(-6).map((q) => q.replace("-", " ")),
      cells: ["2024 entrants", "2025 H1", "2025 H2", "2026 entrants"].flatMap((row) =>
        quarters.slice(-6).map((q, ci) => ({
          row,
          col: q.replace("-", " "),
          value: chance(`coh:${symbol}:${row}:${q}`, 0.12) ? null : ri(`cohv:${symbol}:${row}:${ci}`, 2, 42),
        })),
      ),
    },
  };
}

export interface InsiderTxn {
  id: string;
  person: string;
  role: string;
  code: "P" | "S" | "A" | "M" | "F" | "G";
  shares: number;
  date: string;
  filed: string;
  /** Business days between transaction and filing — the two-business-day rule. */
  lateness: number;
  plan: string | null;
}

export interface CompanyInsiderSurface {
  filer: (typeof FILERS)[number];
  period: string;
  ledger: InsiderTxn[];
  form144: { id: string; date: string; size: number; label: string }[];
  windowStart: string;
  windowEnd: string;
}

const CODE_MEANING: Record<InsiderTxn["code"], string> = {
  P: "Open-market purchase",
  S: "Open-market sale",
  A: "Grant or award",
  M: "Option exercise",
  F: "Shares withheld for tax",
  G: "Bona fide gift",
};

export const INSIDER_CODES = CODE_MEANING;

export function companyInsider(symbol: string, period: string): CompanyInsiderSurface {
  const { filer } = resolveFiler(symbol);
  const end = periodEnd(period);
  const people: [string, string][] = [
    ["Chen, Wei", "Chief Executive Officer"],
    ["Okafor, Adaeze", "Chief Financial Officer"],
    ["Lindqvist, Marit", "Director"],
    ["Rao, Sunil", "EVP, Operations"],
    ["Duarte, Camila", "Chief Technology Officer"],
    ["Whitfield, Grant", "Director"],
  ];
  const codes: InsiderTxn["code"][] = ["S", "S", "S", "M", "F", "A", "P", "G"];

  const ledger: InsiderTxn[] = Array.from({ length: 26 }, (_x, i) => {
    const [person, role] = people[i % people.length];
    const code = codes[ri(`ins:${symbol}:${i}:c`, 0, codes.length - 1)];
    const d = new Date(`${end}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ri(`ins:${symbol}:${i}:d`, 2, 178));
    const lateness = ri(`ins:${symbol}:${i}:l`, 1, 6);
    const filedD = new Date(d);
    filedD.setUTCDate(filedD.getUTCDate() + lateness);
    return {
      id: `${symbol}-ins-${i}`,
      person,
      role,
      code,
      shares: ri(`ins:${symbol}:${i}:s`, 400, 92000),
      date: isoDate(d),
      filed: isoDate(filedD),
      lateness,
      plan: code === "S" && chance(`ins:${symbol}:${i}:p`, 0.62) ? `Rule 10b5-1 plan adopted ${humanDate(isoDate(new Date(d.getTime() - 120 * 86400000)))}` : null,
    };
  }).sort((a, b) => (a.date < b.date ? 1 : -1));

  const start = new Date(`${end}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 180);

  return {
    filer,
    period,
    ledger,
    form144: Array.from({ length: 11 }, (_x, i) => {
      const d = new Date(`${end}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - ri(`f144:${symbol}:${i}:d`, 3, 170));
      return {
        id: `${symbol}-144-${i}`,
        date: isoDate(d),
        size: ri(`f144:${symbol}:${i}:s`, 5000, 380000),
        label: `${people[i % people.length][0]} — notice of proposed sale`,
      };
    }),
    windowStart: isoDate(start),
    windowEnd: end,
  };
}

export interface CompanyPeersSurface {
  filer: (typeof FILERS)[number];
  sector: (typeof SECTORS)[number];
  period: string;
  rows: MetricRow[];
  focal: string;
  beyond: {
    acceptanceLagDays: number;
    extensionTagShare: number;
    riskFactorCount: number;
    camCount: number;
    auditor: string;
    auditorTenure: number;
    subsidiaries: number;
    segmentCount: number;
    lateFilings: number;
    boardChanges: number;
  };
  scatter: { id: string; label: string; x: number; y: number; focal?: boolean }[];
}

export function companyPeers(symbol: string, period: string, sub: string | null): CompanyPeersSurface {
  const { filer } = resolveFiler(symbol);
  const rows = ["gross_margin", "operating_margin", "rev_growth_yoy", "fcf_margin", "roic", "dso"].map((k) =>
    metricRow(filer.sector, k, period, sub),
  );
  const peers = filersOfSector(filer.sector, sub);
  return {
    filer,
    sector: SECTOR_BY_ID[filer.sector],
    period,
    rows,
    focal: symbol,
    beyond: {
      acceptanceLagDays: ri(`bl:${symbol}:lag`, 0, 6),
      extensionTagShare: sd(`bl:${symbol}:ext`, 2, 26, 1),
      riskFactorCount: ri(`bl:${symbol}:rf`, 16, 44),
      camCount: ri(`bl:${symbol}:cam`, 1, 3),
      auditor: pick(`bl:${symbol}:aud`, ["PricewaterhouseCoopers LLP", "Ernst & Young LLP", "Deloitte & Touche LLP", "KPMG LLP"]),
      auditorTenure: ri(`bl:${symbol}:tenure`, 3, 31),
      subsidiaries: ri(`bl:${symbol}:sub`, 4, 96),
      segmentCount: ri(`bl:${symbol}:seg`, 1, 5),
      lateFilings: ri(`bl:${symbol}:late`, 0, 2),
      boardChanges: ri(`bl:${symbol}:board`, 0, 4),
    },
    scatter: peers.map((p) => {
      const x = filerMetric(p.symbol, "rd_intensity", period).value ?? 0;
      const y = filerMetric(p.symbol, "operating_margin", period).value ?? 0;
      return { id: p.symbol, label: p.symbol, x, y, focal: p.symbol === symbol };
    }),
  };
}

export interface CompareCompaniesSurface {
  x: (typeof FILERS)[number];
  y: (typeof FILERS)[number];
  period: string;
  basisItems: { label: string; aligned: boolean; note: string }[];
  rows: {
    key: string;
    label: string;
    unit: string;
    inverted: boolean;
    a: number | null;
    b: number | null;
    aReason: string | null;
    bReason: string | null;
  }[];
  sharedCount: number;
  totalCount: number;
}

export function compareCompanies(xSym: string, ySym: string, period: string): CompareCompaniesSurface {
  const x = resolveFiler(xSym).filer;
  const y = resolveFiler(ySym).filer;
  const keys = ["gross_margin", "operating_margin", "rev_growth_yoy", "fcf_margin", "roic", "dso", "inventory_turnover", "rd_intensity", "net_debt_ebitda"];
  const rows = keys.map((k) => {
    const a = filerMetric(x.symbol, k, period);
    const b = filerMetric(y.symbol, k, period);
    return {
      key: k,
      label: a.def.label,
      unit: a.def.unit,
      inverted: a.def.favorability === "lower",
      a: a.value,
      b: b.value,
      aReason: a.reason,
      bReason: b.reason,
    };
  });
  const basisItems = [
    { label: "Fiscal year end", aligned: chance(`cb:${xSym}${ySym}:fy`, 0.6), note: "A December and a January year end put different quarters side by side." },
    { label: "Revenue recognition basis", aligned: true, note: "Both report under ASC 606." },
    { label: "Segment definition", aligned: chance(`cb:${xSym}${ySym}:seg`, 0.5), note: "Different operating segments make the mix incomparable even when totals line up." },
    { label: "Restatement basis", aligned: true, note: "Both shown as-restated." },
    { label: "Employee-count disclosure", aligned: chance(`cb:${xSym}${ySym}:hc`, 0.55), note: "Item 1 headcount is narrative, and not every filer states it." },
  ];
  return {
    x,
    y,
    period,
    basisItems,
    rows,
    sharedCount: rows.filter((r) => r.a != null && r.b != null).length,
    totalCount: rows.length,
  };
}

// ============================================================ managers

export interface ManagerSurface {
  manager: (typeof MANAGERS)[number];
  period: string;
  asOf: string;
  filed: string;
  positions: number;
  issuers: number;
  newPositions: number;
  exited: number;
  topHoldings: { symbol: string; name: string; shares: number; pctOut: number; prior: number }[];
  concentration: { label: string; share: number }[];
}

function managerHoldings(cik: number, period: string) {
  return FILERS.map((f) => {
    const shares = Math.round(sd(`mh:${cik}:${f.symbol}:${period}`, 1e5, 8.4e7, 0));
    return {
      symbol: f.symbol,
      name: f.name,
      shares,
      pctOut: round(sd(`mhp:${cik}:${f.symbol}`, 0.05, 8.6, 2), 2),
      prior: Math.round(shares * sd(`mhpr:${cik}:${f.symbol}:${period}`, 0.62, 1.42, 3)),
    };
  }).sort((a, b) => b.shares - a.shares);
}

export function managerSurface(cik: number, period: string): ManagerSurface {
  const manager = MANAGER_BY_CIK[cik] ?? MANAGERS[0];
  const holdings = managerHoldings(cik, period);
  const total = holdings.reduce((a, h) => a + h.shares, 0);
  const end = periodEnd(period);
  const filed = new Date(`${end}T00:00:00Z`);
  filed.setUTCDate(filed.getUTCDate() + ri(`mfiled:${cik}:${period}`, 12, 44));
  return {
    manager,
    period,
    asOf: end,
    filed: isoDate(filed),
    positions: ri(`mpos:${cik}:${period}`, 60, 5400),
    issuers: holdings.length,
    newPositions: ri(`mnew:${cik}:${period}`, 2, 48),
    exited: ri(`mex:${cik}:${period}`, 1, 39),
    topHoldings: holdings.slice(0, 10),
    concentration: [
      { label: "Top 1 issuer", share: holdings[0].shares / total },
      { label: "Issuers 2–5", share: holdings.slice(1, 5).reduce((a, h) => a + h.shares, 0) / total },
      { label: "Issuers 6–10", share: holdings.slice(5, 10).reduce((a, h) => a + h.shares, 0) / total },
      { label: "All other issuers", share: holdings.slice(10).reduce((a, h) => a + h.shares, 0) / total },
    ],
  };
}

export interface ManagerFootprintSurface {
  manager: (typeof MANAGERS)[number];
  period: string;
  leaves: { id: string; label: string; value: number; note?: string }[];
  pareto: { key: string; label: string; value: number; prior?: number }[];
  bySector: { key: string; label: string; positions: number }[];
}

export function managerFootprint(cik: number, period: string): ManagerFootprintSurface {
  const manager = MANAGER_BY_CIK[cik] ?? MANAGERS[0];
  const holdings = managerHoldings(cik, period);
  return {
    manager,
    period,
    // Composition is expressed in POSITIONS and shares outstanding, never dollars: 13F dollar
    // columns are market-priced, and this product carries no market data.
    leaves: holdings.slice(0, 16).map((h) => ({
      id: h.symbol,
      label: h.symbol,
      value: h.shares,
      note: `${h.pctOut}% of shares outstanding`,
    })),
    pareto: holdings.slice(0, 10).map((h) => ({ key: h.symbol, label: h.symbol, value: h.shares, prior: h.prior })),
    bySector: SECTORS.slice(0, 6).map((s) => ({
      key: s.id,
      label: s.short,
      positions: ri(`mfs:${cik}:${s.id}:${period}`, 3, 220),
    })),
  };
}

export interface ManagerVotingSurface {
  manager: (typeof MANAGERS)[number];
  period: string;
  proposals: { id: string; issuer: string; proposal: string; vote: "For" | "Against" | "Abstain" | "Withheld"; category: string; withMgmt: boolean }[];
  summary: { category: string; total: number; withMgmt: number }[];
}

export function managerVoting(cik: number, period: string): ManagerVotingSurface {
  const manager = MANAGER_BY_CIK[cik] ?? MANAGERS[0];
  const cats = ["Director elections", "Say-on-pay", "Auditor ratification", "Shareholder proposals", "Capital structure"];
  const proposals = Array.from({ length: 18 }, (_x, i) => {
    const f = FILERS[i % FILERS.length];
    const category = cats[ri(`mv:${cik}:${i}:c`, 0, cats.length - 1)];
    const withMgmt = chance(`mv:${cik}:${i}:w`, category === "Shareholder proposals" ? 0.35 : 0.9);
    return {
      id: `${cik}-${i}`,
      issuer: f.symbol,
      proposal:
        category === "Director elections"
          ? "Elect director — management slate"
          : category === "Say-on-pay"
            ? "Advisory vote on executive compensation"
            : category === "Auditor ratification"
              ? "Ratify appointment of independent auditor"
              : category === "Capital structure"
                ? "Increase authorized share count"
                : "Report on political spending",
      vote: (withMgmt ? "For" : pick(`mv:${cik}:${i}:v`, ["Against", "Withheld", "Abstain"])) as "For" | "Against" | "Abstain" | "Withheld",
      category,
      withMgmt,
    };
  });
  return {
    manager,
    period,
    proposals,
    summary: cats.map((c) => {
      const rows = proposals.filter((p) => p.category === c);
      return { category: c, total: rows.length, withMgmt: rows.filter((p) => p.withMgmt).length };
    }),
  };
}

export interface ManagerFivePercentSurface {
  manager: (typeof MANAGERS)[number];
  period: string;
  stakes: { name: string; points: { date: string; value: number }[] }[];
  filings: { id: string; issuer: string; form: "SC 13D" | "SC 13G" | "SC 13D/A" | "SC 13G/A"; filed: string; pct: number }[];
}

export function managerFivePercent(cik: number, period: string): ManagerFivePercentSurface {
  const manager = MANAGER_BY_CIK[cik] ?? MANAGERS[0];
  const quarters = trailingQuarters(period, 8);
  const issuers = FILERS.slice(0, 3);
  return {
    manager,
    period,
    stakes: issuers.map((f) => ({
      name: f.symbol,
      points: quarters.map((q, i) => ({
        date: periodEnd(q),
        value: round(sd(`fp:${cik}:${f.symbol}:${i}`, 3.4, 11.2, 2), 2),
      })),
    })),
    filings: issuers.flatMap((f, i) =>
      quarters.slice(-3).map((q, j) => ({
        id: `${cik}-${f.symbol}-${j}`,
        issuer: f.symbol,
        form: (j === 0 ? "SC 13G" : "SC 13G/A") as "SC 13G" | "SC 13G/A",
        filed: periodEnd(q),
        pct: round(sd(`fpf:${cik}:${f.symbol}:${j}:${i}`, 4.6, 10.8, 2), 2),
      })),
    ),
  };
}

/** The most recent quarter end on or before `iso`. */
function quarterEndBefore(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const ends = [2, 5, 8, 11]; // Mar, Jun, Sep, Dec
  const y = d.getUTCFullYear();
  const candidates = ends
    .map((m) => new Date(Date.UTC(y, m + 1, 0)))
    .concat(ends.map((m) => new Date(Date.UTC(y - 1, m + 1, 0))))
    .filter((c) => c <= d)
    .sort((a, b) => b.getTime() - a.getTime());
  return isoDate(candidates[0]);
}

/** 45 days after the most recent quarter end — the next 13F-HR deadline. */
function nextDeadline(iso: string): string {
  const q = new Date(`${quarterEndBefore(iso)}T00:00:00Z`);
  q.setUTCDate(q.getUTCDate() + 45);
  return isoDate(q);
}

export interface ManagerActivitySurface {
  manager: (typeof MANAGERS)[number];
  period: string;
  newestFact: { label: string; date: string; ageDays: number };
  clocks: { label: string; value: string; note: string }[];
  ledger: { form: string; asOf: string; ageDays: number; tells: string; cannot: string }[];
  window: { statutory: number; filings: { id: string; label: string; day: number }[] };
}

export function managerActivity(cik: number, period: string): ManagerActivitySurface {
  const manager = MANAGER_BY_CIK[cik] ?? MANAGERS[0];
  const base = managerSurface(cik, period);
  const today = "2026-08-01";
  const lag = daysBetween(base.asOf, base.filed);

  return {
    manager,
    period,
    // The age of the newest fact is shown as prominently as the fact (RECONCILIATION §4.1).
    newestFact: {
      label: `13F-HR for ${period}`,
      date: base.filed,
      ageDays: daysBetween(base.filed, today),
    },
    clocks: [
      { label: "Since last filing", value: `${daysBetween(base.filed, today)} d`, note: `13F-HR accepted ${humanDate(base.filed)}` },
      { label: "Position-data age", value: `${daysBetween(base.asOf, today)} d`, note: `Holdings are as of ${humanDate(base.asOf)}, not today` },
      {
        label: "Next filing due",
        value: `${daysBetween(today, nextDeadline(today))} d`,
        note: `13F-HR for the quarter ended ${humanDate(quarterEndBefore(today))} is due ${humanDate(nextDeadline(today))}`,
      },
      { label: "Insider filings", value: "N/A", note: "No reported stake reaches 10%, so Section 16 does not apply and no Form 4 is due" },
    ],
    ledger: [
      {
        form: "13F-HR",
        asOf: base.asOf,
        ageDays: daysBetween(base.asOf, today),
        tells: `Long positions in Section 13(f) securities held at ${humanDate(base.asOf)}, and the share counts behind them.`,
        cannot: "Cannot tell you shorts, derivatives, cash, non-13(f) securities, or anything that happened after the quarter end — including a position exited the next day.",
      },
      {
        form: "SC 13G",
        asOf: base.asOf,
        ageDays: daysBetween(base.asOf, today) + 30,
        tells: "Passive beneficial ownership crossing 5% of a class, with the date the threshold was crossed.",
        cannot: "Cannot tell you about stakes below 5%, and an amendment is only required on a material change — so silence is not evidence of no change.",
      },
      {
        form: "N-PX",
        asOf: `${period.slice(0, 4)}-06-30`,
        ageDays: 400,
        tells: "How the manager voted every proxy it had authority over, for the year ended 30 June.",
        cannot: "Cannot tell you why a vote was cast, and it is annual — a vote in August surfaces more than a year later.",
      },
      {
        form: "Form 4",
        asOf: "—",
        ageDays: 0,
        tells: "Nothing for this filer.",
        cannot: "No reported stake reaches 10%, so Section 16 does not apply and no Form 4 is due. This is a structural absence, not missing data.",
      },
    ],
    window: {
      statutory: 45,
      filings: [{ id: "13f", label: `13F-HR for ${period}`, day: lag }],
    },
  };
}

export interface ManagerBehaviourSurface {
  manager: (typeof MANAGERS)[number];
  period: string;
  cadence: number[];
  cadenceMedian: number;
  acceptanceHours: number[];
  dumbbell: { key: string; label: string; prior: number; current: number }[];
  cohort: { rows: string[]; cols: string[]; cells: { row: string; col: string; value: number | null }[] };
  amendmentRate: number;
}

export function managerBehaviour(cik: number, period: string): ManagerBehaviourSurface {
  const manager = MANAGER_BY_CIK[cik] ?? MANAGERS[0];
  const quarters = trailingQuarters(period, 8);
  const cadence = quarters.map((q) => ri(`cad:${cik}:${q}`, 21, 45));
  const holdings = managerHoldings(cik, period);
  return {
    manager,
    period,
    cadence,
    cadenceMedian: quantiles(cadence).med,
    acceptanceHours: Array.from({ length: 24 }, (_x, i) => ri(`hr:${cik}:${i}`, 0, i >= 14 && i <= 18 ? 9 : 2)),
    dumbbell: holdings.slice(0, 8).map((h) => ({
      key: h.symbol,
      label: h.symbol,
      prior: h.prior,
      current: h.shares,
    })),
    cohort: {
      rows: ["Held 1 qtr", "2–3 qtrs", "4–7 qtrs", "8+ qtrs"],
      cols: quarters.slice(-6).map((q) => q.replace("-", " ")),
      cells: ["Held 1 qtr", "2–3 qtrs", "4–7 qtrs", "8+ qtrs"].flatMap((row) =>
        quarters.slice(-6).map((q) => ({
          row,
          col: q.replace("-", " "),
          value: chance(`mcoh:${cik}:${row}:${q}`, 0.08) ? null : ri(`mcohv:${cik}:${row}:${q}`, 1, 64),
        })),
      ),
    },
    amendmentRate: sd(`amd:${cik}`, 0, 28, 1),
  };
}
