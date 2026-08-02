/**
 * The two Compare surfaces' data, ported from the prototype's `compare` block and `ccData`.
 *
 * Sector-vs-sector compares two composites. Company-vs-company is the harder one, and its
 * argument is stated before any number appears: **what has to line up before two filers can be
 * compared at all.** Fiscal year ends, statement basis, segment structure and which measures
 * both filers even tag. Where a measure is absent from one filer's statements it is OMITTED
 * rather than shown as zero — a bank has no gross margin, and printing 0% would be a lie about
 * the business rather than a gap in our data.
 *
 * No row on either surface declares a winner. A/B colour is categorical identity.
 *
 * Synthetic (see `data/README.md`).
 */
import { seedN } from "../lib/seed";
import { SECTOR_ABBR, SECTOR_NAMES, SECTOR_SCORES, THEMES } from "./prototype";

const money = (v: number) => `$${v >= 1000 ? `${(v / 1000).toFixed(1)}T` : `${v.toFixed(1)}B`}`;
const pct = (v: number) => `${v.toFixed(1)}%`;
const d0 = (v: number) => Math.round(v).toLocaleString();
const x1 = (v: number) => `${v.toFixed(1)}x`;
const yrs = (v: number) => `${Math.round(v)} yr`;
const dys = (v: number) => `${Math.round(v)} d`;

// ============================================================ sector vs sector

/** The six metric medians the sector comparison cards plot. */
export const COMPARE_METRICS = [
  { name: "Net margin", a: 22.4, b: 18.1, fmt: "%", inv: false },
  { name: "Revenue growth YoY", a: 14.2, b: 16.8, fmt: "%", inv: false },
  { name: "R&D / revenue", a: 17.5, b: 21.3, fmt: "%", inv: false },
  { name: "Net debt / EBITDA", a: 0.6, b: 0.9, fmt: "x", inv: true },
  { name: "FCF margin", a: 19.8, b: 24.6, fmt: "%", inv: false },
  { name: "Revenue / employee", a: 684, b: 412, fmt: "$k", inv: false },
] as const;

const fmtMetric = (v: number, f: string) =>
  f === "%" ? `${v.toFixed(1)}%` : f === "x" ? `${v.toFixed(1)}x` : `$${Math.round(v)}k`;

export interface SectorCompare {
  aName: string;
  bName: string;
  counts: string;
  rows: { name: string; a: number; b: number; gapLabel: string; strong: boolean }[];
  radarA: number[];
  radarB: number[];
  radarAxes: string[];
  cards: {
    name: string;
    inverted: boolean;
    aLabel: string;
    bLabel: string;
    a: number;
    b: number;
    spreadA: { q1: number; med: number; q3: number };
    spreadB: { q1: number; med: number; q3: number };
    fmt: (v: number) => string;
  }[];
}

const THEME_ABBR: Record<string, string> = {
  prof: "Profit", growth: "Growth", health: "Health", cash: "Cash",
  eff: "Efficiency", acct: "Acct", struct: "Structure",
};

export function sectorCompare(ai: number, bi: number, peerCount: number): SectorCompare {
  const rows = THEMES.map((t) => {
    const a = SECTOR_SCORES[t.id][ai];
    const b = SECTOR_SCORES[t.id][bi];
    const gap = a - b;
    const lead = gap === 0 ? "even" : gap > 0 ? SECTOR_ABBR[ai] : SECTOR_ABBR[bi];
    return {
      name: t.name, a, b,
      gapLabel: gap === 0 ? "even" : `${gap > 0 ? "+" : "−"}${Math.abs(gap)} ${lead}`,
      // Emphasis at a 10-point gap — the reader's cue that the two are structurally unlike,
      // not a verdict about which is better.
      strong: Math.abs(gap) >= 10,
    };
  });

  const cards = COMPARE_METRICS.map((m) => {
    // Synthesised IQR around each median: A tighter, B wider — deterministic, as the prototype.
    const spreadA = Math.abs(m.a) * 0.28 + (m.fmt === "x" ? 0.3 : 2);
    const spreadB = Math.abs(m.b) * 0.36 + (m.fmt === "x" ? 0.4 : 2.5);
    return {
      name: m.name,
      inverted: m.inv,
      a: m.a, b: m.b,
      aLabel: fmtMetric(m.a, m.fmt),
      bLabel: fmtMetric(m.b, m.fmt),
      // q1/q3 only. The prototype's rail spans the IQR across both sectors and draws no
      // whiskers — inventing tails would put marks on the page no filing supports.
      spreadA: { q1: m.a - spreadA, med: m.a, q3: m.a + spreadA },
      spreadB: { q1: m.b - spreadB, med: m.b, q3: m.b + spreadB },
      fmt: (v: number) => fmtMetric(v, m.fmt),
    };
  });

  return {
    aName: SECTOR_NAMES[ai],
    bName: SECTOR_NAMES[bi],
    counts: `${peerCount} vs 148 filers · Q1 FY26`,
    rows,
    radarA: THEMES.map((t) => SECTOR_SCORES[t.id][ai]),
    radarB: THEMES.map((t) => SECTOR_SCORES[t.id][bi]),
    radarAxes: THEMES.map((t) => THEME_ABBR[t.id]),
    cards,
  };
}

/**
 * The company comparison's seven sections — the rail's jump list.
 *
 * 02 is abbreviated to "Reported figures" where the section header reads "Reported figures, as
 * filed", the same compression the hub rail uses: the ordinals bind rail to header, so the text
 * may shorten to stay on one line.
 */
export const CC_SECTIONS = [
  { n: "01", label: "Financial metrics", href: "#c1" },
  { n: "02", label: "Reported figures", href: "#c2" },
  { n: "03", label: "Business model", href: "#c3" },
  { n: "04", label: "Disclosure & governance", href: "#c4" },
  { n: "05", label: "Managers holding both", href: "#c5" },
  { n: "06", label: "Filing basis", href: "#c6" },
  { n: "07", label: "What can be compared", href: "#c7" },
];

// ============================================================ company vs company

/** Per-sector statement traits — what the filings actually contain. */
const SECTOR_TRAITS: Record<number, { scale: number; gross: boolean; inv: boolean; rd: boolean; rate: boolean; interest: boolean; fye: string; std: string }> = {
  0: { scale: 26, gross: true, inv: true, rd: true, rate: false, interest: false, fye: "Dec 31", std: "ASC 606 · ASC 842" },
  1: { scale: 34, gross: true, inv: false, rd: true, rate: false, interest: false, fye: "Jun 30", std: "ASC 606 · ASC 350-40" },
  2: { scale: 58, gross: true, inv: true, rd: true, rate: false, interest: false, fye: "Sep 30", std: "ASC 606 · ASC 842" },
  3: { scale: 12, gross: true, inv: true, rd: true, rate: false, interest: false, fye: "Dec 31", std: "ASC 606 · ASC 730" },
  4: { scale: 48, gross: true, inv: true, rd: true, rate: false, interest: false, fye: "Dec 31", std: "ASC 606 · ASC 730" },
  5: { scale: 72, gross: false, inv: false, rd: false, rate: false, interest: true, fye: "Dec 31", std: "ASC 326 (CECL) · ASC 310" },
  6: { scale: 96, gross: true, inv: true, rd: false, rate: false, interest: false, fye: "Jan 31", std: "ASC 606 · ASC 842" },
  7: { scale: 110, gross: true, inv: true, rd: false, rate: false, interest: false, fye: "Dec 31", std: "ASC 932 · full cost / successful efforts" },
  8: { scale: 26, gross: false, inv: false, rd: false, rate: true, interest: false, fye: "Dec 31", std: "ASC 980 (regulated operations)" },
  9: { scale: 52, gross: true, inv: true, rd: true, rate: false, interest: false, fye: "Dec 31", std: "ASC 606 · ASC 842" },
  10: { scale: 44, gross: true, inv: false, rd: false, rate: false, interest: false, fye: "Dec 31", std: "ASC 606 · ASC 926" },
};

export const UNIVERSE: { ticker: string; name: string; sec: number }[] = [
  ["NVDA", "Nvidia", 0], ["AVGO", "Broadcom", 0], ["TXN", "Texas Instruments", 0], ["INTC", "Intel", 0], ["AMD", "Advanced Micro Devices", 0], ["MU", "Micron Technology", 0],
  ["MSFT", "Microsoft", 1], ["ORCL", "Oracle", 1], ["CRM", "Salesforce", 1], ["ADBE", "Adobe", 1], ["NOW", "ServiceNow", 1], ["INTU", "Intuit", 1],
  ["AAPL", "Apple", 2], ["DELL", "Dell Technologies", 2], ["HPQ", "HP Inc.", 2], ["CSCO", "Cisco Systems", 2], ["ANET", "Arista Networks", 2], ["NTAP", "NetApp", 2],
  ["AMGN", "Amgen", 3], ["GILD", "Gilead Sciences", 3], ["VRTX", "Vertex Pharmaceuticals", 3], ["REGN", "Regeneron", 3], ["BIIB", "Biogen", 3], ["MRNA", "Moderna", 3],
  ["JNJ", "Johnson & Johnson", 4], ["PFE", "Pfizer", 4], ["MRK", "Merck", 4], ["LLY", "Eli Lilly", 4], ["ABBV", "AbbVie", 4], ["BMY", "Bristol Myers Squibb", 4],
  ["JPM", "JPMorgan Chase", 5], ["BAC", "Bank of America", 5], ["WFC", "Wells Fargo", 5], ["C", "Citigroup", 5], ["GS", "Goldman Sachs", 5], ["USB", "U.S. Bancorp", 5],
  ["WMT", "Walmart", 6], ["COST", "Costco", 6], ["TGT", "Target", 6], ["HD", "Home Depot", 6], ["LOW", "Lowe’s", 6], ["TJX", "TJX Companies", 6],
  ["XOM", "Exxon Mobil", 7], ["CVX", "Chevron", 7], ["COP", "ConocoPhillips", 7], ["SLB", "SLB", 7], ["EOG", "EOG Resources", 7], ["PSX", "Phillips 66", 7],
  ["NEE", "NextEra Energy", 8], ["DUK", "Duke Energy", 8], ["SO", "Southern Company", 8], ["D", "Dominion Energy", 8], ["AEP", "American Electric Power", 8], ["EXC", "Exelon", 8],
  ["CAT", "Caterpillar", 9], ["HON", "Honeywell", 9], ["GE", "GE Aerospace", 9], ["UNP", "Union Pacific", 9], ["LMT", "Lockheed Martin", 9], ["DE", "Deere & Company", 9],
  ["DIS", "Walt Disney", 10], ["NFLX", "Netflix", 10], ["CMCSA", "Comcast", 10], ["WBD", "Warner Bros. Discovery", 10], ["FOXA", "Fox Corporation", 10], ["PARA", "Paramount", 10],
].map(([ticker, name, sec]) => ({ ticker: ticker as string, name: name as string, sec: sec as number }));

export interface PairRow {
  k: string;
  a: number;
  b: number;
  /** Marks a value the filer does not report at all — omitted, never drawn as zero. */
  aMissing?: boolean;
  bMissing?: boolean;
  fmt: (v: number) => string;
  /** A reference tick on the shared axis, e.g. the 10% customer-disclosure threshold. */
  threshold?: number;
  thresholdLabel?: string;
}

export interface StackedPair {
  segs: { label: string; color: string }[];
  columns: { name: string; sub: string; vals: number[] }[];
}

export interface CompanyCompare {
  aTicker: string; aName: string; aSector: string;
  bTicker: string; bName: string; bSector: string;
  cross: boolean; crossLabel: string;
  readFirst: string;
  basis: { k: string; a: string; b: string; aligned: boolean; chip: string; note: string }[];
  basisSummary: string; basisNote: string;
  measures: { k: string; both: boolean; why: string; chip: string }[];
  measuresSummary: string; measuresNote: string;
  struct: StackedPair; structNote: string;
  csRest: PairRow[]; csNote: string;
  repMoney: { key: string; label: string; a: number; b: number }[];
  repEmp: { key: string; label: string; a: number; b: number }[];
  repNote: string;
  revMix: StackedPair;
  timing: StackedPair;
  geo: StackedPair;
  conc: PairRow[]; concNote: string;
  intensity: PairRow[];
  modelNote: string;
  gov: { k: string; vals: { ticker: string; val: number }[]; min: number; max: number; q1: number; med: number; q3: number; aVal: number; bVal: number; aLabel: string; bLabel: string; medLabel: string }[];
  govNote: string; govDistNote: string;
  traits: { label: string; aMark: string; bMark: string; differs: boolean }[];
  traitsNote: string;
  overlap: { name: string; short: string; a: number; b: number; aLabel: string; bLabel: string; tilt: string }[];
  overlapNote: string;
  limits: string[];
}

export function companyCompare(aTicker: string, bTicker: string): CompanyCompare {
  const sd = seedN;
  const find = (tk: string) => UNIVERSE.find((c) => c.ticker === tk) ?? UNIVERSE[0];
  const A = find(aTicker);
  const B = find(bTicker);
  const tA = SECTOR_TRAITS[A.sec];
  const tB = SECTOR_TRAITS[B.sec];
  const cross = A.sec !== B.sec;

  const fin = (c: { ticker: string }, t: typeof tA) => {
    const rev = t.scale * (0.45 + sd(`${c.ticker}rev`) * 1.35);
    const gm = t.gross ? 24 + sd(`${c.ticker}gm`) * 52 : null;
    const om = 6 + sd(`${c.ticker}om`) * 30;
    const ni = rev * (om / 100) * (0.62 + sd(`${c.ticker}ni`) * 0.3);
    const rd = t.rd ? rev * (0.04 + sd(`${c.ticker}rd`) * 0.18) : null;
    const sga = rev * (0.06 + sd(`${c.ticker}sga`) * 0.16);
    const capex = rev * (0.02 + sd(`${c.ticker}cx`) * 0.14);
    const ocf = rev * (0.08 + sd(`${c.ticker}ocf`) * 0.28);
    const debt = rev * (0.15 + sd(`${c.ticker}db`) * 1.1);
    const inv = t.inv ? rev * (0.04 + sd(`${c.ticker}iv`) * 0.16) : null;
    const emp = Math.round(rev * 1000 * (0.8 + sd(`${c.ticker}emp`) * 4.2));
    const segs = 1 + Math.floor(sd(`${c.ticker}sg`) * 5);
    return { rev, gm, om, ni, rd, sga, capex, ocf, debt, inv, emp, segs };
  };
  const fa = fin(A, tA);
  const fb = fin(B, tB);

  // ---------------------------------------------------------------- filing basis
  const qEnd = (fye: string) =>
    ({ "Dec 31": "2026-03-31", "Jun 30": "2026-03-31", "Sep 30": "2026-03-31", "Jan 31": "2026-05-02" })[fye] ?? "2026-03-31";
  const AUD = ["Deloitte", "EY", "KPMG", "PwC"];
  const basisRaw = [
    { k: "Fiscal year end", a: tA.fye, b: tB.fye, aligned: tA.fye === tB.fye,
      note: "Different year ends mean the two filings cover different twelve-month windows. Nothing below re-cuts the periods." },
    { k: "Most recent period compared", a: qEnd(tA.fye), b: qEnd(tB.fye), aligned: qEnd(tA.fye) === qEnd(tB.fye),
      note: "Both figures are as filed for the period shown. They are not restated onto a common calendar." },
    { k: "Statement basis", a: tA.std, b: tB.std, aligned: tA.std === tB.std,
      note: "The standards each filer applies to its principal revenue and cost lines. Where these differ, line items with the same name are not the same measurement." },
    { k: "Reportable segments", a: String(fa.segs), b: String(fb.segs), aligned: fa.segs === fb.segs,
      note: "Segment structure is each filer’s own view of how the business is managed, so segment figures are never directly comparable across filers." },
    { k: "Auditor", a: AUD[Math.floor(sd(`${A.ticker}au`) * 4)], b: AUD[Math.floor(sd(`${B.ticker}au`) * 4)], aligned: false,
      note: "Named in each 10-K auditor report." },
  ];
  const basis = basisRaw.map((r) => ({ ...r, chip: r.aligned ? "aligned" : "differs" }));
  const alignedCount = basis.filter((r) => r.aligned).length;

  // ---------------------------------------------------------------- comparability
  const measuresRaw = [
    { k: "Revenue", both: true, why: "Both tag us-gaap:Revenues or a Revenue-from-contract element." },
    { k: "Net income", both: true, why: "us-gaap:NetIncomeLoss, tagged by every filer." },
    { k: "Operating cash flow", both: true, why: "us-gaap:NetCashProvidedByUsedInOperatingActivities." },
    { k: "Total debt", both: true, why: "Sum of the short- and long-term borrowing elements in the debt footnote." },
    { k: "Gross margin", both: tA.gross && tB.gross,
      why: tA.gross && tB.gross ? "Both present a cost-of-revenue line." : "A filer without a cost-of-revenue line reports no gross margin at all — this is a structural absence, not a missing value." },
    { k: "Inventory", both: tA.inv && tB.inv,
      why: tA.inv && tB.inv ? "Both carry inventory on the balance sheet." : "One filer carries no inventory, so inventory turns and days do not exist for it." },
    { k: "R&D expense", both: !!(tA.rd && tB.rd),
      why: tA.rd && tB.rd ? "Both break out research and development." : "One filer does not present a separate R&D line; the spend, if any, sits inside other operating expense." },
    { k: "Net interest income", both: !!(tA.interest && tB.interest),
      why: tA.interest && tB.interest ? "Both are interest-margin businesses." : "Only an interest-margin filer reports this, so it cannot be used across these two." },
    { k: "Regulated rate base", both: !!(tA.rate && tB.rate),
      why: tA.rate && tB.rate ? "Both file under ASC 980." : "Only a rate-regulated filer discloses a rate base." },
  ];
  const measures = measuresRaw.map((m) => ({ ...m, chip: m.both ? "both tag it" : "not shared" }));
  const sharedCount = measures.filter((m) => m.both).length;

  // ---------------------------------------------------------------- cost structure
  const structSegs = [
    { label: "Cost of revenue or cost of operations", color: "var(--border-strong)" },
    { label: "Selling, general & administrative", color: "#8B8579" },
    { label: "Research & development", color: "#A88C5F" },
    { label: "Other operating expense", color: "#B9AE9B" },
    { label: "Operating margin", color: "var(--accent)" },
  ];
  const norm = (v: number[]) => {
    const t = v.reduce((a, x) => a + x, 0) || 1;
    return v.map((x) => (x / t) * 100);
  };
  const structOf = (t: typeof tA, f: ReturnType<typeof fin>) => {
    const sga = (f.sga / f.rev) * 100;
    const rd = t.rd && f.rd ? (f.rd / f.rev) * 100 : 0;
    const om = f.om;
    if (t.gross && f.gm != null) {
      const cogs = 100 - f.gm;
      const other = f.gm - sga - rd - om;
      if (other < 0) {
        const pool = sga + rd;
        const need = sga + rd + om - f.gm;
        const k = pool > 0 ? Math.max(0, (pool - need) / pool) : 0;
        return norm([cogs, sga * k, rd * k, 0, om]);
      }
      return norm([cogs, sga, rd, Math.max(0, other), om]);
    }
    return norm([Math.max(0, 100 - om - sga - rd), sga, rd, 0, om]);
  };
  const cols = (va: number[], vb: number[]) => [
    { name: A.ticker, sub: SECTOR_ABBR[A.sec], vals: va },
    { name: B.ticker, sub: SECTOR_ABBR[B.sec], vals: vb },
  ];

  const csRest: PairRow[] = [
    { k: "Operating cash flow / revenue", a: (fa.ocf / fa.rev) * 100, b: (fb.ocf / fb.rev) * 100, fmt: pct },
    { k: "Capital expenditure / revenue", a: (fa.capex / fa.rev) * 100, b: (fb.capex / fb.rev) * 100, fmt: pct },
    { k: "Total debt / revenue", a: (fa.debt / fa.rev) * 100, b: (fb.debt / fb.rev) * 100, fmt: pct },
    { k: "Inventory / revenue", a: tA.inv && fa.inv ? (fa.inv / fa.rev) * 100 : 0, b: tB.inv && fb.inv ? (fb.inv / fb.rev) * 100 : 0, fmt: pct, aMissing: !tA.inv, bMissing: !tB.inv },
  ];

  // ---------------------------------------------------------------- business model
  const mix = (c: { ticker: string }, t: typeof tA) =>
    norm([
      t.interest ? 0.05 : 0.3 + sd(`${c.ticker}m0`) * 0.5,
      0.06 + sd(`${c.ticker}m1`) * 0.34,
      t.rate ? 0.02 : 0.04 + sd(`${c.ticker}m2`) * 0.34,
      t.interest ? 0.62 + sd(`${c.ticker}m3`) * 0.2 : t.rate ? 0.72 : 0.01 + sd(`${c.ticker}m3`) * 0.06,
    ]);
  const overTime = (c: { ticker: string }, t: typeof tA) =>
    t.interest || t.rate ? 88 + sd(`${c.ticker}ot`) * 10 : 18 + sd(`${c.ticker}ot`) * 66;
  const oa = overTime(A, tA);
  const ob = overTime(B, tB);
  const geoOf = (c: { ticker: string }) =>
    norm([0.2 + sd(`${c.ticker}g0`) * 0.6, 0.1 + sd(`${c.ticker}g1`) * 0.4, 0.08 + sd(`${c.ticker}g2`) * 0.5, 0.03 + sd(`${c.ticker}g3`) * 0.2]);

  const conc = (c: { ticker: string }, t: typeof tA) => {
    const n = t.interest || t.rate || t.scale > 90 ? 0 : Math.floor(sd(`${c.ticker}cn`) * 4);
    return { n, top: n ? 11 + sd(`${c.ticker}ct`) * 32 : 0 };
  };
  const ca = conc(A, tA);
  const cb = conc(B, tB);

  // ---------------------------------------------------------------- governance strips
  const govDefs = [
    { k: "Filing lag, most recent 10-Q", f: dys, lo: 26, hi: 46 },
    { k: "Amendments, trailing 3 years", f: d0, lo: 0, hi: 8 },
    { k: "Risk-factor word count", f: d0, lo: 4200, hi: 24000 },
    { k: "Custom XBRL element share", f: pct, lo: 4, hi: 34 },
    { k: "Critical audit matters", f: d0, lo: 1, hi: 4 },
    { k: "Auditor tenure", f: yrs, lo: 3, hi: 38 },
    { k: "Say-on-pay support", f: pct, lo: 58, hi: 98 },
    { k: "Effective number of holders", f: d0, lo: 9, hi: 180 },
  ];
  const gov = govDefs.map((r) => {
    const vals = UNIVERSE.map((c) => ({ ticker: c.ticker, val: r.lo + sd(c.ticker + r.k) * (r.hi - r.lo) }));
    const sorted = vals.map((v) => v.val).slice().sort((x, y) => x - y);
    const q = (p: number) => sorted[Math.max(0, Math.min(sorted.length - 1, Math.round(p * (sorted.length - 1))))];
    const av = r.lo + sd(A.ticker + r.k) * (r.hi - r.lo);
    const bv = r.lo + sd(B.ticker + r.k) * (r.hi - r.lo);
    const pctl = (v: number) => Math.round((vals.filter((x) => x.val < v).length / Math.max(1, vals.length - 1)) * 100);
    return {
      k: r.k, vals, min: sorted[0], max: sorted[sorted.length - 1], q1: q(0.25), med: q(0.5), q3: q(0.75),
      aVal: av, bVal: bv,
      aLabel: `${r.f(av)} · P${pctl(av)}`, bLabel: `${r.f(bv)} · P${pctl(bv)}`,
      medLabel: `median ${r.f(q(0.5))}`,
    };
  });

  const traitDefs: [string, keyof typeof tA][] = [
    ["Carries inventory", "inv"], ["Presents a separate R&D line", "rd"],
    ["Presents cost of revenue", "gross"], ["Interest-margin business", "interest"],
    ["Rate-regulated operations", "rate"],
  ];
  const traits = traitDefs.map(([label, key]) => ({
    label,
    aMark: tA[key] ? "yes" : "no",
    bMark: tB[key] ? "yes" : "no",
    differs: !!tA[key] !== !!tB[key],
  }));
  const traitsDiffer = traits.filter((t) => t.differs).length;

  // ---------------------------------------------------------------- shared managers
  const overlapNames = ["Index manager A", "Index manager B", "Index manager C", "Active manager D", "Pension system F", "Sovereign fund G", "Insurance manager I"];
  const overlap = overlapNames
    .map((n, i) => {
      const ap = 0.4 + sd(`${A.ticker}ov${i}`) * 8;
      const bp = 0.4 + sd(`${B.ticker}ov${i}`) * 8;
      return {
        name: n,
        short: n.replace("Index manager", "Idx ").replace("Active manager", "Act ").replace("Pension system", "Pen ").replace("Sovereign fund", "Sov ").replace("Insurance manager", "Ins "),
        a: ap, b: bp, aLabel: pct(ap), bLabel: pct(bp),
        tilt: ap > bp * 1.15 ? `larger in ${A.ticker}` : bp > ap * 1.15 ? `larger in ${B.ticker}` : "roughly equal",
      };
    })
    .slice(0, 4 + Math.floor(sd(A.ticker + B.ticker) * 3));

  return {
    aTicker: A.ticker, aName: A.name, aSector: SECTOR_NAMES[A.sec],
    bTicker: B.ticker, bName: B.name, bSector: SECTOR_NAMES[B.sec],
    cross,
    crossLabel: cross ? "cross-sector comparison" : "same sector — the sector view compares these directly",
    readFirst: `${alignedCount} of ${basis.length} filing-basis items line up · ${sharedCount} of ${measures.length} measures are tagged by both filers`,
    basis,
    basisSummary: `${alignedCount} of ${basis.length} basis items line up`,
    basisNote: "Nothing on this page restates either filer onto the other’s calendar or accounting basis. Where an item differs, treat every figure below as two separate measurements shown next to each other.",
    measures,
    measuresSummary: `${sharedCount} of ${measures.length} measures are tagged by both filers`,
    measuresNote: "A measure marked “not shared” is absent from one filer’s statements by the nature of its business, not missing from our data. It is left out of the comparison rather than shown as zero.",
    struct: { segs: structSegs, columns: cols(structOf(tA, fa), structOf(tB, fb)) },
    structNote: "Each column is that filer’s own revenue split into cost of revenue, operating expense and the operating margin that remains. A filer with no cost-of-revenue line reports the first band as cost of operations, and an interest-margin filer as interest and operating expense — the bands are the filer’s own captions, not a common template.",
    csRest,
    csNote: "Every line is scaled by that filer’s own revenue, which is what makes a comparison across two sectors legible at all. Bars are true length within each row; colour is identity only, and no row declares a winner.",
    repMoney: [
      { key: "rev", label: "Revenue", a: fa.rev, b: fb.rev },
      { key: "ni", label: "Net income", a: fa.ni, b: fb.ni },
      { key: "ocf", label: "Operating cash flow", a: fa.ocf, b: fb.ocf },
      { key: "capex", label: "Capital expenditure", a: fa.capex, b: fb.capex },
      { key: "debt", label: "Total debt", a: fa.debt, b: fb.debt },
    ],
    repEmp: [{ key: "emp", label: "Employees", a: fa.emp, b: fb.emp }],
    repNote: "As-filed absolute figures from the most recent period each filer has on record. Two filers of very different size will produce one long bar and one short one — that is scale, not performance.",
    revMix: {
      segs: [
        { label: "Products & goods", color: "var(--accent)" },
        { label: "Services & support", color: "var(--gaap-color)" },
        { label: "Subscription & licensing", color: "#A88C5F" },
        { label: "Interest, financing or regulated tariff", color: "var(--border-strong)" },
      ],
      columns: cols(mix(A, tA), mix(B, tB)),
    },
    timing: {
      segs: [
        { label: "Recognised over time", color: "var(--accent)" },
        { label: "Recognised at a point in time", color: "var(--border-strong)" },
      ],
      columns: cols([oa, 100 - oa], [ob, 100 - ob]),
    },
    geo: {
      segs: [
        { label: "Americas", color: "var(--accent)" },
        { label: "EMEA", color: "var(--gaap-color)" },
        { label: "Asia-Pacific", color: "#A88C5F" },
        { label: "Other", color: "var(--border-strong)" },
      ],
      columns: cols(geoOf(A), geoOf(B)),
    },
    conc: [
      { k: "Largest customer, share of revenue", a: ca.top, b: cb.top, fmt: pct, aMissing: ca.n === 0, bMissing: cb.n === 0, threshold: 10, thresholdLabel: "tick: the 10% disclosure threshold" },
      { k: "Customers at 10% or more of revenue", a: ca.n, b: cb.n, fmt: d0 },
    ],
    concNote: "Filers must name any customer accounting for 10% or more of revenue. “Not tagged” means the filer disclosed no such customer, which is a statement about concentration rather than missing data.",
    intensity: [
      { k: "Property, plant & equipment / revenue", a: (tA.rate ? 1.9 : 0.12) + sd(`${A.ticker}ppe`) * 0.8, b: (tB.rate ? 1.9 : 0.12) + sd(`${B.ticker}ppe`) * 0.8, fmt: x1 },
      { k: "Capital expenditure / revenue", a: (fa.capex / fa.rev) * 100, b: (fb.capex / fb.rev) * 100, fmt: pct },
      { k: "Deferred revenue / revenue", a: tA.interest ? 0 : 4 + sd(`${A.ticker}dr`) * 26, b: tB.interest ? 0 : 4 + sd(`${B.ticker}dr`) * 26, fmt: pct, aMissing: tA.interest, bMissing: tB.interest },
      { k: "Revenue per employee", a: ((fa.rev * 1000) / fa.emp) * 1000, b: ((fb.rev * 1000) / fb.emp) * 1000, fmt: (v) => `$${Math.round(v)}k` },
      { k: "Operating-lease share of fixed obligations", a: 6 + sd(`${A.ticker}ls`) * 42, b: 6 + sd(`${B.ticker}ls`) * 42, fmt: pct },
    ],
    modelNote: "Every figure here comes from the filer’s own ASC 606 disaggregation, geographic footnote, customer-concentration disclosure and human-capital count. Two filers may split revenue on different axes, so read the composition as each filer’s description of itself.",
    gov,
    govNote: "Filing behaviour, accounting-choice breadth and governance outcomes travel across sectors better than any financial line, because they describe how the filer files rather than what it sells.",
    govDistNote: `Each strip is all ${UNIVERSE.length} filers in the universe: grey dots are the other filers, the shaded band the interquartile range and the vertical tick the median. Percentile is a position in that distribution, not a score.`,
    traits,
    traitsNote:
      traitsDiffer === 0
        ? "These two filers present the same statement structure, so the financial lines above line up item for item."
        : `${traitsDiffer} of ${traits.length} structural traits differ, which is why some measures above read “not tagged” for one side.`,
    overlap,
    overlapNote: "Managers appearing in both 13F-reported registers, with each filer’s share of shares outstanding. Overlap is a property of the managers, not evidence of any relationship between the two companies.",
    limits: [
      "Periods are as filed. With different fiscal year ends the two columns cover different windows.",
      "Segment and geographic breakdowns are each filer’s own structure and are deliberately not compared.",
      "Non-GAAP figures are excluded entirely — each filer defines its own adjustments.",
      "No market data of any kind is used, so nothing here is a valuation or a return.",
      "Where a measure is absent from one filer’s statements, it is omitted rather than treated as zero.",
    ],
  };
}

export { money };
