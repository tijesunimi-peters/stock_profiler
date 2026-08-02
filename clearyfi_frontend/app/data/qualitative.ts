/**
 * The Qualitative and Filings altitudes' data, ported from the prototype.
 *
 * Everything here is counted from NARRATIVE text — Item 1A, Item 1C, Item 3, the auditor's
 * report, Item 9A — not from tagged XBRL. That is a different evidentiary class from the sector
 * view's numbers, and it carries parsing risk those do not.
 *
 * Still synthetic (see `data/README.md`): the coverage percentages and counts are the
 * prototype's own fixtures, kept verbatim so the port renders the figures the design was drawn
 * against. None of it may be carried into production.
 */

/** The peer pool every filer-reveal draws from — the prototype's 28 semiconductor tickers. */
export const PEER_TICKERS = [
  "NVDA", "AMD", "INTC", "TXN", "AVGO", "QCOM", "MU", "ADI", "MCHP", "NXPI",
  "ON", "MRVL", "SWKS", "QRVO", "LSCC", "MPWR", "WOLF", "ALGM", "SLAB", "AMBA",
  "SMTC", "POWI", "DIOD", "FORM", "ACLS", "UCTT", "CRUS", "SITM",
] as const;

/** Company names for the tickers the filings table lists. Identity is factual. */
export const FILER_NAMES: Record<string, string> = {
  NVDA: "NVIDIA Corp", AMD: "Advanced Micro Devices", INTC: "Intel Corp",
  TXN: "Texas Instruments", AVGO: "Broadcom Inc", QCOM: "Qualcomm Inc",
  MU: "Micron Technology", ADI: "Analog Devices", MCHP: "Microchip Technology",
  NXPI: "NXP Semiconductors", ON: "ON Semiconductor", MRVL: "Marvell Technology",
  SWKS: "Skyworks Solutions", QRVO: "Qorvo Inc", LSCC: "Lattice Semiconductor",
  MPWR: "Monolithic Power", WOLF: "Wolfspeed Inc", ALGM: "Allegro MicroSystems",
  SLAB: "Silicon Labs", AMBA: "Ambarella Inc", SMTC: "Semtech Corp",
  POWI: "Power Integrations", DIOD: "Diodes Inc", FORM: "FormFactor Inc",
  ACLS: "Axcelis Technologies", UCTT: "Ultra Clean Holdings", CRUS: "Cirrus Logic",
  SITM: "SiTime Corp",
};

/** FNV-1a as a raw 32-bit unsigned — the sort key `pickFilers` orders on. */
function hash32(s: string): number {
  let x = 2166136261;
  for (let i = 0; i < s.length; i++) {
    x ^= s.charCodeAt(i);
    x = Math.imul(x, 16777619);
  }
  return x >>> 0;
}

/**
 * A deterministic pick of `count` tickers for a given id.
 *
 * Stable per id, so the filers behind a count do not reshuffle between renders — a reader who
 * opens the same number twice has to see the same names, or the reveal is worthless as evidence.
 */
export function pickFilers(id: string, count: number): string[] {
  return PEER_TICKERS.map((tk) => ({ tk, k: hash32(id + tk) }))
    .sort((a, b) => a.k - b.k)
    .slice(0, Math.min(count, PEER_TICKERS.length))
    .map((o) => o.tk);
}

export type ThemeDirection = "new" | "rising" | "fading" | "stable";

export interface DirChip {
  label: string;
  color: string;
  bg: string;
  border: string;
}

/**
 * The direction chip for a risk theme.
 *
 * `new` gets the GAAP hue and the others get ink or the extension hue — none of them is a
 * favorability color. A rising theme is not a worse sector; it is more filers writing a
 * paragraph. The chip says which, and stops.
 */
export function dirChip(dir: ThemeDirection): DirChip {
  if (dir === "new")
    return { label: "new", color: "var(--gaap)", bg: "var(--gaap-bg)", border: "var(--gaap-border)" };
  if (dir === "rising")
    return { label: "↑ rising", color: "var(--ext)", bg: "var(--ext-bg)", border: "var(--ext-border)" };
  if (dir === "fading")
    return { label: "↓ fading", color: "var(--ink-soft)", bg: "transparent", border: "var(--border-strong)" };
  return { label: "— stable", color: "var(--mono-muted)", bg: "transparent", border: "var(--border-strong)" };
}

export interface QualTheme {
  name: string;
  cov: number;
  dir: ThemeDirection;
}

/**
 * The risk-factor taxonomy, FROZEN year over year.
 *
 * That is the whole basis for reading a direction off it: re-cutting the taxonomy each year
 * would manufacture rising/new/fading that no filer actually wrote.
 */
export const QUAL_THEMES: QualTheme[] = [
  { name: "Foundry / supply concentration", cov: 86, dir: "stable" },
  { name: "Export controls & geopolitics", cov: 79, dir: "rising" },
  { name: "Customer concentration", cov: 71, dir: "stable" },
  { name: "Cyclical demand / inventory", cov: 68, dir: "fading" },
  { name: "Talent & skilled labor", cov: 61, dir: "rising" },
  { name: "Capital intensity", cov: 58, dir: "stable" },
  { name: "IP & patent litigation", cov: 54, dir: "stable" },
  { name: "AI-demand dependence", cov: 44, dir: "new" },
  { name: "Water / energy for fabs", cov: 33, dir: "rising" },
];

/** A verbatim excerpt per theme, with the section it was located in. */
export const THEME_LANG: Record<string, { src: string; quote: string }> = {
  "Foundry / supply concentration": {
    src: "10-K · Item 1A · large-cap fabless filer",
    quote:
      "We rely on a limited number of third-party foundries, and a substantial majority of our advanced-node wafers are sourced from a single foundry partner concentrated in one geographic region.",
  },
  "Export controls & geopolitics": {
    src: "10-K · Item 1A · multiple filers",
    quote:
      "New or expanded export licensing requirements affecting sales of advanced computing and semiconductor manufacturing items to certain jurisdictions could materially reduce our addressable market.",
  },
  "Customer concentration": {
    src: "10-K · Item 1A · analog filer",
    quote:
      "Our ten largest customers accounted for a significant portion of net revenue, and the loss of, or a reduction in orders from, any key customer could harm operating results.",
  },
  "Cyclical demand / inventory": {
    src: "10-K · Item 1A / MD&A",
    quote:
      "The semiconductor industry is highly cyclical and has experienced significant downturns; inventory corrections at our customers may lead to reduced bookings and underutilization.",
  },
  "Talent & skilled labor": {
    src: "10-K · Item 1 (Human Capital)",
    quote:
      "Competition for engineering and technical talent is intense, and our ability to attract and retain skilled personnel is critical to executing our technology roadmap.",
  },
  "Capital intensity": {
    src: "10-K · Item 1A",
    quote:
      "Constructing and equipping advanced fabrication facilities requires very substantial capital expenditure, and we may be unable to achieve sufficient utilization to recover these investments.",
  },
  "IP & patent litigation": {
    src: "10-K · Item 3 (Legal)",
    quote:
      "We are subject to intellectual-property claims and litigation that are expensive and time-consuming, and an adverse outcome could require us to pay damages or cease certain product sales.",
  },
  "AI-demand dependence": {
    src: "10-K · Item 1A · newly added",
    quote:
      "A significant and growing portion of recent demand is attributable to artificial-intelligence applications; a slowdown in AI infrastructure investment could disproportionately affect our results.",
  },
  "Water / energy for fabs": {
    src: "10-K · Item 1A / Human Capital & Environment",
    quote:
      "Our manufacturing operations depend on reliable access to large volumes of water and energy, and scarcity, rationing, or price increases could disrupt production.",
  },
};

/** Cybersecurity — Item 1C (required since the 2023 rule) plus 8-K Item 1.05. */
export const CYBER = {
  adopted: 96,
  board: 81,
  ciso: 74,
  incidents8k: 5,
  note: "96% describe an Item 1C process; 5 filed an 8-K Item 1.05 material-incident report this year.",
};

/** Critical Audit Matters, from the auditor's report (PCAOB AS 3101). */
export const CAMS = [
  { name: "Revenue recognition (multiple-element)", cov: 62 },
  { name: "Inventory valuation / excess & obsolete", cov: 54 },
  { name: "Goodwill & intangible impairment", cov: 41 },
  { name: "Income taxes / uncertain positions", cov: 33 },
  { name: "Business-combination purchase accounting", cov: 22 },
];

export const AUDITORS = [
  { name: "Big Four A", share: 34 },
  { name: "Big Four B", share: 29 },
  { name: "Big Four C", share: 18 },
  { name: "Big Four D", share: 13 },
  { name: "Other / regional", share: 6 },
];

export const AUDITOR_CHANGES = 4;
export const AUDITOR_TENURE = "11.2 yr median tenure";

/** Item 1A word count, six fiscal years. */
export const RF_VOLUME = {
  words: [7800, 8200, 8900, 9600, 10400, 11200],
  median: "10.9k words",
  yoy: "+7.7% YoY",
  netNew: "3.1 net-new factors / filer",
  note: "Item 1A length trending up for 6 straight years.",
};

export const NON_GAAP = {
  nonGaapUse: 88,
  restructuring: 37,
  impairment: 24,
  note: "88% present at least one non-GAAP measure; 37% recorded a restructuring charge, 24% an impairment.",
};

/** Late and deficient filings — Form 12b-25, Item 9A ICFR, 8-K Item 4.02. */
export const DEFICIENT = [
  { label: "NT 10-K / 10-Q (late)", count: 3, basis: "Form 12b-25" },
  { label: "Material weakness (ICFR)", count: 5, basis: "Item 9A" },
  { label: "Restatement (Item 4.02)", count: 2, basis: "8-K" },
];

/**
 * Human-capital and climate coverage.
 *
 * Climate stays sparse because the SEC's climate rule is stayed — a low number here measures
 * the rule's status, not the sector's behavior.
 */
export const HC_CLIMATE = [
  { label: "Human-capital section", cov: 98, basis: "Item 1 · required 2020" },
  { label: "Headcount disclosed", cov: 91, basis: "Item 1" },
  { label: "DEI / turnover metrics", cov: 47, basis: "Item 1" },
  { label: "GHG / climate targets", cov: 38, basis: "voluntary · rule stayed" },
  { label: "Water / energy use", cov: 29, basis: "voluntary" },
];

export const EMERGING = [
  { title: "AI-demand concentration", count: 27, note: "0 last year" },
  { title: "Water & energy scarcity for fabs", count: 21, note: "up from 6" },
  { title: "Export-control license risk", count: 49, note: "up from 31" },
];

export const GOING_CONCERN = [
  { filer: "Wolfspeed-class filer", nature: "substantial doubt" },
  { filer: "Mid-cap analog filer", nature: "covenant waiver" },
];

export const LITIGATION = [
  { name: "Patent / IP", count: 34 },
  { name: "Antitrust / export enforcement", count: 12 },
  { name: "Securities", count: 7 },
];

export const LITIGATION_TOTAL = 53;

/**
 * The per-filer signal matrix.
 *
 * Presence, not magnitude: `gc` and `lit` are a filled dot or a dash. Mapping a risk-factor
 * COUNT to a color ramp would invite reading "more risk factors" as "riskier", which Item 1A
 * does not support — a careful filer writes more of them.
 */
export const SIGNAL_MATRIX = [
  { filer: "NVDA", rf: 41, nw: 3, gc: false, lt: true },
  { filer: "AMD", rf: 38, nw: 2, gc: false, lt: true },
  { filer: "INTC", rf: 52, nw: 4, gc: false, lt: true },
  { filer: "MU", rf: 44, nw: 5, gc: false, lt: false },
  { filer: "WOLF", rf: 47, nw: 6, gc: true, lt: true },
  { filer: "MCHP", rf: 33, nw: 1, gc: false, lt: false },
  { filer: "QRVO", rf: 36, nw: 0, gc: false, lt: false },
  { filer: "AMBA", rf: 29, nw: 2, gc: false, lt: false },
];

// ============================================================ the filings drill

export interface FilingRow {
  ticker: string;
  name: string;
  form: string;
  formBg: string;
  formColor: string;
  date: string;
  acc: string;
  section: string;
  snippet: string;
}

export interface ThemeFilings {
  theme: string;
  quote: string;
  src: string;
  coverageLabel: string;
  dir: DirChip;
  rows: FilingRow[];
}

/** FNV-1a normalized over the full 32-bit range — the filings table's own salt scheme. */
function seedd(s: string): number {
  return hash32(s) / 4294967295;
}

/**
 * Every filing our taxonomy matched to one theme.
 *
 * Rows resolve IN-APP rather than to EDGAR: handing the reader off to the raw document is
 * exactly the work the product claims to have already done.
 */
export function themeFilings(theme: string, peerCount: number): ThemeFilings | null {
  const meta = QUAL_THEMES.find((t) => t.name === theme);
  if (!meta) return null;
  const lang = THEME_LANG[theme] ?? { quote: "", src: "" };
  const count = Math.max(3, Math.round((peerCount * meta.cov) / 100));
  const forms = ["10-K", "10-K", "10-Q", "10-K", "8-K"];
  const snippets = [
    lang.quote,
    "The company identifies this among its principal risk factors and notes that adverse developments could have a material effect on its business, financial condition, or results of operations.",
    "Management discusses this exposure in its quarterly update, observing heightened attention during the period and outlining mitigation steps underway.",
    lang.quote,
    "Item 1A cross-references this factor as newly expanded relative to the prior annual report.",
  ];

  const rows = pickFilers(`theme-${theme}`, Math.min(count, 14))
    .map((tk, i) => {
      const form = forms[Math.floor(seedd(theme + tk + "f") * forms.length)];
      const mo = 1 + Math.floor(seedd(tk + theme + "m") * 11);
      const dy = 1 + Math.floor(seedd(`${tk}d`) * 27);
      return {
        ticker: tk,
        name: FILER_NAMES[tk] ?? tk,
        form,
        formBg: form === "8-K" ? "var(--gaap-bg)" : "var(--accent-wash)",
        formColor: form === "8-K" ? "var(--gaap)" : "var(--accent-ink)",
        date: `2026-${String(mo).padStart(2, "0")}-${String(dy).padStart(2, "0")}`,
        acc: `000${1000000 + Math.floor(seedd(tk + theme) * 8999999)}-26-${String(100000 + Math.floor(seedd(`${tk}a`) * 899999))}`,
        section: form === "8-K" ? "Item 8.01" : "Item 1A · Risk Factors",
        snippet: snippets[i % snippets.length],
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  return {
    theme,
    quote: lang.quote,
    src: lang.src,
    coverageLabel: `${meta.cov}% of ${peerCount} filers cite this`,
    dir: dirChip(meta.dir),
    rows,
  };
}

export const FILINGS_PER_PAGE = 6;
export const FORM_TABS = ["All forms", "10-K", "10-Q", "8-K"] as const;
