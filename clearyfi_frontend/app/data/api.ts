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

/** Every payload says where it came from. Today: nowhere real. */
export const PROVENANCE = {
  synthetic: true,
  note: "Deterministic-synthetic figures. No SEC endpoint is being called.",
} as const;

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
  companyIdentity: (symbol: string, subActive: boolean, subCount: number) =>
    resolve<CompanyIdentity>({
      profile: hub.hubProfile(symbol),
      links: hub.hubLinks(symbol),
      segmentChips: hub.hubSegmentChips(symbol),
      contextPill: hub.hubContextPill(subActive, subCount),
      bizText: hub.HUB_BIZ_TEXT,
      structure: hub.hubData(symbol).structure,
    }),

  /**
   * §02.1 condensed statements + §02.6 snapshot tiles.
   *
   * One group because ONE facts read serves both: Phase A is
   * `/statements/{income|balance|cashflow}/condensed` x3 + `/metrics`, all off the same cached
   * RawFacts. `year` is separate because `/metrics` and `/statements` both require it -- a
   * `FiscalPeriod` is a period TYPE ("FY", "Q3") and carries no year of its own.
   */
  companyFinancials: (symbol: string, _year: number, _fiscalPeriod: string) =>
    resolve<CompanyFinancials>({
      years: hub.hubData(symbol).years,
      statements: hub.hubData(symbol).statements,
      snapshot: hub.hubSnapshot(symbol),
    }),

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
  profile: ReturnType<typeof hub.hubProfile>;
  links: ReturnType<typeof hub.hubLinks>;
  segmentChips: ReturnType<typeof hub.hubSegmentChips>;
  contextPill: string;
  bizText: string;
  structure: hub.HubData["structure"];
}

export interface CompanyFinancials {
  years: hub.HubData["years"];
  statements: hub.HubData["statements"];
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
