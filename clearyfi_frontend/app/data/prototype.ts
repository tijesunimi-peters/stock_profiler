/**
 * The prototype's own data, lifted verbatim from `Sector Analytics.dc.html`.
 *
 * These are the figures the design was drawn against, so the port renders the same page rather
 * than a plausible-looking cousin of it. They are still **synthetic** — the handoff is explicit
 * that no figure here may be ported into production or used as a test fixture — but they are
 * the exact numbers the layout was tuned for, which is what makes a visual diff meaningful.
 */

export const SECTOR_NAMES = [
  "Semiconductors",
  "Software",
  "IT hardware",
  "Biotech",
  "Pharma",
  "Banks",
  "Retail",
  "Energy",
  "Utilities",
  "Industrials",
  "Media",
] as const;

export const SECTOR_ABBR = [
  "Semi",
  "SW",
  "HW",
  "Bio",
  "Pharma",
  "Bank",
  "Retail",
  "Enrgy",
  "Util",
  "Indl",
  "Media",
] as const;

export const SUB_NAMES = [
  "Logic / foundry",
  "Memory",
  "Analog & mixed-signal",
  "Equipment",
  "EDA & IP",
  "Fabless",
] as const;

export const SUB_COUNTS = [14, 9, 17, 11, 7, 19] as const;

/** The base peer count before a sub-industry narrows it. */
export const BASE_PEER_COUNT = 62;

export type ThemeId = "prof" | "growth" | "health" | "cash" | "eff" | "acct" | "struct";

export const THEMES: { id: ThemeId; name: string }[] = [
  { id: "prof", name: "Profitability & returns" },
  { id: "growth", name: "Growth" },
  { id: "health", name: "Financial health" },
  { id: "cash", name: "Cash & investment" },
  { id: "eff", name: "Operating efficiency" },
  { id: "acct", name: "Accounting quality" },
  { id: "struct", name: "Structure & activity" },
];

/** Composite score per theme, per sector. Index aligns with `SECTOR_NAMES`; Semi = 0. */
export const SECTOR_SCORES: Record<ThemeId, number[]> = {
  prof: [71, 78, 55, 49, 63, 60, 52, 45, 58, 66, 54],
  growth: [64, 72, 40, 58, 54, 44, 48, 62, 35, 50, 46],
  health: [68, 70, 62, 50, 58, 74, 55, 60, 80, 66, 57],
  cash: [76, 82, 60, 55, 66, 58, 52, 70, 74, 63, 59],
  eff: [58, 65, 50, 42, 54, 60, 66, 57, 62, 68, 52],
  acct: [81, 84, 70, 66, 75, 79, 72, 68, 83, 77, 71],
  struct: [62, 68, 52, 70, 55, 48, 58, 64, 46, 54, 60],
};

/** Period-over-period move, focal sector only — every other sector reads flat. */
export const SEMI_DELTA: Record<ThemeId, number> = {
  prof: 3,
  growth: 9,
  health: 1,
  cash: 5,
  eff: -2,
  acct: 4,
  struct: 6,
};

/**
 * Decomposition constituents for the focal sector: `[label, weight, favorability-adjusted
 * percentile vs 11 sectors]`.
 */
export const CONSTITUENTS: Record<ThemeId, [string, number, number][]> = {
  prof: [
    ["Gross margin", 0.25, 80],
    ["Operating margin", 0.25, 72],
    ["Net margin", 0.2, 70],
    ["ROIC", 0.3, 63],
  ],
  growth: [
    ["Revenue growth YoY", 0.35, 74],
    ["Sequential growth", 0.2, 55],
    ["3-yr revenue CAGR", 0.3, 66],
    ["Growth dispersion", 0.15, 48],
  ],
  health: [
    ["Debt / equity", 0.25, 66],
    ["Net debt / EBITDA", 0.3, 75],
    ["Interest coverage", 0.25, 64],
    ["Current ratio", 0.2, 66],
  ],
  cash: [
    ["Operating cash-flow margin", 0.3, 82],
    ["Free cash flow", 0.25, 78],
    ["FCF conversion", 0.2, 70],
    ["Capex intensity", 0.15, 72],
    ["R&D intensity", 0.1, 70],
  ],
  eff: [
    ["Inventory turnover", 0.2, 52],
    ["Days sales outstanding", 0.2, 55],
    ["Cash conversion cycle", 0.2, 60],
    ["Asset turnover", 0.2, 54],
    ["Revenue / employee", 0.2, 68],
  ],
  acct: [
    ["Restatement rate", 0.3, 85],
    ["Material-weakness rate", 0.3, 78],
    ["Late-filing rate", 0.2, 82],
    ["Accruals ratio", 0.2, 78],
  ],
  struct: [
    ["Net entrants (S-1)", 0.25, 58],
    ["M&A activity", 0.25, 60],
    ["Insider net buy", 0.25, 66],
    ["Institutional flow", 0.25, 64],
  ],
};

export interface DrillTile {
  name: string;
  median: number;
  lo: number;
  hi: number;
  q1: number;
  q3: number;
  caption: string;
}

/** Per-theme dispersion tiles for the sector drill-down. */
export const THEME_DRILL: Record<ThemeId, DrillTile[]> = {
  prof: [
    { name: "Operating margin", median: 24.1, lo: 2, hi: 48, q1: 15, q3: 33, caption: "healthy central tendency; a long right tail of fab-light names." },
    { name: "ROIC", median: 14.6, lo: -4, hi: 34, q1: 8, q3: 22, caption: "wide spread — capital efficiency separates the sector." },
    { name: "Net margin", median: 19.3, lo: 1, hi: 41, q1: 11, q3: 28, caption: "above cross-sector norm; concentrated at the top." },
  ],
  growth: [
    { name: "Revenue growth YoY", median: 14.2, lo: -8, hi: 46, q1: 6, q3: 24, caption: "wide spread — top-quartile names above 24% carry the sector." },
    { name: "3-yr revenue CAGR", median: 11.8, lo: -5, hi: 40, q1: 5, q3: 19, caption: "durable multi-year expansion in the core." },
    { name: "Growth dispersion (top vs bottom quartile)", median: 18, lo: 4, hi: 40, q1: 12, q3: 27, caption: "dispersion elevated — growth is carried by a few names, not broad-based." },
    { name: "Sequential growth", median: 2.4, lo: -12, hi: 18, q1: -1, q3: 7, caption: "quarter turned positive after two soft prints." },
  ],
  health: [
    { name: "Net debt / EBITDA", median: 0.6, lo: -1, hi: 3.4, q1: 0.1, q3: 1.4, caption: "conservatively levered vs most sectors." },
    { name: "Interest coverage", median: 11.4, lo: 1, hi: 32, q1: 5, q3: 19, caption: "ample cushion in the core; thin at the bottom quartile." },
    { name: "Current ratio", median: 2.3, lo: 0.8, hi: 5.5, q1: 1.6, q3: 3.2, caption: "strong short-term liquidity." },
  ],
  cash: [
    { name: "Operating cash-flow margin", median: 26.8, lo: 4, hi: 48, q1: 17, q3: 35, caption: "cash generation is a sector strength." },
    { name: "FCF conversion", median: 78, lo: 20, hi: 120, q1: 58, q3: 96, caption: "high conversion despite capex intensity." },
    { name: "Capex intensity", median: 9.1, lo: 2, hi: 26, q1: 5, q3: 15, caption: "fab owners pull the upper tail sharply." },
  ],
  eff: [
    { name: "Inventory turnover", median: 4.1, lo: 2, hi: 7.5, q1: 3.1, q3: 5.2, caption: "tight vs the broader tape; cyclical builds add noise." },
    { name: "Days sales outstanding", median: 58, lo: 30, hi: 96, q1: 46, q3: 71, caption: "lengthening this period — see biggest shifts." },
    { name: "Cash conversion cycle", median: 96, lo: 40, hi: 170, q1: 74, q3: 124, caption: "long cycle is structural for the sector." },
  ],
  acct: [
    { name: "Accruals ratio", median: 3.2, lo: -6, hi: 14, q1: 0.5, q3: 6.4, caption: "earnings well backed by cash; tight distribution." },
    { name: "Restatement rate", median: 1.4, lo: 0, hi: 8, q1: 0.4, q3: 3.1, caption: "low relative to most sectors." },
    { name: "Material-weakness rate", median: 4.1, lo: 0, hi: 12, q1: 1.6, q3: 6.5, caption: "elevated this period — flagged in biggest shifts." },
  ],
  struct: [
    { name: "Insider net buy/sell ratio", median: 0.9, lo: 0.1, hi: 3, q1: 0.5, q3: 1.5, caption: "roughly balanced; a few names buying heavily." },
    { name: "M&A intensity (deals / 100 filers)", median: 6.2, lo: 0, hi: 18, q1: 3, q3: 11, caption: "consolidation active in equipment & analog." },
    { name: "Net entrants (S-1 vs Form 15)", median: 2, lo: -6, hi: 9, q1: 0, q3: 4, caption: "modest net formation this year." },
  ],
};

export interface ShiftRow {
  name: string;
  delta: string;
  glyph: string;
  basis: string;
  flag: boolean;
  flagLabel?: string;
}

export const BIGGEST_SHIFTS: ShiftRow[] = [
  { name: "Material-weakness rate", delta: "+1.8pp", glyph: "↑", basis: "vs prior quarter", flag: true, flagLabel: "highest in 8q" },
  { name: "Days sales outstanding", delta: "+6 days", glyph: "↑", basis: "vs prior quarter", flag: false },
  { name: "R&D intensity", delta: "+2.1pp", glyph: "↑", basis: "vs prior quarter", flag: false },
  { name: "Net debt / EBITDA", delta: "−0.3x", glyph: "↓", basis: "vs prior quarter", flag: false },
  { name: "Inventory turnover", delta: "−0.4x", glyph: "↓", basis: "vs prior quarter", flag: false },
];

/** Geographic revenue mix (ASC 280): [Americas, China, Rest of Asia, EMEA] per sector. */
export const GEO_MIX: number[][] = [
  [32, 29, 24, 15],
  [54, 8, 18, 20],
  [41, 22, 25, 12],
  [58, 6, 20, 16],
  [49, 11, 22, 18],
  [71, 3, 9, 17],
  [63, 7, 18, 12],
  [44, 9, 14, 33],
  [88, 1, 4, 7],
  [52, 12, 18, 18],
  [66, 5, 15, 14],
];

export const GEO_LABELS = ["Americas", "China", "Rest of Asia", "EMEA"] as const;
export const GEO_COLORS = ["var(--accent)", "var(--gaap-color)", "#8B8579", "var(--border-strong)"] as const;

export interface InsiderRow {
  ratio: number;
  buyers: number;
  sellers: number;
  dir: "up" | "down" | "flat";
  note: string;
}

/** Sector insider net buy/sell (Forms 3/4/5). */
export const INSIDER: InsiderRow[] = [
  { ratio: 1.4, buyers: 18, sellers: 31, dir: "up", note: "net buying at an 8-quarter high" },
  { ratio: 0.7, buyers: 12, sellers: 44, dir: "down", note: "sellers outweigh buyers" },
  { ratio: 1.1, buyers: 15, sellers: 22, dir: "flat", note: "roughly balanced" },
  { ratio: 0.9, buyers: 9, sellers: 19, dir: "down", note: "mild net selling" },
  { ratio: 1.2, buyers: 11, sellers: 17, dir: "up", note: "net buying picking up" },
  { ratio: 1.6, buyers: 24, sellers: 20, dir: "up", note: "broad insider accumulation" },
  { ratio: 0.8, buyers: 8, sellers: 21, dir: "flat", note: "net selling, few buyers" },
  { ratio: 1.3, buyers: 14, sellers: 16, dir: "up", note: "buying into weakness" },
  { ratio: 1.0, buyers: 6, sellers: 6, dir: "flat", note: "balanced, low activity" },
  { ratio: 1.1, buyers: 13, sellers: 19, dir: "flat", note: "roughly balanced" },
  { ratio: 0.9, buyers: 7, sellers: 14, dir: "down", note: "mild net selling" },
];

export type Severity = "negative" | "caution" | "accent" | "neutral";

export interface FeedRow {
  title: string;
  source: string;
  sev: Severity;
}

/** The "What's moving" feed — filing events, walled off from the metric panels. */
export const EVENTS: FeedRow[] = [
  { title: "CFO departure at Analog Devices peer group filer", source: "8-K Item 5.02 · 1 filing", sev: "caution" },
  { title: "Restatement filed — revenue recognition", source: "8-K Item 4.02 · 1 filing", sev: "negative" },
  { title: "Auditor change at mid-cap fabless name", source: "8-K Item 4.01 · 1 filing", sev: "caution" },
  { title: "Acquisition announced — analog rollup", source: "8-K Item 1.01 / 2.01 · 3 filings", sev: "accent" },
  { title: "Insider net buying at multi-year high", source: "Form 4 · net ratio 2.4x", sev: "accent" },
  { title: "New entrant — fabless AI accelerator", source: "S-1 · 1 filing", sev: "neutral" },
];

/** The dot treatment per severity — categorical flags, never a value ramp. */
export function statusDot(sev: Severity): { dot: string; border: string } {
  if (sev === "negative") return { dot: "var(--ext-color)", border: "2px solid var(--ext-border)" };
  if (sev === "caution") return { dot: "var(--ext-bg)", border: "2px solid var(--ext-color)" };
  if (sev === "accent") return { dot: "var(--accent)", border: "none" };
  return { dot: "var(--mono-muted)", border: "none" };
}

export function ord(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Rank of the focal sector on a theme, 1 = highest score. */
export function rankOf(theme: ThemeId, sectorIdx: number): number {
  const vals = SECTOR_SCORES[theme];
  const mine = vals[sectorIdx];
  return vals.filter((v) => v > mine).length + 1;
}

export const AS_OF = "Q1 FY26";
export const COVERAGE_LABEL = "94% filed · full peer set";
