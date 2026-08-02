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
  companyIdentity: (symbol: string, subIdx: number) =>
    resolve<CompanyIdentity>({
      profile: hub.hubProfile(symbol),
      links: hub.hubLinks(symbol),
      segmentChips: hub.hubSegmentChips(symbol),
      // The sub-industry filer count is a FIGURE (`/sectors` owns it in Phase A), so it is
      // resolved here rather than looked up in the view and passed back in.
      contextPill: hub.hubContextPill(subIdx >= 0, proto.SUB_COUNTS[subIdx] ?? 0),
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
