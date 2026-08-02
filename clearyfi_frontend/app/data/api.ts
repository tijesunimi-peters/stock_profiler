/**
 * THE SEAM.
 *
 * Every view reads through these functions and nothing else. Today they resolve
 * deterministic-synthetic payloads; when the real API is plumbed in, the bodies become
 * `fetch("/v1/…")` calls and no view changes.
 *
 * `?slow` on any URL adds latency so the loading states can be checked without a network.
 *
 * ## Two fixture lineages, and which one wins
 *
 * `surfaces.ts` is the PRE-PORT catalog (see `state.tsx`'s compatibility shims). `hub.ts`,
 * `insider.ts`, `peers.ts` and `qualitative.ts` are the figures the accepted design was actually
 * drawn against. **Operator ruling 2026-08-02 (option C): the seam resolves the PORTED builders.**
 * The `company*`/`inst*` functions below follow that ruling; the older entries still read
 * `surfaces.ts` and are retired view by view (P0b).
 *
 * ## Where the reshaping goes — and what it may NOT do
 *
 * Operator ruling, same date: **the API response is the source of truth; `surfaces.ts` adapts it
 * per card.** This module FETCHES (params out, canonical JSON in, fan out to N endpoints and
 * merge); the adapter RESHAPES (rename, group, order, label). **Neither may DERIVE.**
 *
 * If a number is not in the response, the card renders `N/A` — never arithmetic. Computing one
 * client-side discards the `status`/`reason`/`formula`/`cannot` the API attaches to every derived
 * figure, and a number rendered without those is indistinguishable from a fabricated one. `?? 0`
 * is banned in this layer for the same reason: it turns "we don't know" into "it's zero".
 *
 * ## Period is THREE things, deliberately
 *
 * The real API spells three incompatible vocabularies `period`: a `(year, FiscalPeriod)` pair for
 * facts and metrics, a 13F **quarter-end ISO date** for the institutional endpoints, and a
 * `quarters` LOOKBACK COUNT for the series ones. The signatures below are typed for whichever one
 * their group's endpoints take, so Phase A never has to re-cut a boundary. They are not
 * interchangeable: a fiscal Q1 and a calendar quarter-end are different instants.
 */
import * as surfaces from "./surfaces";
import * as hub from "./hub";
import * as insider from "./insider";
import * as peers from "./peers";
import * as proto from "./prototype";
import * as qual from "./qualitative";
import * as mgr from "./manager";
import { usdCompact } from "../lib/format";

const DELAY = () => (typeof location !== "undefined" && location.search.includes("slow") ? 900 : 0);
/**
 * `?fail` makes every seam call reject.
 *
 * The sibling of `?slow`, and it exists for the same reason: an error state that cannot be reached
 * is an error state nobody has ever seen. Without a switch here the only way to exercise one is to
 * break the app on purpose and remember to put it back — which is how a view ships with a blank
 * screen where a `StateBlock` should be. Costs one branch and makes the state drivable.
 */
const SHOULD_FAIL = () => typeof location !== "undefined" && location.search.includes("fail");

function resolve<T>(value: T): Promise<T> {
  if (SHOULD_FAIL()) {
    return Promise.reject(new Error("Simulated upstream failure (?fail). No SEC endpoint was called."));
  }
  const ms = DELAY();
  return ms ? new Promise((r) => setTimeout(() => r(value), ms)) : Promise.resolve(value);
}

/**
 * Every payload says where it came from. Today: nowhere real.
 *
 * `syntheticSurfaces` drives `ui/SyntheticBanner` — REMOVE A NAME FROM THIS LIST as each surface
 * is plumbed onto real endpoints, and when the list empties the banner stops rendering by itself.
 * That disappearance is the acceptance evidence for the plumbing roadmap, the same way
 * `ipBanner()` proved it in the server-rendered app.
 */
export const PROVENANCE = {
  synthetic: true,
  note: "Deterministic-synthetic figures. No SEC endpoint is being called.",
  syntheticSurfaces: [
    "company overview",
    "financial history",
    "institutional",
    "insider activity",
    "peer-relative",
    "sector",
    "qualitative",
    "filings",
    "manager",
    "compare",
  ] as readonly string[],
} as const;


/* ============================================================ the real seam
 *
 * The first function below actually crosses the network. Everything else still resolves a
 * fixture, and the `?slow` / `?fail` switches keep working for both — a half-plumbed app has to
 * be drivable in the same states as a whole one.
 */

/** One canonical `/v1` read. Errors carry what failed, so the view's `StateBlock` can say it. */
async function getJson<T>(path: string): Promise<T> {
  if (SHOULD_FAIL()) {
    return Promise.reject(new Error("Simulated upstream failure (?fail). No SEC endpoint was called."));
  }
  const ms = DELAY();
  if (ms) await new Promise((r) => setTimeout(r, ms));
  const res = await fetch(path, { headers: { accept: "application/json" } });
  if (!res.ok) {
    // 404 means the ticker is unknown; anything else is upstream. Both need to reach the reader
    // as words, not as a blank card.
    throw new Error(
      res.status === 404
        ? `No filer matches this ticker (${res.status}).`
        : `The filings API returned ${res.status}.`,
    );
  }
  return (await res.json()) as T;
}

/** What `/v1/companies/{symbol}/profile` returns. Fields are null when EDGAR did not state one. */
interface ProfileResponse {
  cik: number;
  name: string | null;
  sic: string | null;
  sic_description: string | null;
  state_of_incorporation: string | null;
  hq_city: string | null;
  hq_state: string | null;
  fiscal_year_end: string | null;
  filer_category: string | null;
  ein: string | null;
  exchanges: string | null;
  first_filing_date: string | null;
}

/** EDGAR's MMDD (`"0926"`) as a readable date. Returns null rather than guessing at junk. */
function formatFiscalYearEnd(mmdd: string | null): string | null {
  if (!mmdd || mmdd.length !== 4) return null;
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const m = Number(mmdd.slice(0, 2));
  const d = Number(mmdd.slice(2));
  if (!(m >= 1 && m <= 12) || !(d >= 1 && d <= 31)) return null;
  return `${months[m - 1]} ${d}`;
}

/**
 * The cover-page rows, in the design's order.
 *
 * **Every row survives, including the ones we cannot source.** Dropping a row would quietly
 * change what the card claims to cover; a row that says why it is empty does not. The three
 * `reason` strings below are different facts about the world and are worded to stay different:
 *
 *   * NAICS — the SEC assigns SIC. There is no NAICS to fetch, from any source we hold.
 *   * Employees — a real XBRL tag that virtually no filer uses (1 in ~9,000 on our volume).
 *   * Auditor — tagged, but only inside the 10-K's inline-XBRL instance, which we do not fetch.
 *
 * `null` from the API is a fourth case again — EDGAR holds the field but did not state it for
 * this filer — and reads as a plain N/A rather than one of the explanations above.
 */
const NOT_SOURCED = {
  naics: "The SEC assigns SIC, not NAICS — there is no NAICS in the filing record.",
  employees: "A tagged fact almost no filer reports; nothing to show for this one.",
  auditor: "Named in the 10-K's XBRL instance, which we do not yet fetch.",
} as const;

function profileRows(p: ProfileResponse): { k: string; v: string; reason?: string }[] {
  const na = (v: string | null | undefined) => (v && v.trim() ? v : "N/A");
  const hq = [p.hq_city, p.hq_state].filter(Boolean).join(", ");
  return [
    { k: "CIK", v: String(p.cik).padStart(10, "0") },
    { k: "SIC", v: p.sic ? `${p.sic}${p.sic_description ? ` · ${p.sic_description}` : ""}` : "N/A" },
    { k: "NAICS", v: "N/A", reason: NOT_SOURCED.naics },
    { k: "State of incorp.", v: na(p.state_of_incorporation) },
    { k: "Headquarters", v: na(hq) },
    { k: "Fiscal year-end", v: na(formatFiscalYearEnd(p.fiscal_year_end)) },
    { k: "Independent auditor", v: "N/A", reason: NOT_SOURCED.auditor },
    { k: "Employees", v: "N/A", reason: NOT_SOURCED.employees },
    { k: "Filer status", v: na(p.filer_category) },
    { k: "First filing", v: na(p.first_filing_date) },
  ];
}

/** EDGAR browse-by-form, built from the REAL cik the API returned. */
function edgarLinks(cik: number) {
  const e = (type: string) =>
    `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${String(cik).padStart(10, "0")}` +
    `&type=${encodeURIComponent(type)}&dateb=&owner=include&count=40`;
  return { tenK: e("10-K"), tenQ: e("10-Q"), eightK: e("8-K"), proxy: e("DEF 14A"),
           forms4: e("4"), ex21: e("10-K"), s3: e("S-3"), all: e("") };
}

/**
 * What the registrant is, said from the STRUCTURED record only.
 *
 * The design wants the filer's own Item 1 description. That is narrative text and out of scope
 * (Track 1), and the fixture's paragraph must never ship — attached to a real company it would
 * read as a claim about that company that nobody made. So this states what the record actually
 * says: classification, where it is incorporated, where it files from, how long it has filed.
 * Less than the design asked for, and true.
 */
function identitySentence(p: ProfileResponse): string {
  const bits: string[] = [];
  if (p.sic_description) bits.push(`Classified by the SEC under SIC ${p.sic} — ${p.sic_description}`);
  if (p.state_of_incorporation) bits.push(`incorporated in ${p.state_of_incorporation}`);
  const hq = [p.hq_city, p.hq_state].filter(Boolean).join(", ");
  if (hq) bits.push(`filing from ${hq}`);
  if (p.exchanges) bits.push(`listed on ${p.exchanges}`);
  const head = bits.length ? bits.join(", ") + "." : "The SEC holds no classification for this filer.";
  const since = p.first_filing_date
    ? ` EDGAR holds filings from ${p.first_filing_date} onward.`
    : "";
  return `${head}${since} This is the registrant's own filing record, not a description of the business — Item 1 is narrative text we do not parse.`;
}


/* ------------------------------------------------------------ §02 condensed statements */

interface CondensedResponse {
  cik: number;
  statement: string;
  period_type: string;
  columns: { fiscal_year: number; fiscal_period: string; period_end: string | null; form: string | null }[];
  rows: { canonical_concept: string; label: string; unit: string; values: (number | null)[] }[];
}

/**
 * The design's condensed row set, per statement.
 *
 * `/condensed` returns every canonical concept it could map — 23 for an income statement. The
 * card is a CONDENSED statement, and which lines belong on one is a product decision the design
 * already made; selecting and ordering them is reshaping, not deriving.
 *
 * **A row with no `concept` is kept, not dropped.** Some of the design's lines have no single
 * canonical source — "Total debt" would need long-term plus current debt added together, and
 * adding two reported numbers to make a third is exactly the arithmetic the adapter may not do.
 * Those render N/A with the reason, because dropping them would silently redefine what the
 * statement covers.
 */
const STATEMENT_ROWS: Record<
  "income" | "balance" | "cash",
  {
    label: string;
    concept: string | null;
    rule?: boolean;
    bold?: boolean;
    derived?: boolean;
    reason?: string;
    /** Set only on a row the adapter is sanctioned to compute. `get` returns one column's value. */
    compute?: (get: (concept: string) => number | null) => number | null;
  }[]
> = {
  income: [
    { label: "Revenue", concept: "revenue" },
    { label: "Cost of revenue", concept: "cost_of_revenue" },
    { label: "Gross profit", concept: "gross_profit", rule: true },
    { label: "Research & development", concept: "research_and_development" },
    { label: "Selling, general & admin.", concept: "sga_expense" },
    { label: "Operating income", concept: "operating_income", rule: true },
    { label: "Interest & other, net", concept: "nonoperating_income_expense" },
    { label: "Income tax provision", concept: "income_tax_expense" },
    { label: "Net income", concept: "net_income", rule: true, bold: true },
    { label: "Diluted EPS", concept: "eps_diluted" },
  ],
  balance: [
    { label: "Cash & short-term investments", concept: "cash_and_equivalents" },
    { label: "Accounts receivable, net", concept: "accounts_receivable" },
    { label: "Inventories", concept: "inventory" },
    { label: "Property & equipment, net", concept: "ppe_net" },
    { label: "Goodwill & intangibles", concept: "goodwill" },
    { label: "Total assets", concept: "total_assets", rule: true },
    {
      label: "Total debt",
      concept: null,
      reason:
        "No filer reports one “total debt” line. It would mean adding long-term to current debt, " +
        "and a number we add together is not a number anyone filed.",
    },
    { label: "Deferred revenue", concept: "deferred_revenue_current" },
    { label: "Total stockholders' equity", concept: "stockholders_equity", rule: true, bold: true },
  ],
  cash: [
    { label: "Cash from operations", concept: "cash_from_operations" },
    { label: "Capital expenditures", concept: "capital_expenditures" },
    {
      label: "Free cash flow (derived)",
      concept: null,
      derived: true,
      /*
       * THE ONE DERIVATION THE ADAPTER MAKES (operator ruling, 2026-08-02).
       *
       * The general rule stands — if a number is not in the response the card renders N/A, because
       * a figure computed here arrives without the status the API attaches to reported values.
       * This row is the sanctioned exception: the design marks it `derived`, the ƒ chip says so on
       * the face of the card, and the drawer holds the formula, its inputs, and the caveat that
       * filers define free cash flow differently in their own non-GAAP reconciliations. The
       * provenance is carried; that is what the exception turns on.
       */
      compute: (get) => {
        const cfo = get("cash_from_operations");
        const capex = get("capital_expenditures");
        // Both, or nothing. Half the inputs cannot make a whole figure, and a partial answer here
        // would be indistinguishable from a real one.
        if (cfo === null || capex === null) return null;
        // Capex is subtracted as a MAGNITUDE. Filers report it either way — as a positive payment
        // (Apple does) or as a negative outflow — and a sign-naive subtraction silently ADDS it
        // for the second group, producing a plausible number that is wrong by twice capex.
        return cfo - Math.abs(capex);
      },
    },
    { label: "Acquisitions, net", concept: "payments_for_acquisitions" },
    { label: "Share repurchases", concept: "share_repurchases" },
    { label: "Dividends paid", concept: "dividends_paid" },
    { label: "Debt issued (repaid), net", concept: null, reason: "Reported as separate issuance and repayment lines, never as a net one." },
  ],
};

/** A reported value, or N/A. **Never 0** — `null` means the period did not report the line. */
function statementValue(v: number | null | undefined, unit: string): string {
  if (v === null || v === undefined) return "N/A";
  if (unit === "USD/shares") return `$${v.toFixed(2)}`;
  if (unit === "shares" || unit === "pure") return compactNumber(v);
  return usdCompact(v);
}

function compactNumber(v: number): string {
  const a = Math.abs(v);
  const [n, s] = a >= 1e9 ? [v / 1e9, "B"] : a >= 1e6 ? [v / 1e6, "M"] : a >= 1e3 ? [v / 1e3, "K"] : [v, ""];
  return `${Math.round(n * 100) / 100}${s}`;
}

/**
 * A column header that says WHICH PERIOD it is, not just which year.
 *
 * The hub reads quarters, so a column of Q1 figures headed "FY23" reads as a full year — Apple's
 * Q1 revenue is $117B against $394B for the year, and nothing on the card would have told a
 * reader which one they were looking at. The period type belongs in the label whenever it is not
 * the full year.
 */
const columnLabel = (c: CondensedResponse["columns"][number]) => {
  const yy = `FY${String(c.fiscal_year).slice(2)}`;
  return c.fiscal_period === "FY" ? yy : `${c.fiscal_period} ${yy}`;
};

function toStatementRows(res: CondensedResponse, key: "income" | "balance" | "cash") {
  const byConcept = new Map(res.rows.map((r) => [r.canonical_concept, r]));
  /** One column's value for a concept, or null when that period did not report it. */
  const valueAt = (i: number) => (concept: string) => byConcept.get(concept)?.values[i] ?? null;

  return STATEMENT_ROWS[key].map((spec) => {
    const row = spec.concept ? byConcept.get(spec.concept) : undefined;
    return {
      label: spec.label,
      strongRule: !!spec.rule,
      bold: !!spec.bold,
      derived: !!spec.derived,
      reason: row || spec.compute ? undefined : spec.reason,
      vals: res.columns.map((_c, i) => {
        if (spec.compute) return statementValue(spec.compute(valueAt(i)), "USD");
        return row ? statementValue(row.values[i], row.unit) : "N/A";
      }),
    };
  });
}


export const api = {
  sector: (sectorId: string, sub: string | null, period: string) =>
    resolve(surfaces.sectorSurface(sectorId, sub, period)),

  qualitative: (sectorId: string, period: string) => resolve(surfaces.qualitativeSurface(sectorId, period)),

  filings: (sectorId: string, themeId: string, period: string) =>
    resolve(surfaces.filingsSurface(sectorId, themeId, period)),

  compareSectors: (a: string, b: string, period: string) => resolve(surfaces.compareSectors(a, b, period)),

  company: (symbol: string, period: string, sub: string | null) =>
    resolve(surfaces.companySurface(symbol, period, sub)),

  companyHistory: (symbol: string, period: string) => resolve(surfaces.companyHistory(symbol, period)),

  companyInstitutional: (symbol: string, period: string) =>
    resolve(surfaces.companyInstitutional(symbol, period)),

  companyInsider: (symbol: string, period: string) => resolve(surfaces.companyInsider(symbol, period)),

  companyPeers: (symbol: string, period: string, sub: string | null) =>
    resolve(surfaces.companyPeers(symbol, period, sub)),

  compareCompanies: (x: string, y: string, period: string) =>
    resolve(surfaces.compareCompanies(x, y, period)),

  manager: (cik: number, period: string) => resolve(surfaces.managerSurface(cik, period)),

  managerFootprint: (cik: number, period: string) => resolve(surfaces.managerFootprint(cik, period)),

  managerVoting: (cik: number, period: string) => resolve(surfaces.managerVoting(cik, period)),

  managerFivePercent: (cik: number, period: string) => resolve(surfaces.managerFivePercent(cik, period)),

  managerActivity: (cik: number, period: string) => resolve(surfaces.managerActivity(cik, period)),

  managerBehaviour: (cik: number, period: string) => resolve(surfaces.managerBehaviour(cik, period)),

  // ========================================================== Company Hub → Overview
  // Grouped by BACKEND READ PATTERN, not by visual section. One endpoint family per function, so
  // Phase A replaces a body rather than re-cutting a boundary. Precedent:
  // `/institutional-register-shape` returns turnover+tenure+stable-capital together "because they
  // all consume the identical multi-quarter read -- splitting them would triple the work".

  /** §01 identity + the breadcrumb. Phase A: `/profile` + `/submissions` metadata + `/peers`. */
  /**
   * §01 identity. **REAL — this one calls `/v1/companies/{symbol}/profile`.**
   *
   * First surface off the fixtures. Two things it deliberately does NOT do:
   *
   *   * **The segment chips stay unsourced.** A revenue split by segment is ASC 280 dimensional
   *     data (Phase C), so they render as a single unsourced chip rather than the fixture's
   *     plausible 55/30/15 — which would be a fabricated split attached to a real company.
   *   * **The subsidiary table stays empty.** EX-21 is an exhibit document; `CLAUDE.md` forbids
   *     parsing filing documents, so the count is not "0", it is unknown, and the card says so.
   *
   * The peer-set pill is still a fixture: it needs `/peers`, which is the next slice.
   */
  companyIdentity: async (symbol: string, subIdx: number): Promise<CompanyIdentity> => {
    const p = await getJson<ProfileResponse>(
      `/v1/companies/${encodeURIComponent(symbol)}/profile`,
    );
    return {
      profile: profileRows(p),
      links: edgarLinks(p.cik),
      segmentChips: [],
      contextPill: hub.hubContextPill(subIdx >= 0, proto.SUB_COUNTS[subIdx] ?? 0),
      bizText: identitySentence(p),
      structure: {
        subCount: null,
        offshore: null,
        subs: [],
        note:
          "EX-21 lists every consolidated subsidiary and its jurisdiction. It is an exhibit " +
          "document, and we ingest structured data rather than parsing filing documents — so " +
          "this is unknown, not zero.",
      },
    };
  },

  /**
   * §02.1 condensed statements + §02.6 snapshot tiles.
   *
   * One group because ONE facts read serves both: Phase A is
   * `/statements/{income|balance|cashflow}/condensed` x3 + `/metrics`, all off the same cached
   * RawFacts. `year` is separate because `/metrics` and `/statements` both require it -- a
   * `FiscalPeriod` is a period TYPE ("FY", "Q3") and carries no year of its own.
   */
  /**
   * §02 condensed statements. **REAL — three `/statements/{s}/condensed` reads.**
   *
   * Fanned out rather than merged: the operator's ruling is that the frontend may make as many
   * requests as it needs, and the alternative would be an aggregate endpoint bent to fit this one
   * card. Each is the same cached facts read server-side, so the cost is round-trips, not work.
   *
   * The snapshot tiles are still a fixture — they need `/metrics` plus a per-metric history, which
   * is the next slice. Half a section on real data and half on fixtures is exactly what the banner
   * is for.
   */
  companyFinancials: async (symbol: string, _year: number, fiscalPeriod: string) => {
    const q = `period=${encodeURIComponent(fiscalPeriod)}&limit=4`;
    const enc = encodeURIComponent(symbol);
    const [income, balance, cash] = await Promise.all([
      getJson<CondensedResponse>(`/v1/companies/${enc}/statements/income/condensed?${q}`),
      getJson<CondensedResponse>(`/v1/companies/${enc}/statements/balance/condensed?${q}`),
      getJson<CondensedResponse>(`/v1/companies/${enc}/statements/cashflow/condensed?${q}`),
    ]);
    return {
      years: income.columns.map(columnLabel),
      statements: {
        income: toStatementRows(income, "income"),
        balance: toStatementRows(balance, "balance"),
        cash: toStatementRows(cash, "cash"),
      },
      snapshot: hub.hubSnapshot(symbol),
    } as CompanyFinancials;
  },

  /**
   * One metric's series. Parameterised by the reader's range/basis choice and fetched ON
   * INTERACTION, which is why it is not folded into `companyFinancials` -- doing so would refetch
   * six statements to change a chart's window. Phase A: `/metrics/{metric}/history`.
   *
   * `basis` maps to the as-filed vs as-restated distinction. We keep every restatement
   * (`accession` + `filed`, latest wins), so the DATA exists; no endpoint exposes the vintage yet.
   */
  companyMetricSeries: (symbol: string, id: string, range: "8q" | "20q" | "5y", basis: "filed" | "restated") =>
    resolve<CompanyMetricSeries>({
      series: hub.seriesFor(symbol, id, range, basis),
      defs: hub.metricDefs(symbol),
    }),

  /**
   * §02's footnote cards, §04's capital cards and §07's obligations.
   *
   * One group because they are ONE Phase B read: the grouped-concepts route over `raw_facts`.
   * V1 (2026-08-02) verified every candidate tag is already stored -- this is mapping work, not
   * ingest. Coverage varies hard by filer (ETR reconciliation 95.6%, goodwill-by-unit 3.7%), so
   * most of these cards are `N/A` for most companies and that is the honest answer.
   */
  companyFootnotes: (symbol: string, _year: number, _fiscalPeriod: string) =>
    resolve<CompanyFootnotes>({
      footnotes: hub.hubData(symbol).footnotes,
      capital: hub.hubData(symbol).capital,
      obligations: hub.hubData(symbol).obligations,
      covenant: hub.hubData(symbol).covenant,
    }),

  /**
   * §03 segments & geography, plus §02.7's ASC 606 split.
   *
   * Phase C: a widening of `ingest/dimensional_backfill.py` beyond geography-revenue. V5 verified
   * the axes exist in DERA `num.txt` -- under DERA's SHORT names (`BusinessSegments`, not
   * `StatementBusinessSegmentsAxis`). ANNUAL only: ASC 280 is a yearly footnote, so this takes a
   * fiscal year and not a quarter.
   */
  companySegments: (symbol: string, _fiscalYear: number) =>
    resolve<CompanySegments>({
      segments: hub.hubData(symbol).segments,
      segNote: hub.hubData(symbol).segNote,
      geoAssets: hub.hubData(symbol).geoAssets,
      custConc: hub.hubData(symbol).custConc,
    }),

  /** §05 governance & people. Phase A: `/insider-trades` + 8-K Item 5.02; the board/pay half is DEF 14A. */
  companyGovernance: (symbol: string) =>
    resolve<CompanyGovernance>({
      governance: hub.hubData(symbol).governance,
      insider: hub.hubInsider(symbol),
    }),

  /**
   * §06 audit quality and §08 disclosure change.
   *
   * Phase A splits three ways: 8-K item codes from `/filing-index` (auditor change, restatement,
   * late filings), the 10-K instance's `dei:AuditorName` and `cyd:` cybersecurity flags (V3), and
   * Track 2 for the rest (CAMs, ICFR conclusion, risk-factor diff, MD&A) -- which get honest empty
   * states, never a fabricated figure.
   */
  companyDisclosure: (symbol: string) =>
    resolve<CompanyDisclosure>({
      audit: hub.hubData(symbol).audit,
      narrative: hub.hubData(symbol).narrative,
      changes: hub.hubData(symbol).changes,
    }),

  /** The filing-timeline rail. Phase A: `/filing-index` -- ONE walk, several consumers. */
  companyFilingEvents: (symbol: string) =>
    resolve<CompanyFilingEvents>({ timeline: hub.hubData(symbol).timeline }),

  /**
   * §Insider activity. Phase A: `/companies/{symbol}/insider-trades`.
   *
   * ONE ledger feeds every panel — tiles, disposition split, code mix, per-person rollup and the
   * latency histogram all derive from the same rows. That is structural: the moment two panels
   * sample independently they can disagree. So it stays one seam call, not five.
   *
   * `rule_10b5_1` and `is_derivative` now ride on the real endpoint (V3-P5a). Note what it still
   * cannot say: the flag reports a trade was made UNDER a plan, never the plan's adoption date, so
   * no cooling-off window can be drawn from it (D-10b5-1).
   */
  companyInsiderActivity: (symbol: string, _windowDays: number) =>
    resolve<CompanyInsiderActivity>({
      ledger: insider.insiderData(symbol),
      form144: insider.f144Ledger(symbol),
    }),

  /**
   * §Peer-relative. Phase A: `/peers` + `/peers/{metric}/distribution` +
   * `/sectors/{group}/{metric}/companies`, all keyed on the filer's SIC group.
   *
   * `beyond` is the ragged half — acceptance lag and extension-tag share are `M`, auditor and CAM
   * counts need the 10-K instance parse (V3), and risk-factor counts are Track 2 and get an honest
   * empty state. Grouped here anyway because they share the peer set, not because they share a
   * source.
   */
  companyPeerRelative: (symbol: string, _year: number, _fiscalPeriod: string) =>
    resolve<CompanyPeerRelative>({
      rows: peers.distRows(symbol),
      extras: peers.peerExtras(symbol),
      flags: peers.companyFlags(symbol),
      recentFilings: peers.RECENT_FILINGS,
      themePercentiles: peers.CO_THEME_PCT,
      geographicMix: proto.GEO_MIX,
      // Peer-set size belongs with the peer payload — it is what "rank 4 of N" is counting.
      subCounts: proto.SUB_COUNTS,
      basePeerCount: proto.BASE_PEER_COUNT,
    }),

  // ========================================================== Manager altitude

  /**
   * One manager, everything about it. Phase A: `/managers/{cik}/holdings` + `/activity` +
   * `/periods`, plus `/beneficial-ownership` for the 5% stakes.
   *
   * The six views already shared one payload, which is right for the same reason the Insider
   * ledger is: a footprint and an activity chart drawn from independent reads can disagree about
   * the same quarter.
   *
   * **The period axes ride WITH the data.** They used to be module-level constants zipped against
   * series that lived in the payload (`MANAGER_QUARTERS[i]` against `d.posTrend[i]`), so a length
   * mismatch would have silently mislabelled a chart rather than failed. Phase A makes this
   * concrete: `/managers/{cik}/periods` is per-manager, so a shared constant would have been
   * wrong the moment two managers had different filed histories.
   *
   * `npxYears` is N-PX, which is NOT ingested — the voting view gets an honest empty state under
   * the D-voting ruling, never a fabricated series.
   */
  managerProfile: (cik: number | string) =>
    resolve<ManagerProfile>({
      ...mgr.managerData(cik),
      quarters: mgr.MANAGER_QUARTERS,
      npxYears: mgr.NPX_YEARS,
    }),

  /** The covered 13F filers. Phase A: whichever managers the holdings store has ingested. */
  managerRoster: () => resolve<ManagerRoster>({ roster: mgr.MANAGER_ROSTER }),

  // ========================================================== Sector altitude

  /**
   * The sector overview. Phase A: `/sectors/{group}` + `/sectors/theme-scores` +
   * `/sectors/{group}/spreads` + `/sectors/{group}/insider-flow` + `/sectors/{group}/geographic-mix`.
   *
   * One group because they share a peer set and a period, and because the page shows them
   * together — a scorecard whose insider strip came from a different quarter than its spreads
   * would be a page contradicting itself.
   *
   * NOTE what the real endpoints will and will not carry. `geographicMix` is ASC 280 (V5: the
   * `Geographical` axis, ~52% of annual filers), so it arrives with a coverage figure and a real
   * chance of being `N/A` for a sector. `insider` is OPEN-MARKET (P/S) only — grants and tax
   * withholding are excluded on purpose, because folding them in is the commonest way this data
   * is misread.
   */
  sectorOverview: (_sectorId: string, _sub: string | null, _fiscalPeriod: string) =>
    resolve<SectorOverview>({
      scores: proto.SECTOR_SCORES,
      shifts: proto.BIGGEST_SHIFTS,
      constituents: proto.CONSTITUENTS,
      events: proto.EVENTS,
      insider: proto.INSIDER,
      themeDrill: proto.THEME_DRILL,
      delta: proto.SEMI_DELTA,
      geographicMix: proto.GEO_MIX,
      subCounts: proto.SUB_COUNTS,
      basePeerCount: proto.BASE_PEER_COUNT,
      asOf: proto.AS_OF,
    }),

  /**
   * The qualitative altitude. **Track 2 — no endpoint will ever back most of this.**
   *
   * Risk themes, going-concern language, CAMs, Item 1C and human-capital figures are counted from
   * NARRATIVE text, which `CLAUDE.md` guardrail 1 puts out of scope. It goes through the seam
   * anyway so the boundary is drawn in one place: when Phase A wires the sector views, this
   * function is where the honest "not ingested" empty states live, rather than scattered through
   * a 389-line view.
   *
   * The parts that ARE Track 1 and could be filled: auditor changes and late filings (8-K item
   * codes and NT forms via `/filing-index`), and the cybersecurity flags (V3 found `cyd:` booleans
   * in the 10-K instance). Everything else stays an empty state.
   */
  sectorQualitative: (_sectorId: string, _fiscalPeriod: string) =>
    resolve<SectorQualitative>({
      themes: qual.QUAL_THEMES,
      themeLang: qual.THEME_LANG,
      emerging: qual.EMERGING,
      goingConcern: qual.GOING_CONCERN,
      litigation: qual.LITIGATION,
      litigationTotal: qual.LITIGATION_TOTAL,
      signalMatrix: qual.SIGNAL_MATRIX,
      cyber: qual.CYBER,
      cams: qual.CAMS,
      auditors: qual.AUDITORS,
      auditorChanges: qual.AUDITOR_CHANGES,
      auditorTenure: qual.AUDITOR_TENURE,
      rfVolume: qual.RF_VOLUME,
      nonGaap: qual.NON_GAAP,
      deficient: qual.DEFICIENT,
      hcClimate: qual.HC_CLIMATE,
      /*
       * Parameterised, so it rides the payload as a function rather than a value: the view asks
       * for a theme's filers on demand, when a reveal is opened. Phase A turns this into its own
       * call (`/sectors/{group}/{metric}/companies` is the nearest real shape), which is exactly
       * why it must not be imported from `qualitative.ts` directly — the view would then have two
       * sources for one page.
       */
      pickFilers: qual.pickFilers,
    }),

  /**
   * One risk theme's filings. Phase A: `/filing-index` for the metadata — form, date, accession.
   *
   * The PASSAGE is Track 2 and stays one: a filing's text is not something we parse. What this can
   * honestly become is the filing list with a link out, which is the hub's argument applied here —
   * hand over the document rather than ask to be believed about it.
   */
  sectorFilings: (_sectorId: string, themeId: string, peerCount: number) =>
    resolve<SectorFilings>({ filings: qual.themeFilings(themeId, peerCount) }),

  // ========================================================== Company Hub → Institutional
  // These map onto endpoints that ALREADY SHIP (V3-P5a, operator-accepted 2026-08-01), so the
  // boundaries are the ones the backend already drew.

  /** §01 register snapshot. Phase A: `-periods`, `-filed-since`, `-share-attribution`, `filing-index`. */
  instRegisterSnapshot: (symbol: string, _quarterEnd: string) =>
    resolve<InstRegisterSnapshot>({
      freshness: hub.instFreshness(symbol),
      snapshot: hub.instSnapshot(symbol),
      extras: hub.instRegisterExtras(symbol),
    }),

  /** §02 over time & holders. Phase A: `-holdings-series`, `-holders`, `-register`. Takes a COUNT. */
  instRegisterSeries: (symbol: string, _quarters: number) =>
    resolve<InstRegisterSeries>({ register: hub.instRegister(symbol) }),

  /** §03 flows & concentration. Phase A: `-activity`, `-activity-series`, `-conviction`. */
  instFlows: (symbol: string, _quarterEnd: string) =>
    resolve<InstFlows>({ flows: hub.instFlows(symbol) }),

  /** §05 register behaviour. Phase A: `-register-shape` (turnover + tenure + stable capital). */
  instBehaviour: (symbol: string, _quarters: number) =>
    resolve<InstBehaviour>({ behavior: hub.instBehavior(symbol) }),

  /**
   * §04 stewardship. Phase A: `/beneficial-ownership`. The VOTING half needs N-PX, which is not
   * ingested -- it gets an honest "not ingested yet" empty state (D-voting, widened 2026-08-01),
   * never "cannot be reported" and never a fabricated figure.
   */
  instStewardship: (symbol: string, _quarterEnd: string) =>
    resolve<InstStewardship>({ steward: hub.instSteward(symbol) }),

  /** §06 register limits & supply. Phase A: `/filing-index` supply events + acceptance lag. */
  instLimits: (symbol: string) =>
    resolve<InstLimits>({ limits: hub.instLimits(symbol) }),
};

// ============================================================ payload shapes
// Named so views type against the SEAM rather than against `hub.ts` -- that is what makes the
// Phase A swap invisible to them.

export interface CompanyIdentity {
  /** `reason` is present only where a row is unsourceable for a NAMED reason, not merely absent. */
  profile: { k: string; v: string; reason?: string }[];
  links: ReturnType<typeof hub.hubLinks>;
  segmentChips: ReturnType<typeof hub.hubSegmentChips>;
  contextPill: string;
  bizText: string;
  /** `subCount`/`offshore` are null when unknown — never 0, which would read as "none". */
  structure: Omit<hub.HubData["structure"], "subCount" | "offshore"> & {
    subCount: number | null;
    offshore: string | null;
  };
}

export interface CompanyFinancials {
  years: string[];
  /** `reason` is set on a row we cannot source — never on one that is merely absent this period. */
  statements: Record<"income" | "balance" | "cash", {
    label: string; strongRule: boolean; bold: boolean; derived: boolean;
    reason?: string; vals: string[];
  }[]>;
  snapshot: hub.SnapshotTile[];
}

export interface CompanyMetricSeries {
  series: hub.SeriesResult | null;
  defs: hub.MetricDef[];
}

export interface CompanyFootnotes {
  footnotes: hub.HubData["footnotes"];
  capital: hub.HubData["capital"];
  obligations: hub.HubData["obligations"];
  covenant: string;
}

export interface CompanySegments {
  segments: hub.HubData["segments"];
  segNote: string;
  geoAssets: hub.HubData["geoAssets"];
  custConc: hub.HubData["custConc"];
}

export interface CompanyGovernance {
  governance: hub.HubData["governance"];
  insider: hub.HubInsider;
}

export interface CompanyDisclosure {
  audit: hub.HubData["audit"];
  narrative: hub.HubData["narrative"];
  changes: hub.HubData["changes"];
}

export interface CompanyFilingEvents {
  timeline: hub.HubData["timeline"];
}

export type ManagerProfile = mgr.ManagerData & {
  quarters: typeof mgr.MANAGER_QUARTERS;
  npxYears: typeof mgr.NPX_YEARS;
};

export interface ManagerRoster {
  roster: typeof mgr.MANAGER_ROSTER;
}

export interface SectorOverview {
  scores: typeof proto.SECTOR_SCORES;
  shifts: typeof proto.BIGGEST_SHIFTS;
  constituents: typeof proto.CONSTITUENTS;
  events: typeof proto.EVENTS;
  insider: typeof proto.INSIDER;
  themeDrill: typeof proto.THEME_DRILL;
  delta: typeof proto.SEMI_DELTA;
  geographicMix: typeof proto.GEO_MIX;
  subCounts: typeof proto.SUB_COUNTS;
  basePeerCount: number;
  asOf: typeof proto.AS_OF;
}

export interface SectorQualitative {
  themes: typeof qual.QUAL_THEMES;
  themeLang: typeof qual.THEME_LANG;
  emerging: typeof qual.EMERGING;
  goingConcern: typeof qual.GOING_CONCERN;
  litigation: typeof qual.LITIGATION;
  litigationTotal: typeof qual.LITIGATION_TOTAL;
  signalMatrix: typeof qual.SIGNAL_MATRIX;
  cyber: typeof qual.CYBER;
  cams: typeof qual.CAMS;
  auditors: typeof qual.AUDITORS;
  auditorChanges: typeof qual.AUDITOR_CHANGES;
  auditorTenure: typeof qual.AUDITOR_TENURE;
  rfVolume: typeof qual.RF_VOLUME;
  nonGaap: typeof qual.NON_GAAP;
  deficient: typeof qual.DEFICIENT;
  hcClimate: typeof qual.HC_CLIMATE;
  pickFilers: typeof qual.pickFilers;
}

export interface SectorFilings {
  filings: ReturnType<typeof qual.themeFilings>;
}

export interface CompanyInsiderActivity {
  ledger: ReturnType<typeof insider.insiderData>;
  form144: ReturnType<typeof insider.f144Ledger>;
}

export interface CompanyPeerRelative {
  rows: ReturnType<typeof peers.distRows>;
  extras: ReturnType<typeof peers.peerExtras>;
  flags: ReturnType<typeof peers.companyFlags>;
  recentFilings: typeof peers.RECENT_FILINGS;
  themePercentiles: typeof peers.CO_THEME_PCT;
  geographicMix: typeof proto.GEO_MIX;
  subCounts: typeof proto.SUB_COUNTS;
  basePeerCount: number;
}

export interface InstRegisterSnapshot {
  freshness: hub.InstFreshness;
  snapshot: hub.InstSnapshot;
  extras: hub.InstRegisterExtras;
}

export interface InstRegisterSeries {
  register: hub.InstRegister;
}

export interface InstFlows {
  flows: hub.InstFlows;
}

export interface InstBehaviour {
  behavior: hub.InstBehavior;
}

export interface InstStewardship {
  steward: hub.InstSteward;
}

export interface InstLimits {
  limits: hub.InstLimits;
}
