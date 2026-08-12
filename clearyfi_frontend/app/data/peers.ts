/**
 * Company Hub → Peer-relative, ported from the prototype's peer pool, `dist`, and `peerExtras`.
 *
 * The view answers one question — where does this filer sit among the others — and answers it
 * twice over: once on reported financials, then again on things that are NOT financial results
 * (how it files, which elections it makes, how its register is shaped, what it owes).
 *
 * Percentiles here are POSITIONAL. Where a metric has a favorability direction the percentile is
 * adjusted for it; where it has none (`hib: null`) the raw position is shown and no direction is
 * implied. A filer at P90 on custom XBRL elements is not doing badly — it is harder to compare,
 * and that is the finding.
 *
 * Synthetic (see `data/README.md`), seeded from the ticker.
 */
import { seedN } from "../lib/seed";
import { PEER_TICKERS } from "./qualitative";
import type { ThemeId } from "./prototype";

export interface MetricDef {
  key: string;
  name: string;
  lo: number;
  hi: number;
  /** `true` higher is better, `false` lower is better, `null` no direction. */
  hib: boolean | null;
  fmt: "%" | "x" | "$k" | "d";
}

/** The six reported-financial metrics the distribution panel plots. */
export const METRIC_DEFS: MetricDef[] = [
  { key: "netMargin", name: "Net margin", lo: 4, hi: 42, hib: true, fmt: "%" },
  { key: "revGrowth", name: "Revenue growth YoY", lo: -8, hi: 46, hib: true, fmt: "%" },
  { key: "nde", name: "Net debt / EBITDA", lo: -0.6, hi: 3.4, hib: false, fmt: "x" },
  { key: "fcfMargin", name: "FCF margin", lo: 2, hi: 36, hib: true, fmt: "%" },
  { key: "invTurn", name: "Inventory turnover", lo: 2, hi: 7.5, hib: true, fmt: "x" },
  { key: "effTax", name: "Effective tax rate", lo: 7, hi: 25, hib: null, fmt: "%" },
];

export function fmtVal(v: number, f: MetricDef["fmt"]): string {
  if (f === "%") return `${v.toFixed(1)}%`;
  if (f === "x") return `${v.toFixed(1)}x`;
  if (f === "$k") return `$${Math.round(v)}k`;
  return String(v);
}

/** The peer pool, one metric bundle per ticker. */
export const PEERS: { ticker: string; m: Record<string, number> }[] = PEER_TICKERS.map((tk) => {
  const m: Record<string, number> = {};
  for (const d of METRIC_DEFS) m[d.key] = d.lo + seedN(`${tk}|${d.key}`) * (d.hi - d.lo);
  return { ticker: tk, m };
});

function quant(arr: number[], p: number): number {
  const s = [...arr].sort((a, b) => a - b);
  const i = (s.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}

/** Per-metric distribution stats across the whole pool. */
export const DIST: Record<string, { q1: number; med: number; q3: number; min: number; max: number }> =
  Object.fromEntries(
    METRIC_DEFS.map((d) => {
      const vals = PEERS.map((p) => p.m[d.key]);
      return [
        d.key,
        { q1: quant(vals, 0.25), med: quant(vals, 0.5), q3: quant(vals, 0.75), min: Math.min(...vals), max: Math.max(...vals) },
      ];
    }),
  );

/** Theme percentiles for the sticky left rail. */
export const CO_THEME_PCT: Record<ThemeId, number> = {
  prof: 88, growth: 76, health: 64, cash: 91, eff: 58, acct: 82, struct: 70,
};

export interface DistRow {
  key: string;
  name: string;
  /** Set where the metric reads better LOW — the row says so rather than colouring anything. */
  dirTag: boolean;
  valueLabel: string;
  trendLabel: string;
  trendCaption: string;
  spark: number[];
  focalVal: number;
  fmt: MetricDef["fmt"];
  dist: { q1: number; med: number; q3: number; min: number; max: number };
  peers: { ticker: string; val: number }[];
}

/** The six reported-financial rows for one focal filer. */
export function distRows(T: string): DistRow[] {
  const focal = PEERS.find((p) => p.ticker === T) ?? PEERS[0];
  return METRIC_DEFS.map((d) => {
    const val = focal.m[d.key];
    const below = (PEERS.filter((p) => p.m[d.key] < val).length / (PEERS.length - 1)) * 100;
    // Favorability adjustment: a low net-debt/EBITDA is a HIGH percentile. Where the metric has
    // no agreed direction the raw position is shown and nothing is inverted.
    const P = d.hib == null ? Math.round(below) : Math.round(d.hib === false ? 100 - below : below);
    const spark: number[] = [];
    for (let i = 0; i < 8; i++) spark.push(val * (0.82 + seedN(T + d.key + i) * 0.32));
    spark[7] = val;
    const chg = spark[7] - spark[0];
    const tg = Math.abs(chg) < Math.abs(val) * 0.03 ? "→" : chg > 0 ? "↑" : "↓";
    return {
      key: d.key,
      name: d.name,
      dirTag: d.hib === false,
      valueLabel: `${fmtVal(val, d.fmt)} · P${P}`,
      trendLabel: `${tg} 8q`,
      trendCaption: `${fmtVal(spark[0], d.fmt)} → ${fmtVal(val, d.fmt)} over 8 quarters · this filer only, not peers`,
      spark,
      focalVal: val,
      fmt: d.fmt,
      dist: DIST[d.key],
      peers: PEERS.filter((p) => p.ticker !== T).map((p) => ({ ticker: p.ticker, val: p.m[d.key] })),
    };
  });
}

// ============================================================ beyond the financials

export interface PeerXRow {
  id: string;
  name: string;
  src: string;
  note: string;
  fmt: (v: number) => string;
  vals: { ticker: string; val: number }[];
  min: number; max: number; q1: number; med: number; q3: number;
  focalVal: number;
  pct: number;
  spk: number[];
  valueLabel: string;
  trendLabel: string;
  trendCaption: string;
}

export interface PresenceTable {
  cols: string[];
  rows: { label: string; focal: boolean; cells: number[] }[];
  note: string;
}

export interface MethodMix {
  rows: { k: string; n: string; w: string; focal: boolean }[];
  focalLabel: string;
}

export interface PeerExtras {
  peerNote: string;
  disclosure: PeerXRow[];
  accounting: PeerXRow[];
  governance: PeerXRow[];
  ownership: PeerXRow[];
  obligations: PeerXRow[];
  nonGaap: PresenceTable;
  taxDrivers: PresenceTable;
  camTopics: PresenceTable;
  contingency: PresenceTable;
  inventory: MethodMix;
  revenue: MethodMix;
  software: MethodMix;
  jurisdictions: { k: string; pct: string; w: string; medPct: string; pw: string }[];
  ladder: { ticker: string; focal: boolean; labels: string[]; segs: number[] }[];
  ladderLabels: string[];
  shared: { pct: string; managers: { name: string; pct: string; w: string }[]; note: string };
}

/** Minus sign, not hyphen — a hyphen in a numeric column reads as a dash for "no value". */
const mn = (t: string | number) => String(t).replace("-", "−");
const d0 = (v: number) => mn(Math.round(v).toLocaleString());
const d1 = (v: number) => mn(v.toFixed(1));
const pc = (v: number) => mn(`${v.toFixed(1)}%`);
const pc0 = (v: number) => mn(`${Math.round(v)}%`);
const dys = (v: number) => mn(`${Math.round(v)} d`);
const yrs = (v: number) => `${v.toFixed(0)} yr`;
const bps = (v: number) => mn(`${Math.round(v)} bps`);

export function peerExtras(F: string): PeerExtras {
  const sd = seedN;
  const tickers = PEER_TICKERS as readonly string[];

  const mk = (
    id: string, name: string, lo: number, hi: number,
    f: (v: number) => string, src: string, note: string, rnd?: boolean,
  ): PeerXRow => {
    const vals = tickers.map((t) => {
      let v = lo + sd(t + id) * (hi - lo);
      if (rnd) v = Math.round(v);
      return { ticker: t, val: v };
    });
    const sorted = vals.map((v) => v.val).slice().sort((a, b) => a - b);
    const q = (p: number) => sorted[Math.max(0, Math.min(sorted.length - 1, Math.round(p * (sorted.length - 1))))];
    const row = vals.find((v) => v.ticker === F) ?? vals[0];
    const below = (vals.filter((v) => v.val < row.val).length / Math.max(1, vals.length - 1)) * 100;
    const floor = lo < 0 ? -Infinity : 0;
    const spk: number[] = [];
    for (let i = 0; i < 8; i++) spk.push(Math.max(floor, row.val * (0.86 + sd(`${F}${id}h${i}`) * 0.28)));
    spk[7] = row.val;
    const c = spk[7] - spk[0];
    const scale = Math.abs(row.val) || 1;
    return {
      id, name, src, note, fmt: f, vals,
      min: sorted[0], max: sorted[sorted.length - 1],
      q1: q(0.25), med: q(0.5), q3: q(0.75),
      focalVal: row.val, pct: Math.round(below), spk,
      valueLabel: `${f(row.val)} · P${Math.round(below)}`,
      trendLabel: `${Math.abs(c) < scale * 0.03 ? "→" : c > 0 ? "↑" : "↓"} 8q`,
      trendCaption: `${f(spk[0])} → ${f(spk[7])} over eight quarters · this filer only, not peers`,
    };
  };

  const disclosure = [
    mk("pun", "Filing lag, most recent 10-Q", 26, 46, dys, "EDGAR acceptance timestamp vs period end",
      "Days from period end to EDGAR acceptance. Earlier is not better — it is a description of the filer’s own cadence."),
    mk("amd", "Amended filings, trailing 3 years", 0, 9, d0, "10-K/A, 10-Q/A, 8-K Item 4.02",
      "Counts amendments that restate something already filed, including Item 4.02 non-reliance notices.", true),
    mk("rfw", "Risk-factor length", 4200, 24000, d0, "10-K Item 1A word count",
      "Word count only. Longer disclosure is neither more nor less risk — it is more text."),
    mk("txw", "Tax footnote length", 900, 4200, d0, "10-K income-tax footnote word count",
      "Measured on the tax footnote alone, which is where rate-driver detail lives."),
    mk("seg", "Reportable segments", 1, 6, d0, "ASC 280 segment footnote",
      "Segment count is the filer’s own judgment about how the business is managed.", true),
    mk("rsg", "Re-segmentations, trailing 5 years", 0, 3, d0, "segment footnote restated in a later filing",
      "Each event breaks comparability with earlier filings for that filer.", true),
    mk("l25", "Form 12b-25 notices, trailing 3 years", 0, 2, d0, "Form 12b-25",
      "A notice of late filing. It says the filer told the SEC it would miss a deadline.", true),
  ];

  const accounting = [
    mk("ext", "Custom XBRL elements", 4, 34, pc, "XBRL facts tagged with filer extensions",
      "Share of tagged facts using a filer-created element instead of a standard US-GAAP element. High use makes a filer harder to compare, which is itself the finding."),
  ];

  const governance = [
    mk("afr", "Audit fees over revenue", 2, 22, bps, "DEF 14A fee table · 10-K revenue",
      "Total audit fees as basis points of revenue, from the proxy fee table."),
    mk("aten", "Auditor tenure", 3, 38, yrs, "DEF 14A · auditor report",
      "Years the current audit firm has been engaged, as stated in the proxy."),
    mk("cam", "Critical audit matters", 1, 4, d0, "auditor report in the 10-K",
      "Count of CAMs the auditor identified. More CAMs means more areas the auditor called out as requiring especially challenging judgment.", true),
    mk("sop", "Say-on-pay support", 58, 98, pc, "8-K Item 5.07",
      "Certified support on the advisory compensation vote at the most recent annual meeting."),
    mk("whd", "Director withhold", 1, 26, pc, "8-K Item 5.07",
      "Largest withhold or against percentage across the director slate."),
    mk("ins", "Insider net direction, trailing year", -8, 3, pc, "Forms 3/4/5",
      "Net shares acquired less disposed by Section 16 filers, as a percentage of their reported holdings."),
    mk("plan", "Officers with a 10b5-1 plan", 10, 90, pc0, "Form 4 / 144 plan references",
      "Share of Section 16 officers with a Rule 10b5-1 plan referenced in the trailing year."),
    mk("i405", "Item 405 delinquencies, trailing 3 years", 0, 3, d0, "DEF 14A Item 405",
      "Late Section 16 filings the registrant itself disclosed.", true),
    mk("churn", "Officer and director changes per year", 0.5, 6, d1, "8-K Item 5.02",
      "Departures, appointments and elections reported under Item 5.02, annualised over three years."),
  ];

  const ownership = [
    mk("eff", "Effective number of holders", 9, 180, d0, "13F-HR register · 10,000 ÷ HHI",
      "The reciprocal of the register’s Herfindahl index. Affiliated managers that file separately count separately.", true),
    mk("stab", "Stable-capital share", 28, 72, pc0, "13F-HR registers, tenure-weighted",
      "Register weighted by how long each manager has held: 8+ quarters fully, 4–7 at half, 2–3 at a quarter."),
    mk("turn", "Register turnover", 6, 32, pc, "manager CIKs matched across consecutive 13F-HR filings",
      "Managers entering or exiting as a share of the prior quarter’s register. A manager falling under the $100M threshold reads as an exit."),
  ];

  const obligations = [
    mk("d3y", "Debt due within three years", 8, 74, pc0, "10-K long-term debt maturity table",
      "Share of total principal scheduled to mature inside three years, as tabled in the debt footnote."),
    mk("sub", "Subsidiaries listed in EX-21", 8, 180, d0, "10-K Exhibit 21",
      "Count of significant subsidiaries the filer chose to list. EX-21 omits subsidiaries the filer deems insignificant.", true),
    mk("jur", "Jurisdictions in EX-21", 3, 28, d0, "10-K Exhibit 21",
      "Distinct jurisdictions of organisation across listed subsidiaries.", true),
    mk("lea", "Operating-lease share of fixed obligations", 6, 48, pc0, "ASC 842 lease footnote · debt footnote",
      "Undiscounted operating-lease payments as a share of lease plus debt obligations."),
  ];

  // ---------------------------------------------------------------- presence matrices
  // Twelve filers, focal first, so the reader's own filer is the row they read against.
  const others = tickers.filter((t) => t !== F).slice(0, 11);
  const mRows = [F, ...others];
  const matrix = (id: string, cols: string[], bias: number[]) =>
    mRows.map((t) => ({
      label: t,
      focal: t === F,
      cells: cols.map((_c, ci) => (sd(`${t}${id}${ci}`) < bias[ci] ? 1 : 0)),
    }));

  const nonGaapCols = ["SBC", "Amort", "Restr", "Impair", "Litig", "Acq", "FX", "TaxAdj"];
  const taxCols = ["Foreign", "R&D", "State", "SBC", "ValAllow", "OneTime"];
  const camCols = ["Revenue", "Goodwill", "Inventory", "Taxes", "Conting", "BusComb"];
  const contCols = ["Accrued", "Possible", "Range", "NoEst", "Immaterial"];

  // ---------------------------------------------------------------- elections
  const methodMix = (id: string, options: string[]): MethodMix => {
    const counts = options.map(() => 0);
    const pickOf: Record<string, number> = {};
    for (const t of tickers) {
      const i = Math.floor(sd(t + id) * options.length);
      counts[i]++;
      pickOf[t] = i;
    }
    const tot = tickers.length;
    return {
      rows: options.map((o, i) => ({
        k: o,
        n: `${counts[i]} of ${tot}`,
        w: `${Math.round((counts[i] / tot) * 100)}%`,
        focal: pickOf[F] === i,
      })),
      focalLabel: options[pickOf[F]],
    };
  };

  // ---------------------------------------------------------------- EX-21 jurisdictions
  const jurNames = ["Delaware", "California", "Cayman Islands", "Singapore", "Ireland", "Netherlands", "Taiwan", "China", "Japan", "Germany"];
  const focalRaw = jurNames.map((_n, i) => 0.4 + sd(`${F}ju${i}`) * 4);
  const medRaw = jurNames.map((_n, i) => {
    const vs = tickers.map((t) => 0.4 + sd(`${t}ju${i}`) * 4).sort((a, b) => a - b);
    return vs[Math.floor(vs.length / 2)];
  });
  const ft = focalRaw.reduce((a, v) => a + v, 0);
  const mt = medRaw.reduce((a, v) => a + v, 0);
  const jurisdictions = jurNames
    .map((n, i) => ({
      k: n,
      pct: `${((focalRaw[i] / ft) * 100).toFixed(0)}%`,
      w: `${((focalRaw[i] / ft) * 100).toFixed(0)}%`,
      medPct: `${((medRaw[i] / mt) * 100).toFixed(0)}%`,
      pw: `${((medRaw[i] / mt) * 100).toFixed(0)}%`,
    }))
    .sort((a, b) => parseFloat(b.pct) - parseFloat(a.pct));

  // ---------------------------------------------------------------- maturity ladders
  const ladderLabels = ["Within 1 year", "1–3 years", "3–5 years", "Beyond 5 years"];
  const ladder = mRows.map((t) => {
    const raw = [0.6 + sd(`${t}l0`) * 2.2, 1 + sd(`${t}l1`) * 2.4, 0.8 + sd(`${t}l2`) * 2, 0.6 + sd(`${t}l3`) * 3.4];
    const tot = raw.reduce((a, v) => a + v, 0);
    return { ticker: t, focal: t === F, labels: ladderLabels, segs: raw.map((v) => +((v / tot) * 100).toFixed(1)) };
  });

  // ---------------------------------------------------------------- shared holders
  const sharedMgrs = [
    "Index manager A", "Index manager B", "Index manager C", "Active manager D", "Pension system F",
    "Sovereign fund G", "Insurance manager I", "Hedge fund H", "Quant manager K", "Bank trust L",
  ]
    .map((n, i) => ({ name: n, raw: 1.6 + sd(`${F}sm${i}`) * 7 }))
    .sort((a, b) => b.raw - a.raw);
  const sharedTop10 = sharedMgrs.reduce((a, m) => a + m.raw, 0);

  return {
    peerNote: `Peer set is every filer in this sector with a filing on record for the period (${tickers.length} filers). Values are derived from the filings named under each row; percentiles are positional, not favorable or unfavorable.`,
    disclosure, accounting, governance, ownership, obligations,
    nonGaap: {
      cols: nonGaapCols,
      rows: matrix("ng", nonGaapCols, [0.92, 0.8, 0.62, 0.45, 0.3, 0.55, 0.35, 0.7]),
      note: "SBC stock compensation · Amort intangible amortisation · Restr restructuring · Impair impairment · Litig litigation · Acq acquisition costs · FX currency · TaxAdj tax effect of adjustments. Which items each filer excludes in its own non-GAAP reconciliation, as tabled in the 8-K Item 2.02 exhibit or the 10-K. Presence is the filer’s election, not a judgment about it.",
    },
    taxDrivers: {
      cols: taxCols,
      rows: matrix("tx", taxCols, [0.9, 0.72, 0.85, 0.6, 0.4, 0.5]),
      note: "Foreign rate differential · R&D credit · State taxes · SBC stock compensation · ValAllow valuation allowance · OneTime discrete items. Drivers each filer names in its effective-tax-rate reconciliation. The rate itself is a reported metric; which drivers are named is a disclosure choice.",
    },
    camTopics: {
      cols: camCols,
      rows: matrix("cm", camCols, [0.55, 0.45, 0.35, 0.4, 0.3, 0.35]),
      note: "Revenue recognition · Goodwill and intangibles · Inventory valuation · Income taxes · Conting contingencies · BusComb business combinations. Topics named as critical audit matters in each filer’s auditor report. Overlap shows what auditors treat as difficult across the sector.",
    },
    contingency: {
      cols: contCols,
      rows: matrix("cg", contCols, [0.5, 0.72, 0.4, 0.62, 0.55]),
      note: "Accrued probable and accrued · Possible reasonably possible · Range range disclosed · NoEst cannot estimate · Immaterial not material individually. Which ASC 450 language each filer uses in its commitments and contingencies footnote. “Cannot estimate” and “reasonably possible” are the phrases that carry the most unquantified exposure.",
    },
    inventory: methodMix("inv", ["Average cost", "FIFO", "Standard cost", "LIFO for part of inventory"]),
    revenue: methodMix("rev", ["Disaggregated by product line", "By segment and geography", "By timing of transfer", "By customer type"]),
    software: methodMix("cap", ["Capitalises internal-use software", "Expenses development as incurred", "Both, by project"]),
    jurisdictions,
    ladder,
    ladderLabels,
    shared: {
      pct: `${sharedTop10.toFixed(0)}%`,
      managers: sharedMgrs.map((m) => ({
        name: m.name,
        pct: `${m.raw.toFixed(1)}%`,
        w: `${Math.min(100, (m.raw / sharedMgrs[0].raw) * 100).toFixed(0)}%`,
      })),
      note: "Share of the combined 13F-reported holdings of every filer in this peer set that sits with the ten largest managers. This is a property of the sector’s register, not of any one company: the same managers appear on both sides of most peer comparisons.",
    },
  };
}

/** The five "beyond the financials" groups, in rail order. */
export const PX_GROUPS = [
  { key: "disclosure", label: "Disclosure behavior", id: "p1", n: "01", src: "filing metadata only — dates, forms and item codes, never a document's contents" },
  { key: "accounting", label: "Accounting choices", id: "p2", n: "02", src: "same GAAP, different elections" },
  { key: "governance", label: "Governance & people", id: "p3", n: "03", src: "proxy tables, auditor reports and Section 16 filings" },
  { key: "ownership", label: "Ownership shape", id: "p4", n: "04", src: "the same register measures, peer by peer" },
  { key: "obligations", label: "Obligations & structure", id: "p5", n: "05", src: "maturity shape, legal footprint and contingency language" },
] as const;

export type PxGroup = (typeof PX_GROUPS)[number]["key"];

/** Filing-history flags. Two are conditional; "timely filer" always closes the row. */
export function companyFlags(T: string) {
  const flags: { label: string; color: string; bg: string; border: string }[] = [];
  const ext = { color: "var(--ext-color)", bg: "var(--ext-bg)", border: "var(--ext-border)" };
  if (seedN(`${T}rs`) > 0.9) flags.push({ label: "restatement", ...ext });
  if (seedN(`${T}mw`) > 0.82) flags.push({ label: "material weakness", ...ext });
  flags.push({ label: "timely filer", color: "var(--ink-soft)", bg: "transparent", border: "var(--border-strong)" });
  return flags;
}

export const RECENT_FILINGS = [
  { form: "10-Q", desc: "Quarterly report · Q1 FY26", date: "2026-05-04" },
  { form: "8-K", desc: "Item 2.02 · earnings release", date: "2026-05-04" },
  { form: "4", desc: "Insider transaction · officer", date: "2026-04-22" },
  { form: "10-K", desc: "Annual report · FY25", date: "2026-02-11" },
  { form: "8-K", desc: "Item 5.02 · officer appointment", date: "2026-01-28" },
];
