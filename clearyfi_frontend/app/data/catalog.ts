/**
 * The catalog: sectors, sub-industries, filers, managers, themes and the metric definitions
 * every altitude inherits.
 *
 * Two things live here rather than in a page, deliberately (00 §5):
 *   - `favorability` is stored WITH the metric, so no page decides direction for itself;
 *   - `threshold` is stored with the metric too (00 §13), for the same reason.
 *
 * `favorability: "none"` is a real answer, not a gap. Capex intensity, DPO and M&A activity
 * have no agreed direction — a high number is neither good nor bad without a thesis — so they
 * are shown but EXCLUDED from any composite, and the decomposition panel says so out loud.
 */

export type Favorability = "higher" | "lower" | "none";
export type Unit = import("../lib/format").Unit;

export interface MetricDef {
  key: string;
  label: string;
  unit: Unit;
  favorability: Favorability;
  theme: ThemeKey;
  /** Plain-language derivation, shown under "Show your work". */
  formula: string;
  /** The filing + tag this claims to come from (00 §8). */
  source: string;
  /** Flags when |value| crosses this against its own history (00 §13). */
  threshold?: { direction: "above" | "below"; value: number; note: string };
  /** Metrics whose tagging is inconsistent across filers and needs normalization (00 §8). */
  normalizationRisk?: string;
}

export type ThemeKey =
  | "profitability"
  | "growth"
  | "health"
  | "cash"
  | "efficiency"
  | "accounting"
  | "structure";

export interface ThemeDef {
  key: ThemeKey;
  label: string;
  short: string;
  /** Constituent metric keys, with the weight each carries in the provisional composite. */
  weights: Record<string, number>;
}

export const THEMES: ThemeDef[] = [
  {
    key: "profitability",
    label: "Profitability & returns",
    short: "Profitability",
    weights: { gross_margin: 0.2, operating_margin: 0.25, net_margin: 0.2, roa: 0.1, roe: 0.1, roic: 0.15 },
  },
  {
    key: "growth",
    label: "Growth",
    short: "Growth",
    weights: { rev_growth_yoy: 0.4, rev_growth_qoq: 0.15, rev_cagr_3y: 0.3, growth_dispersion: 0.15 },
  },
  {
    key: "health",
    label: "Financial health",
    short: "Fin. health",
    weights: {
      debt_equity: 0.2,
      net_debt_ebitda: 0.3,
      interest_coverage: 0.25,
      current_ratio: 0.15,
      quick_ratio: 0.1,
    },
  },
  {
    key: "cash",
    label: "Cash & investment",
    short: "Cash",
    weights: {
      ocf_margin: 0.3,
      fcf_margin: 0.25,
      fcf_conversion: 0.25,
      capex_intensity: 0.1,
      rd_intensity: 0.1,
    },
  },
  {
    key: "efficiency",
    label: "Operating efficiency",
    short: "Efficiency",
    weights: {
      inventory_turnover: 0.2,
      dso: 0.2,
      dpo: 0.1,
      cash_conversion_cycle: 0.2,
      asset_turnover: 0.15,
      revenue_per_employee: 0.15,
    },
  },
  {
    key: "accounting",
    label: "Accounting quality",
    short: "Accounting",
    weights: {
      restatement_rate: 0.3,
      material_weakness_rate: 0.3,
      late_filing_rate: 0.2,
      accruals_ratio: 0.2,
    },
  },
  {
    key: "structure",
    label: "Structure & activity",
    short: "Structure",
    weights: { net_entrants: 0.3, ma_activity: 0.2, insider_net: 0.3, institutional_flow: 0.2 },
  },
];

export const THEME_BY_KEY: Record<ThemeKey, ThemeDef> = Object.fromEntries(
  THEMES.map((t) => [t.key, t]),
) as Record<ThemeKey, ThemeDef>;

const M = (
  key: string,
  label: string,
  unit: Unit,
  favorability: Favorability,
  theme: ThemeKey,
  formula: string,
  source: string,
  extra: Partial<MetricDef> = {},
): MetricDef => ({ key, label, unit, favorability, theme, formula, source, ...extra });

export const METRICS: MetricDef[] = [
  // ---------------------------------------------------------------- profitability
  M("gross_margin", "Gross margin", "pct", "higher", "profitability", "Gross profit ÷ Revenue", "10-K/10-Q · GrossProfit, Revenues", {
    normalizationRisk: "Revenue is tagged inconsistently (Revenues / RevenueFromContractWithCustomerExcludingAssessedTax / SalesRevenueNet) and is normalized before aggregation.",
  }),
  M("operating_margin", "Operating margin", "pct", "higher", "profitability", "Operating income ÷ Revenue", "10-K/10-Q · OperatingIncomeLoss, Revenues"),
  M("net_margin", "Net margin", "pct", "higher", "profitability", "Net income ÷ Revenue", "10-K/10-Q · NetIncomeLoss, Revenues"),
  M("roa", "Return on assets", "pct", "higher", "profitability", "Net income (TTM) ÷ Average total assets", "10-K/10-Q · NetIncomeLoss, Assets"),
  M("roe", "Return on equity (book)", "pct", "higher", "profitability", "Net income (TTM) ÷ Average book equity", "10-K/10-Q · NetIncomeLoss, StockholdersEquity"),
  M("roic", "ROIC", "pct", "higher", "profitability", "NOPAT ÷ (Debt + Equity − Cash)", "10-K/10-Q · derived from tagged facts"),

  // ---------------------------------------------------------------- growth
  M("rev_growth_yoy", "Revenue growth YoY", "pct", "higher", "growth", "Revenue ÷ same quarter prior year − 1", "10-K/10-Q · Revenues", {
    threshold: { direction: "below", value: -10, note: "sector median revenue contracting by more than 10% YoY" },
  }),
  M("rev_growth_qoq", "Revenue growth sequential", "pct", "higher", "growth", "Revenue ÷ prior quarter − 1", "10-Q · Revenues"),
  M("rev_cagr_3y", "Revenue CAGR (3yr)", "pct", "higher", "growth", "(Revenue ÷ Revenue 12 quarters ago)^(1/3) − 1", "10-K/10-Q · Revenues"),
  M("growth_dispersion", "Growth dispersion", "pp", "lower", "growth", "Top-quartile growth − bottom-quartile growth", "derived across the peer set"),

  // ---------------------------------------------------------------- financial health
  M("debt_equity", "Debt / equity", "x", "lower", "health", "Total debt ÷ Book equity", "10-K/10-Q · LongTermDebt, StockholdersEquity"),
  M("net_debt_ebitda", "Net debt / EBITDA", "x", "lower", "health", "(Debt − Cash) ÷ EBITDA (TTM)", "10-K/10-Q · derived from tagged facts", {
    threshold: { direction: "above", value: 3.5, note: "sector median leverage above 3.5×" },
  }),
  M("interest_coverage", "Interest coverage", "x", "higher", "health", "EBIT ÷ Interest expense", "10-K/10-Q · OperatingIncomeLoss, InterestExpense"),
  M("current_ratio", "Current ratio", "x", "higher", "health", "Current assets ÷ Current liabilities", "10-K/10-Q · AssetsCurrent, LiabilitiesCurrent"),
  M("quick_ratio", "Quick ratio", "x", "higher", "health", "(Current assets − Inventory) ÷ Current liabilities", "10-K/10-Q · AssetsCurrent, InventoryNet, LiabilitiesCurrent"),

  // ---------------------------------------------------------------- cash & investment
  M("ocf_margin", "Operating cash flow margin", "pct", "higher", "cash", "Cash from operations ÷ Revenue", "10-K/10-Q · NetCashProvidedByUsedInOperatingActivities"),
  M("fcf_margin", "Free cash flow margin", "pct", "higher", "cash", "(CFO − Capex) ÷ Revenue", "10-K/10-Q · CFO, PaymentsToAcquirePropertyPlantAndEquipment"),
  M("fcf_conversion", "FCF conversion", "pct", "higher", "cash", "Free cash flow ÷ Net income", "10-K/10-Q · derived from tagged facts"),
  M("capex_intensity", "Capex intensity", "pct", "none", "cash", "Capex ÷ Revenue", "10-K/10-Q · PaymentsToAcquirePropertyPlantAndEquipment"),
  M("rd_intensity", "R&D intensity", "pct", "none", "cash", "R&D expense ÷ Revenue", "10-K/10-Q · ResearchAndDevelopmentExpense"),

  // ---------------------------------------------------------------- operating efficiency
  M("inventory_turnover", "Inventory turnover", "x", "higher", "efficiency", "COGS (TTM) ÷ Average inventory", "10-K/10-Q · CostOfRevenue, InventoryNet"),
  M("dso", "Days sales outstanding", "days", "lower", "efficiency", "Receivables ÷ Revenue × 365", "10-K/10-Q · AccountsReceivableNetCurrent"),
  M("dpo", "Days payable outstanding", "days", "none", "efficiency", "Payables ÷ COGS × 365", "10-K/10-Q · AccountsPayableCurrent"),
  M("cash_conversion_cycle", "Cash conversion cycle", "days", "lower", "efficiency", "DSO + Days inventory − DPO", "10-K/10-Q · derived from tagged facts"),
  M("asset_turnover", "Asset turnover", "x", "higher", "efficiency", "Revenue (TTM) ÷ Average total assets", "10-K/10-Q · Revenues, Assets"),
  M("revenue_per_employee", "Revenue / employee", "usdm", "higher", "efficiency", "Revenue (TTM) ÷ Employee count", "10-K Item 1 (human capital) · Revenues", {
    normalizationRisk: "Employee count is narrative text in Item 1, not a tagged fact — parsed, and absent for filers that do not state it.",
  }),

  // ---------------------------------------------------------------- accounting quality
  M("restatement_rate", "Restatement rate", "pct", "lower", "accounting", "Filers with an 8-K 4.02 ÷ Filers", "8-K Item 4.02"),
  M("material_weakness_rate", "Material-weakness rate", "pct", "lower", "accounting", "Filers reporting an ICFR material weakness ÷ Filers", "10-K Item 9A", {
    threshold: { direction: "above", value: 4, note: "material-weakness rate above 4% of the peer set" },
  }),
  M("late_filing_rate", "Late-filing rate", "pct", "lower", "accounting", "Filers filing a 12b-25 ÷ Filers", "Form 12b-25 (NT 10-K / NT 10-Q)"),
  M("accruals_ratio", "Accruals ratio", "pct", "lower", "accounting", "(Net income − CFO) ÷ Average total assets", "10-K/10-Q · derived from tagged facts"),

  // ---------------------------------------------------------------- structure & activity
  M("net_entrants", "Net entrants", "count", "higher", "structure", "S-1 registrations − Form 15 deregistrations", "S-1 / 424B · Form 15"),
  M("ma_activity", "M&A activity", "count", "none", "structure", "Count of 8-K Item 1.01 / 2.01 events", "8-K Items 1.01, 2.01"),
  M("insider_net", "Insider net buy/sell", "x", "higher", "structure", "Insider buy value ÷ Insider sell value (open-market P/S only)", "Forms 3 / 4 / 5"),
  M("institutional_flow", "Institutional flow", "pct", "higher", "structure", "Change in 13F-reported positions vs prior quarter", "13F-HR · DERIVED by diffing quarters"),
];

export const METRIC_BY_KEY: Record<string, MetricDef> = Object.fromEntries(
  METRICS.map((m) => [m.key, m]),
);

export function metricsOfTheme(theme: ThemeKey): MetricDef[] {
  return METRICS.filter((m) => m.theme === theme);
}

// ------------------------------------------------------------------ sectors

export interface SectorDef {
  id: string;
  /** SIC industry group this peer set is drawn from (00 §6). */
  sic: string;
  naics: string;
  label: string;
  short: string;
  filers: number;
  subIndustries: string[];
}

export const SECTORS: SectorDef[] = [
  {
    id: "semis",
    sic: "3674",
    naics: "334413",
    label: "Semiconductors & related devices",
    short: "Semis",
    filers: 62,
    subIndustries: ["Logic & analog", "Memory", "Capital equipment", "Foundry & packaging", "EDA & IP"],
  },
  {
    id: "software",
    sic: "7372",
    naics: "513210",
    label: "Prepackaged software",
    short: "Software",
    filers: 148,
    subIndustries: ["Infrastructure", "Applications", "Security", "Developer tools"],
  },
  {
    id: "pharma",
    sic: "2834",
    naics: "325412",
    label: "Pharmaceutical preparations",
    short: "Pharma",
    filers: 211,
    subIndustries: ["Large-cap", "Specialty", "Generics"],
  },
  {
    id: "biotech",
    sic: "2836",
    naics: "325414",
    label: "Biological products",
    short: "Biotech",
    filers: 174,
    subIndustries: ["Clinical stage", "Commercial stage", "Platform"],
  },
  {
    id: "hardware",
    sic: "3570",
    naics: "334111",
    label: "Computer & office equipment",
    short: "Hardware",
    filers: 41,
    subIndustries: ["Systems", "Storage", "Peripherals"],
  },
  {
    id: "banks",
    sic: "6022",
    naics: "522110",
    label: "State commercial banks",
    short: "Banks",
    filers: 288,
    subIndustries: ["Money center", "Regional", "Community"],
  },
  {
    id: "energy",
    sic: "1311",
    naics: "211120",
    label: "Crude petroleum & natural gas",
    short: "Oil & gas",
    filers: 132,
    subIndustries: ["Integrated", "E&P", "Midstream"],
  },
  {
    id: "autos",
    sic: "3711",
    naics: "336110",
    label: "Motor vehicles & passenger car bodies",
    short: "Autos",
    filers: 27,
    subIndustries: ["OEM", "EV", "Commercial vehicles"],
  },
  {
    id: "utilities",
    sic: "4911",
    naics: "221112",
    label: "Electric services",
    short: "Utilities",
    filers: 63,
    subIndustries: ["Regulated", "Merchant", "Renewables"],
  },
  {
    id: "retail",
    sic: "5331",
    naics: "455110",
    label: "Retail — variety stores",
    short: "Retail",
    filers: 38,
    subIndustries: ["Mass", "Warehouse", "Discount"],
  },
  {
    id: "telecom",
    sic: "4813",
    naics: "517111",
    label: "Telephone communications",
    short: "Telecom",
    filers: 55,
    subIndustries: ["Wireless", "Wireline", "Infrastructure"],
  },
];

export const SECTOR_BY_ID: Record<string, SectorDef> = Object.fromEntries(
  SECTORS.map((s) => [s.id, s]),
);

// ------------------------------------------------------------------ filers

export interface FilerDef {
  symbol: string;
  name: string;
  cik: number;
  sector: string;
  subIndustry: string;
}

/**
 * The illustrative peer set. Symbols and CIKs are real public identifiers — the shape of the
 * layout depends on realistic ticker and name lengths — but EVERY figure attached to them in
 * this app is synthetic. The standing banner says so on every page.
 */
const SEMI_FILERS: [string, string, number, string][] = [
  ["NVDA", "NVIDIA Corp", 1045810, "Logic & analog"],
  ["AMD", "Advanced Micro Devices Inc", 2488, "Logic & analog"],
  ["INTC", "Intel Corp", 50863, "Logic & analog"],
  ["AVGO", "Broadcom Inc", 1730168, "Logic & analog"],
  ["QCOM", "QUALCOMM Inc", 804328, "Logic & analog"],
  ["TXN", "Texas Instruments Inc", 97476, "Logic & analog"],
  ["ADI", "Analog Devices Inc", 6281, "Logic & analog"],
  ["NXPI", "NXP Semiconductors NV", 1413447, "Logic & analog"],
  ["MCHP", "Microchip Technology Inc", 827054, "Logic & analog"],
  ["ON", "ON Semiconductor Corp", 1097864, "Logic & analog"],
  ["MRVL", "Marvell Technology Inc", 1835632, "Logic & analog"],
  ["MPWR", "Monolithic Power Systems Inc", 1280452, "Logic & analog"],
  ["SWKS", "Skyworks Solutions Inc", 4127, "Logic & analog"],
  ["QRVO", "Qorvo Inc", 1604778, "Logic & analog"],
  ["MU", "Micron Technology Inc", 723125, "Memory"],
  ["WDC", "Western Digital Corp", 106040, "Memory"],
  ["STX", "Seagate Technology Holdings", 1137789, "Memory"],
  ["AMAT", "Applied Materials Inc", 6951, "Capital equipment"],
  ["LRCX", "Lam Research Corp", 707549, "Capital equipment"],
  ["KLAC", "KLA Corp", 319201, "Capital equipment"],
  ["TER", "Teradyne Inc", 97210, "Capital equipment"],
  ["ENTG", "Entegris Inc", 1101302, "Capital equipment"],
  ["ONTO", "Onto Innovation Inc", 1073431, "Capital equipment"],
  ["AMKR", "Amkor Technology Inc", 1047127, "Foundry & packaging"],
  ["GFS", "GlobalFoundries Inc", 1709048, "Foundry & packaging"],
  ["SNPS", "Synopsys Inc", 883241, "EDA & IP"],
  ["CDNS", "Cadence Design Systems Inc", 813672, "EDA & IP"],
  ["LSCC", "Lattice Semiconductor Corp", 855658, "EDA & IP"],
];

export const FILERS: FilerDef[] = SEMI_FILERS.map(([symbol, name, cik, subIndustry]) => ({
  symbol,
  name,
  cik,
  sector: "semis",
  subIndustry,
}));

export const FILER_BY_SYMBOL: Record<string, FilerDef> = Object.fromEntries(
  FILERS.map((f) => [f.symbol, f]),
);

export function filersOfSector(sectorId: string, subIndustry?: string | null): FilerDef[] {
  const xs = FILERS.filter((f) => f.sector === sectorId);
  return subIndustry ? xs.filter((f) => f.subIndustry === subIndustry) : xs;
}

// ------------------------------------------------------------------ institutional managers

export interface ManagerDef {
  cik: number;
  name: string;
  short: string;
  /** Filer HQ as reported on the 13F cover page. */
  location: string;
  kind: "Index & multi-asset" | "Active equity" | "Hedge fund" | "Bank & wealth";
}

export const MANAGERS: ManagerDef[] = [
  { cik: 102909, name: "Vanguard Group Inc", short: "Vanguard", location: "PA", kind: "Index & multi-asset" },
  { cik: 1364742, name: "BlackRock Inc", short: "BlackRock", location: "NY", kind: "Index & multi-asset" },
  { cik: 93751, name: "State Street Corp", short: "State Street", location: "MA", kind: "Index & multi-asset" },
  { cik: 315066, name: "FMR LLC", short: "Fidelity", location: "MA", kind: "Active equity" },
  { cik: 1067983, name: "Berkshire Hathaway Inc", short: "Berkshire", location: "NE", kind: "Active equity" },
  { cik: 1350694, name: "Bridgewater Associates LP", short: "Bridgewater", location: "CT", kind: "Hedge fund" },
  { cik: 1037389, name: "Renaissance Technologies LLC", short: "RenTech", location: "NY", kind: "Hedge fund" },
  { cik: 1061768, name: "Baillie Gifford & Co", short: "Baillie Gifford", location: "X0", kind: "Active equity" },
  { cik: 1216228, name: "Capital Research Global Investors", short: "Capital Research", location: "CA", kind: "Active equity" },
  { cik: 1103804, name: "Viking Global Investors LP", short: "Viking", location: "CT", kind: "Hedge fund" },
  { cik: 1418814, name: "Coatue Management LLC", short: "Coatue", location: "NY", kind: "Hedge fund" },
  { cik: 1006249, name: "Northern Trust Corp", short: "Northern Trust", location: "IL", kind: "Bank & wealth" },
];

export const MANAGER_BY_CIK: Record<number, ManagerDef> = Object.fromEntries(
  MANAGERS.map((m) => [m.cik, m]),
);

// ------------------------------------------------------------------ periods

export const PERIODS = ["2026-Q1", "2025-Q4", "2025-Q3", "2025-Q2"] as const;
export type Period = (typeof PERIODS)[number];

/** Quarter-end date for a period key. */
export function periodEnd(period: string): string {
  const [y, q] = period.split("-");
  return { Q1: `${y}-03-31`, Q2: `${y}-06-30`, Q3: `${y}-09-30`, Q4: `${y}-12-31` }[q] ?? `${y}-12-31`;
}

/** The eight quarters ending at `period`, oldest first. */
export function trailingQuarters(period: string, n = 8): string[] {
  const [y0, q0] = period.split("-");
  let y = Number(y0);
  let q = Number(q0.slice(1));
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.unshift(`${y}-Q${q}`);
    q -= 1;
    if (q === 0) {
      q = 4;
      y -= 1;
    }
  }
  return out;
}
