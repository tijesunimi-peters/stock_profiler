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
import * as peers from "./peers";
import * as proto from "./prototype";
import * as qual from "./qualitative";
import * as mgr from "./manager";
import { humanDate, plural, usdCompact } from "../lib/format";

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
  /**
   * Surfaces that are PARTLY plumbed, and which of their sections are still synthetic.
   *
   * The banner used to say "no figure on this page comes from an SEC filing" — true when every
   * surface was a fixture, and false the moment §01 landed. A mixture is the most dangerous state
   * this page can be in: the sections look identical, so a reader has no way to tell Apple's
   * numbers from ones generated out of a hash of "AAPL". The banner now names the split, and
   * `HubHead`'s `synthetic` prop marks the sections themselves.
   */
  partialSurfaces: {
    "company overview": {
      real: [
        "01 identity & structure",
        "02 financial detail",
        "03 segments & geography",
        "05 governance & people",
        "06 audit & controls",
        "08 filing activity & disclosure events",
      ],
      synthetic: [
        "04 capital structure (partly — share counts and repurchases are real)",
        "07 obligations (partly \u2014 commitments, restructuring and guarantees are real)",
      ],
    },
  } as Record<string, { real: string[]; synthetic: string[] }>,
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

/** One row from `/v1/companies/suggest` — the shape the topbar typeahead renders. */
export interface CompanySuggestion {
  ticker: string;
  cik: number;
  name?: string | null;
}

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
 *
 * The auditor row used to be a third: "tagged, but only inside the 10-K's inline-XBRL instance,
 * which we do not fetch." We fetch it now (§06), so the row carries the firm name.
 *
 * `null` from the API is a further case again — EDGAR holds the field but did not state it for
 * this filer — and reads as a plain N/A rather than one of the explanations above.
 */
const NOT_SOURCED = {
  naics: "The SEC assigns SIC, not NAICS — there is no NAICS in the filing record.",
  employees: "A tagged fact almost no filer reports; nothing to show for this one.",
  auditor: "Not tagged in this filer's latest annual report.",
} as const;

function profileRows(
  p: ProfileResponse,
  audit?: AuditResponse | null,
): { k: string; v: string; reason?: string }[] {
  const auditor = audit?.auditor?.status === "ok" ? (audit.auditor.name ?? null) : null;
  const na = (v: string | null | undefined) => (v && v.trim() ? v : "N/A");
  const hq = [p.hq_city, p.hq_state].filter(Boolean).join(", ");
  return [
    { k: "CIK", v: String(p.cik).padStart(10, "0") },
    { k: "SIC", v: p.sic ? `${p.sic}${p.sic_description ? ` · ${p.sic_description}` : ""}` : "N/A" },
    { k: "NAICS", v: "N/A", reason: NOT_SOURCED.naics },
    { k: "State of incorp.", v: na(p.state_of_incorporation) },
    { k: "Headquarters", v: na(hq) },
    { k: "Fiscal year-end", v: na(formatFiscalYearEnd(p.fiscal_year_end)) },
    {
      k: "Independent auditor",
      v: auditor ?? "N/A",
      ...(auditor ? {} : { reason: audit?.auditor?.reason ?? NOT_SOURCED.auditor }),
    },
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




/**
 * The subsidiary panel's shape, from the EX-21 read.
 *
 * `subCount` stays NULL unless we actually have a list. Zero would read as "this registrant has no
 * subsidiaries", which is a claim about the company; not knowing is a claim about us.
 *
 * The "organized outside the U.S." share is counted only from jurisdictions we actually read. It
 * is the one figure here derived rather than reported, and it is a count over rows on the page —
 * a reader can check it against the table beneath it, which is the difference between arithmetic
 * and assertion.
 */
function subsidiaryStructure(res: SubsidiariesResponse | null) {
  const NOTE_TAIL =
    " EX-21 lists consolidated subsidiaries as of that filing and may omit ones the registrant " +
    "deems immaterial — a floor, not a census.";

  if (!res || res.status !== "ok" || !res.subsidiaries.length) {
    return {
      subCount: null,
      offshore: null,
      subs: [],
      /*
       * The API's OWN reason, carried to the empty state rather than restated in the view.
       *
       * The card used to hard-code "we ingest structured data rather than parsing documents",
       * which stopped being true the day EX-21 parsing landed — so a filer we simply had not
       * indexed yet was told a reason that described an old policy instead of its actual gap.
       * A hard-coded explanation cannot go stale if there isn't one.
       */
      subReason:
        res?.reason ?? "The subsidiary exhibit could not be read for this filer.",
      note:
        (res?.reason ??
          "The subsidiary exhibit could not be read for this filer.") + NOTE_TAIL,
    };
  }
  const isUS = (j: string | null) => !!j && /\bU\.?S\.?\b|United States/i.test(j);
  const outside = res.subsidiaries.filter((x) => x.jurisdiction && !isUS(x.jurisdiction)).length;
  return {
    subCount: res.subsidiaries.length,
    offshore: `${Math.round((outside / res.subsidiaries.length) * 100)}%`,
    subReason: null as string | null,
    /*
     * When the filer published NO ownership column, the cells are left blank and the panel note
     * says so once. Nineteen identical "N/A" chips down a column is one fact stated nineteen
     * times, and the repetition reads as nineteen separate gaps in our data rather than one
     * absence in the filing. Per-row N/A is kept for the case it means something: a filer who
     * publishes ownership for some entities and not others.
     */
    subs: res.subsidiaries.map((x) => ({
      name: x.name,
      jur: x.jurisdiction ?? "N/A",
      own: res.has_ownership ? (x.ownership ?? "N/A") : "",
    })),
    note:
      (res.has_ownership ? "" : "This filer publishes no ownership column in EX-21 — a blank is not 100%. ") +
      (res.cannot ?? "") +
      (res.filing ? ` From the ${res.filing.form} filed ${res.filing.filed}.` : ""),
  };
}


/* ------------------------------------------------------------ §02 footnote cards */

interface FootnotesResponse {
  /** The period the route RESOLVED — not necessarily the one the page is showing. */
  fiscal_year: number;
  groups: {
    group: string;
    label: string;
    status: string;
    reason: string | null;
    coverage: number;
    lines: { canonical_concept: string; label: string; value: number; unit: string }[];
    /** Why this group is thin or empty, when "the filer chose not to disclose" would mislead. */
    note?: string | null;
    form?: string | null;
    filed?: string | null;
  }[];
}

/** A group's concept values, keyed by concept. Empty when the filer did not disclose the group. */
function groupValues(res: FootnotesResponse, key: string) {
  const g = res.groups.find((x) => x.group === key);
  const by = new Map((g?.lines ?? []).map((l) => [l.canonical_concept, l]));
  return {
    ok: g?.status === "ok",
    /** Why the card is empty, in the filer's terms — with how many filers publish it at all. */
    reason: g?.reason ?? null,
    coverage: g?.coverage ?? 0,
    num: (c: string) => by.get(c)?.value ?? null,
    /**
     * A ratio arrives as 0.21; the cards show percentage points.
     *
     * `?? null` rather than a check for `undefined`: a line CAN carry a null value, and
     * `null * 100` is `0` in JavaScript. That is the one failure this product cannot ship — a
     * value nobody reported rendering as a hard zero a reader would take for a disclosure.
     */
    pct: (c: string) => {
      const v = by.get(c)?.value ?? null;
      return v === null ? null : v * 100;
    },
    money: (c: string) => {
      const v = by.get(c)?.value ?? null;
      return v === null ? "N/A" : usdCompact(v);
    },
  };
}

/**
 * Bar width for a value against the largest in its set. Presentation, not a figure.
 *
 * The 2% floor keeps a small-but-real value visible. **A reported zero is excluded from it** —
 * AMD tags "due after five years" as exactly 0, and a visible bar beside a `$0` draws something
 * where the filer reported nothing. The floor exists so tiny values are not invisible, not so
 * that zero looks like a quantity.
 */
const barWidth = (v: number | null, max: number) =>
  v === null || !max || v === 0 ? "0%" : `${Math.max(2, Math.round((Math.abs(v) / max) * 100))}%`;

/**
 * The footnote cards, from the eight groups `/footnotes` serves.
 *
 * Several fields the design asks for have no concept behind them and stay N/A. They are NOT the
 * same kind of gap, so they do not share a reason:
 *
 *   * **Revenue disaggregation, stock comp by line item, goodwill by reporting unit** need
 *     DIMENSIONAL facts (ASC 280 / by-line axes). Phase C ingests those; today the honest state is
 *     an empty card, not a plausible split.
 *   * **The weighted-average lease TERM** is an ISO-8601 duration and companyfacts carries no
 *     duration-typed facts at all — a property of the source, not of our mapping.
 *   * **Covenants, and the deferred-revenue roll-forward's opening/billed legs**, are prose or
 *     unreported movements. A roll-forward we cannot close is shown as the two ends we have,
 *     never as a balanced four-box that implies arithmetic nobody filed.
 */
function toFootnoteCards(res: FootnotesResponse) {
  const rpo = groupValues(res, "revenue_obligations");
  const inv = groupValues(res, "inventory");
  const debt = groupValues(res, "debt_maturities");
  const tax = groupValues(res, "tax_reconciliation");
  const defrev = groupValues(res, "deferred_revenue");
  const credit = groupValues(res, "credit_losses");
  const leases = groupValues(res, "leases");
  const rd = groupValues(res, "capitalized_rd");

  const ladder = [
    ["Year 1", "debt_maturity_y1"], ["Year 2", "debt_maturity_y2"], ["Year 3", "debt_maturity_y3"],
    ["Year 4", "debt_maturity_y4"], ["Year 5", "debt_maturity_y5"], ["Thereafter", "debt_maturity_thereafter"],
  ] as const;
  const ladderMax = Math.max(0, ...ladder.map(([, c]) => Math.abs(debt.num(c) ?? 0)));

  const invRows = [
    ["Raw materials", "inventory_raw_materials"], ["Work in process", "inventory_work_in_process"],
    ["Finished goods", "inventory_finished_goods"],
  ] as const;

  const taxRows = [
    ["U.S. federal statutory rate", "etr_statutory_rate"],
    ["State & local income taxes", "etr_state_local"],
    ["Foreign rate differential", "etr_foreign_differential"],
    ["Valuation allowance change", "etr_valuation_allowance_change"],
    ["Tax credits", "etr_tax_credits"],
    ["Other adjustments", "etr_other"],
  ] as const;

  const pctPts = (v: number | null) => (v === null ? "N/A" : `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)} pts`);

  return {
    rpo: {
      tot: rpo.money("rpo_total"),
      within12: rpo.num("rpo_pct_next_12m") === null ? "N/A" : `${(rpo.pct("rpo_pct_next_12m") ?? 0).toFixed(0)}%`,
      reason: rpo.ok ? null : rpo.reason,
    },
    // Dimensional (ASC 606 product/service axis) — Phase C.
    disagg: [] as { label: string; amt: string; pct: string; w: string }[],
    inv: invRows
      .filter(([, c]) => inv.num(c) !== null)
      .map(([label, c]) => ({ label, amt: inv.money(c), yoy: "N/A" })),
    invReason: inv.ok ? null : inv.reason,
    debtLadder: debt.ok
      ? ladder.map(([y, c]) => ({ y, amt: debt.money(c), w: barWidth(debt.num(c), ladderMax), rate: "N/A" }))
      : [],
    debtReason: debt.ok ? null : debt.reason,
    tax: {
      rows: taxRows.filter(([, c]) => tax.num(c) !== null).map(([k, c]) => ({ k, v: pctPts(tax.pct(c)) })),
      eff: tax.num("etr_effective_rate") === null ? "N/A" : `${(tax.pct("etr_effective_rate") ?? 0).toFixed(1)}%`,
      va: tax.money("valuation_allowance"),
      utb: tax.money("unrecognized_tax_benefits"),
      reason: tax.ok ? null : tax.reason,
    },
    gwUnits: [] as { name: string; gw: string; head: string }[],
    sbc: { tot: "N/A", lines: [] as { label: string; amt: string; w: string }[] },
    leases: {
      tot: leases.money("operating_lease_liabilities"),
      wa: "N/A",
      disc: leases.num("operating_lease_discount_rate") === null
        ? "N/A"
        : `${(leases.pct("operating_lease_discount_rate") ?? 0).toFixed(1)}%`,
      reason: leases.ok ? null : leases.reason,
    },
    capR: { cap: rd.money("capitalized_software"), exp: rd.money("research_and_development") },
    allow: {
      open: "N/A",
      prov: credit.money("allowance_provision"),
      wo: credit.money("allowance_writeoffs"),
      close: credit.money("allowance_credit_losses"),
      reason: credit.ok ? null : credit.reason,
    },
    defrev: {
      open: "N/A",
      billed: "N/A",
      rec: defrev.money("deferred_revenue_recognized"),
      close: defrev.money("deferred_revenue_balance"),
      reason: defrev.ok ? null : defrev.reason,
    },
  };
}

/* ------------------------------------------------------------ §05.3 pay versus performance */

interface PvpResponse {
  status: string;
  reason: string | null;
  company_measure_name: string | null;
  governance: {
    insider_trading_policy_adopted: boolean | null;
    award_timing_considers_mnpi: boolean | null;
    award_timing_predetermined: boolean | null;
  };
  years: {
    period_end: string | null;
    peo_total: number | null;
    peo_actually_paid: number | null;
    tsr: number | null;
    peer_tsr: number | null;
  }[];
  filing?: { form: string; filed: string; accession: string } | null;
}

/**
 * §05.3, re-pointed from pay MIX to pay VERSUS PERFORMANCE (operator ruling 2026-08-03).
 *
 * The card's layout is untouched — it was a labelled bar list and it stays one. Its subject
 * changes, because the summary compensation table's mix is tagged in no structured source and
 * the SEC deliberately made this disclosure machine-readable instead.
 *
 * **The bars are scaled against COMPENSATION ACTUALLY PAID, including negatives.** NVIDIA's
 * FY2023 is −$4.1M: unvested equity fell, so the mark-to-market went below zero. A bar chart that
 * clamps at zero would render that year as "nothing" when the filing says something much more
 * interesting. The width uses absolute value and the sign stays in the number.
 */
function toPayVersusPerformance(res: PvpResponse | null) {
  if (!res || res.status !== "ok" || !res.years.length) {
    return {
      rows: [] as { k: string; pct: string; w: string; negative: boolean }[],
      reason:
        res?.reason ??
        "This filer's proxy carries no tagged pay-versus-performance table.",
      measure: null as string | null,
      latestTotal: "N/A",
      tsr: "N/A",
      peerTsr: "N/A",
    };
  }
  const years = res.years;
  const max = Math.max(...years.map((y) => Math.abs(y.peo_actually_paid ?? 0)), 1);
  const latest = years[years.length - 1];
  return {
    rows: years.map((y) => ({
      k: y.period_end ? `FY${y.period_end.slice(0, 4)}` : "—",
      pct: y.peo_actually_paid === null ? "N/A" : usdCompact(y.peo_actually_paid),
      // A year the proxy did not tag gets NO bar. The 2% floor exists so a small value stays
      // visible, not so an absent one looks like a quantity — same rule as `barWidth`.
      w:
        y.peo_actually_paid === null
          ? "0%"
          : `${Math.max(2, Math.round((Math.abs(y.peo_actually_paid) / max) * 100))}%`,
      negative: (y.peo_actually_paid ?? 0) < 0,
    })),
    reason: null as string | null,
    measure: res.company_measure_name,
    latestTotal: latest.peo_total === null ? "N/A" : usdCompact(latest.peo_total),
    // TSR is the indexed value of $100 invested — never rendered with a % sign.
    tsr: latest.tsr === null ? "N/A" : `$${latest.tsr.toFixed(2)}`,
    peerTsr: latest.peer_tsr === null ? "N/A" : `$${latest.peer_tsr.toFixed(2)}`,
  };
}

/* ------------------------------------------------------------ §04 blockholders & class structure */

interface BlockholdersResponse {
  cik: number;
  current: {
    status: string;
    reason: string | null;
    filings_read: number;
    holders: {
      owner: string; form: string | null; percent_of_class: number | null; shares: number | null;
      filed: string | null; reporting_person_type: string | null;
      reporting_person_type_label?: string | null;
    }[];
    exited: { owner: string; filed: string | null; percent_of_class: number | null }[];
  };
  /** The raw filings behind `current` — the §04 strip needs the history, not just the latest. */
  beneficial_ownership?: {
    owner_name: string | null; form_type: string | null; percent_of_class: number | null;
    shares_beneficially_owned: number | null; filed: string | null; event_date: string | null;
    accession: string | null; reporting_person_type_label?: string | null;
  }[];
}

interface ShareClassesResponse {
  cik: number;
  status: string;
  reason: string | null;
  fiscal_year: number | null;
  classes: {
    member: string; label: string; shares_outstanding: number | null; shares_issued: number | null;
    shares_authorized: number | null; par_value: number | null; outstanding_share: number | null;
  }[];
}

/**
 * §04.7 — the 5%+ holders who have actually filed a Schedule 13D or 13G.
 *
 * The endpoint returns a filing HISTORY; `current` collapses it to one row per owner, because a
 * 13D/G amendment supersedes its predecessor. Two things the card must keep saying:
 *
 * **A 0% amendment is an exit, not a holder owning nothing.** Rule 13d-2 requires a filing when a
 * holder drops through 5%, so it is the filer saying "we are out" — real information, but it
 * belongs beside the list rather than in it.
 *
 * **A short list is normal.** Only holders crossing 5% file at all, and passive institutions file
 * annually on a 45-day lag. This is not an institutional-ownership ranking and must not read as one.
 */
function toBlockholders(res: BlockholdersResponse | null) {
  const c = res?.current;
  const holders = (c?.holders ?? []).map((h) => ({
    name: h.owner,
    pct: h.percent_of_class === null ? "N/A" : `${h.percent_of_class.toFixed(2)}%`,
    form: (h.form ?? "").replace("SCHEDULE ", ""),
    filed: h.filed ? humanDate(h.filed) : "",
  }));
  // The residual stake matters: "dropped to 0.83%" and "exited entirely" are different events,
  // and the filing distinguishes them.
  const exited = (c?.exited ?? []).map((e) => {
    const to = e.percent_of_class === null ? "" : e.percent_of_class === 0 ? " to nil" : ` to ${e.percent_of_class.toFixed(2)}%`;
    return `${e.owner}${to} (${e.filed ? humanDate(e.filed) : "date N/A"})`;
  });

  return {
    ok: c?.status === "ok" && holders.length > 0,
    holders,
    reason: c?.reason ?? "Schedule 13D/G filings could not be read for this company just now.",
    exitNote: exited.length
      ? `${plural(exited.length, "filer")} reported dropping below the 5% threshold: ${exited.join("; ")}.`
      : "",
    note:
      `From ${plural(c?.filings_read ?? 0, "Schedule 13D/G filing")} on file. Only a holder ` +
      "crossing 5% files at all, and passive institutions file annually on a ~45-day lag — so " +
      "this is who has reported a stake, not a ranking of institutional ownership.",
  };
}

/**
 * §04.5 — share classes, from the ASC `ClassOfStock` axis.
 *
 * **Votes per share is absent and always will be**, and on this card that omission is the point.
 * Alphabet's Class B is 6.9% of shares at ten votes each, so the founders control the company on a
 * small minority of the stock. Share counts alone cannot describe control, and the card says so
 * rather than letting the percentages imply it.
 */
function toShareClasses(res: ShareClassesResponse | null) {
  const shares = (v: number | null) =>
    v === null ? "N/A" : v >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : `${(v / 1e6).toFixed(0)}M`;
  return {
    ok: res?.status === "ok" && (res?.classes?.length ?? 0) > 0,
    fiscalYear: res?.fiscal_year ? `FY${res.fiscal_year}` : null,
    classes: (res?.classes ?? []).map((c) => ({
      label: c.label,
      outstanding: shares(c.shares_outstanding),
      authorized: shares(c.shares_authorized),
      share: c.outstanding_share === null ? "N/A" : `${(c.outstanding_share * 100).toFixed(1)}%`,
    })),
    reason: res?.reason ?? "Share-class data could not be read for this company just now.",
    note:
      "Percentages are of shares OUTSTANDING, not of votes. How many votes a class carries is in " +
      "the certificate of incorporation — prose, tagged in no SEC source — so these counts cannot " +
      "describe control. Authorised shares are issuance headroom, not shares in issue.",
  };
}

/* ------------------------------------------------------------ §03 segments & geography */

interface SegmentsResponse {
  cik: number;
  status: string;
  reason: string | null;
  fiscal_year: number | null;
  revenue_tag: string | null;
  segments: {
    member: string; label: string; revenue: number | null; operating_income: number | null;
    assets: number | null; margin: number | null; revenue_share: number | null;
  }[];
  geography: {
    member: string; label: string; revenue: number | null;
    long_lived_assets: number | null; revenue_share: number | null;
  }[];
}

interface SectorCompanyValuesResponse {
  group: string;
  metric: string;
  label: string;
  unit: string;
  higher_is_better: boolean | null;
  fiscal_year: number | null;
  companies: { cik: number; name: string | null; value: number; percentile: number | null }[];
}

/** How many metric rows the distribution table draws. Two reads per row, so this is a real
 *  request budget, not a layout preference — and what it drops is named on screen. */
const PX_METRIC_ROWS = 8;

export function fmtMetric(v: number, unit: string): string {
  if (unit === "ratio") return v.toFixed(2);
  if (unit === "percent") return `${v.toFixed(1)}%`;
  if (unit === "days") return `${Math.round(v)}d`;
  if (unit === "times") return `${v.toFixed(2)}x`;
  return usdCompact(v);
}

/**
 * §Peer-relative's "Peer distribution" table — the panel the whole view is built around.
 *
 * One row per metric, each showing this filer's value, its position in the SIC group, and the
 * group's spread. Every part of that was invented: `distRows` built a 12-company `PEERS` table
 * from a ticker seed and drew the dots from it.
 *
 * **Row selection is DATA-DRIVEN, not a fixed list.** The rows are the constituents of the
 * scored themes, in theme order, so this table and the rail beside it are the same metrics —
 * a reader comparing "Profitability P93" against the rows underneath sees what built it.
 *
 * **The percentile is ORIENTED, and this is the same trap as the rail.** The endpoint returns a
 * POSITION (`percent_rank` of the value) plus `higher_is_better`. For a lower-is-better metric
 * the favourable end is the LOW one, so the displayed percentile is `100 - p`, and the row is
 * tagged "lower is better" so the dot cloud is not misread. Showing the raw position beside a
 * metric like debt-to-equity would rank the most levered filer as the best.
 *
 * **The dots are the peer group as filed.** `/sectors/{group}/{metric}/companies` returns every
 * company with a comparable value and excludes N/A ones rather than plotting them at zero, so
 * the cloud's size is the comparable population, not the group's membership.
 */
function toDistributionRows(
  focalCik: number | null,
  rows: {
    metric: string;
    values: SectorCompanyValuesResponse | null;
    dist: PeerDistributionResponse | null;
  }[],
  droppedCount: number,
) {
  const out = rows.flatMap((r) => {
    const v = r.values;
    const d = r.dist?.distribution ?? null;
    if (!v || !d) return [];
    const focal = v.companies.find((c) => c.cik === focalCik);
    if (!focal) return [];

    const hib = v.higher_is_better !== false;
    const oriented =
      focal.percentile === null ? null : hib ? focal.percentile : 100 - focal.percentile;

    return [{
      key: r.metric,
      name: v.label,
      unit: v.unit,
      lowerIsBetter: !hib,
      focalVal: focal.value,
      valueLabel:
        `${fmtMetric(focal.value, v.unit)}` +
        (oriented === null ? " · rank N/A" : ` · P${Math.round(oriented)}`),
      // Every dot is a real filer; the label is its name because the endpoint has no ticker.
      peers: v.companies
        .filter((c) => c.cik !== focalCik)
        .map((c) => ({ id: String(c.cik), label: c.name ?? `CIK ${c.cik}`, value: c.value })),
      quantiles: { lo: d.min, hi: d.max, q1: d.p25, med: d.median, q3: d.p75 },
      peerCount: d.peer_count,
    }];
  });

  return {
    rows: out,
    note:
      `Each dot is one filer's own reported value; companies with no comparable value are ` +
      `excluded rather than plotted at zero. A percentile is a POSITION in the group — where a ` +
      `lower value is more favourable the row says so and the percentile is inverted to match.` +
      (droppedCount
        ? ` ${plural(droppedCount, "further metric")} ranked for this filer ${droppedCount === 1 ? "is" : "are"} not listed.`
        : ""),
  };
}

interface PeerDistributionResponse {
  distribution: {
    metric: string; label: string; unit: string; peer_group: string; peer_count: number;
    min: number; p25: number; median: number; p75: number; max: number;
    company_value: number | null;
  } | null;
}

interface ThemePercentilesResponse {
  cik: number;
  status: string;
  reason: string | null;
  peer_group: string | null;
  peer_count_min: number | null;
  peer_count_max: number | null;
  metrics_ranked: number;
  themes: {
    key: string; label: string; scored: boolean; percentile: number | null;
    covered: number; total: number; reason: string | null;
    components: { metric: string; percentile: number }[];
  }[];
}

/**
 * §Peer-relative's "Percentile vs peers" rail.
 *
 * **All seven themes were fabricated**, including the two this project has ruled unscorable:
 * `CO_THEME_PCT` was a literal `{prof: 88, growth: 76, health: 64, cash: 91, eff: 58, acct: 82,
 * struct: 70}`, identical for every company on the site.
 *
 * The five scorable ones now come from `metric_ranks` via `/theme-percentiles`, oriented by
 * favorability server-side. Accounting quality and Structure & activity come back `scored:
 * false` with the reason `normalize/themes.DEFERRED_THEMES` records, and are RENDERED as
 * unscored rather than dropped — a reader should see that they were asked and could not be
 * answered, which is different from a rail that quietly lists five themes.
 *
 * Coverage rides along: a theme scored on 2 of 6 constituents says so, because a percentile
 * built from two metrics and one built from six are not the same claim.
 */
function toThemePercentiles(res: ThemePercentilesResponse | null) {
  if (!res || res.status !== "ok") {
    return {
      ok: false as const,
      note:
        res?.reason ??
        "No peer ranks have been computed for this company, so it cannot be placed against its "
          + "peers on any theme.",
      themes: [] as {
        key: string; label: string; scored: boolean; pct: number | null;
        label_pct: string; coverage: string | null; reason: string | null;
      }[],
      peers: null as string | null,
    };
  }
  return {
    ok: true as const,
    note: null as string | null,
    peers:
      res.peer_count_min && res.peer_count_max
        ? res.peer_count_min === res.peer_count_max
          ? `${res.peer_count_min} peers`
          : // The count VARIES by metric -- a company with no value is excluded from that
            // metric's ranking rather than counted low -- so one number would be a fiction.
            `${res.peer_count_min}–${res.peer_count_max} peers, varying by metric`
        : null,
    themes: res.themes.map((t) => ({
      key: t.key,
      label: t.label,
      scored: t.scored,
      pct: t.percentile,
      label_pct: t.scored && t.percentile !== null ? `P${Math.round(t.percentile)}` : "not scored",
      coverage: t.scored ? `${t.covered} of ${t.total} metrics` : null,
      reason: t.reason,
    })),
  };
}

/**
 * §Peer-relative's "Filing history & flags" chips.
 *
 * **What these replaced matters more than what they are.** `companyFlags` invented
 * "restatement" and "material weakness" from a ticker seed, and asserted "timely filer" for
 * EVERY company unconditionally. All three are regulatory claims about a real filer, and two of
 * them were coin flips.
 *
 * What can be sourced, from the SAME filing index §06 reads:
 *   - a restatement is an 8-K **Item 4.02** (non-reliance on previously issued statements),
 *   - an auditor change is **Item 4.01**,
 *   - a late filing is a **12b-25**.
 *
 * **"Material weakness" is NOT here and cannot be.** Whether internal control was effective is
 * the Item 9A conclusion, which is prose — `/audit` returns `icfr.status = "na"` saying exactly
 * that. A flag we cannot source does not get a quieter colour; it gets left out.
 *
 * And nothing claims "timely filer". The honest form of that is "no 12b-25 among the filings we
 * indexed, which run from X to Y" — an absence over a WINDOW, which is what the empty state says.
 */
function toFilingFlags(res: AuditResponse | null) {
  const ev = res?.audit_events;
  if (!ev || ev.status !== "ok") {
    return {
      ok: false as const,
      chips: [] as { label: string; kind: "event" | "quiet" }[],
      note:
        "This company's filing index has not been read, so no restatement, auditor change or "
        + "late filing has been checked for — which is not the same as finding none.",
    };
  }

  const chips: { label: string; kind: "event" | "quiet" }[] = [];
  const restatements = (ev.events ?? []).filter((e) => e.item === "4.02");
  const auditorChanges = (ev.events ?? []).filter((e) => e.item === "4.01");
  if (restatements.length) {
    chips.push({ label: plural(restatements.length, "non-reliance 8-K"), kind: "event" });
  }
  if (auditorChanges.length) {
    chips.push({ label: plural(auditorChanges.length, "auditor change"), kind: "event" });
  }
  if ((ev.late_filings ?? []).length) {
    chips.push({ label: plural(ev.late_filings.length, "late-filing notice"), kind: "event" });
  }

  const span =
    ev.covered_from && ev.covered_to
      ? `${humanDate(ev.covered_from)} – ${humanDate(ev.covered_to)}`
      : "the indexed window";
  return {
    ok: true as const,
    chips,
    note: chips.length
      ? `Item 4.01, 4.02 and 12b-25 filings among the ${ev.indexed_filings ?? 0} filings indexed for `
        + `this company, ${span}. An item code says an event was REPORTED, never what it said.`
      : `No Item 4.02 restatement, Item 4.01 auditor change or 12b-25 late-filing notice among `
        + `the ${ev.indexed_filings ?? 0} filings indexed for this company, ${span}. That is an `
        + `absence over that window, not over the company's history.`,
  };
}

/**
 * §Peer-relative's "Segment & geographic mix" — the two stacked bars, from the SAME ASC 280
 * response §03 reads.
 *
 * **Both bars are this company's own 10-K, which the panel header always claimed and the data
 * did not.** The region bar was fed `geographicMix[sectorIdx]` — a SECTOR aggregate — under a
 * header reading "ASC 280 · {ticker} 10-K", and its four labels (Americas / China / Rest of
 * Asia / EMEA) were a fixed list, not the members the filer actually tagged. Apple tags three
 * (US, CN, Other Countries); a fixed four-label axis cannot show that and would put a number
 * against a region the filing never mentions. The segment bar was worse: `segmentChips` has
 * been hardcoded `[]` since the P0 port, so it rendered nothing at all.
 *
 * **Shares are of the DISCLOSED splits and need not sum to consolidated revenue** — that is
 * `normalize/segments.py`'s rule, not a rounding artefact, so the note says so rather than
 * normalising the bars to 100%.
 */
function toSegmentMix(res: SegmentsResponse | null) {
  const colour = (i: number) => proto.GEO_COLORS[i % proto.GEO_COLORS.length];
  const band = (rows: { label: string; member: string; revenue_share: number | null }[]) =>
    rows
      // A member with no share cannot be given a width. Dropping it is wrong too — it would
      // silently shrink the bar — so it is listed with an N/A share and no segment drawn.
      .map((r, i) => ({
        label: r.label || r.member,
        share: r.revenue_share,
        pct: r.revenue_share === null ? null : `${(r.revenue_share * 100).toFixed(1)}%`,
        width: r.revenue_share === null ? "0%" : `${(r.revenue_share * 100).toFixed(2)}%`,
        color: colour(i),
      }));

  if (!res || res.status !== "ok" || (!res.segments.length && !res.geography.length)) {
    return {
      ok: false as const,
      note:
        res?.reason ??
        "No ASC 280 segment or geographic facts were found for this filer, so neither split " +
          "can be shown. That is an absence in the tagged data, not a company with one segment.",
      segments: [] as ReturnType<typeof band>,
      geography: [] as ReturnType<typeof band>,
      fy: null as string | null,
    };
  }

  const drawn = (rows: { revenue_share: number | null }[]) =>
    rows.reduce((a, r) => a + (r.revenue_share ?? 0), 0);

  return {
    ok: true as const,
    note:
      `Shares are of the splits this filer DISCLOSED under ASC 280, off one revenue tag ` +
      `(${res.revenue_tag ?? "tag not reported"}) in its FY${res.fiscal_year} filing. They need ` +
      `not sum to consolidated revenue — segments cover ` +
      `${(drawn(res.segments) * 100).toFixed(0)}% and regions ` +
      `${(drawn(res.geography) * 100).toFixed(0)}% of it — and the members are the filer's own, ` +
      "not a fixed list of regions.",
    segments: band(res.segments),
    geography: band(res.geography),
    fy: res.fiscal_year ? `FY${res.fiscal_year}` : null,
  };
}

/**
 * §03 — reportable segments and geography, from ASC 280 dimensional facts.
 *
 * **Companyfacts carries no dimensional data at all**, so this is the one section on the page that
 * needed a new source: DERA's quarterly data sets, ingested by `dimensional_backfill`.
 *
 * Three things the card has to say out loud, all measured over 2026q1's 4,309 annual filings:
 *
 * **The margin column is usually impossible.** 81.4% of filers with named segments tag segment
 * revenue, 51.8% assets, and only 35.0% operating income. Margin renders only where both inputs
 * exist — Apple has it, JPMorgan does not.
 *
 * **Shares are of the DISCLOSED splits, not consolidated revenue.** The splits routinely do not
 * sum to the total, and dividing by the total would imply a remainder this data cannot describe.
 *
 * **A company appears in exactly one DERA quarter**, the one it filed in, so the fiscal year is
 * always shown. Microsoft's July-2026 10-K sits in an unpublished quarter and is simply absent.
 *
 * Customer concentration is deliberately absent: the axis reaches 4.1% of filers and its members
 * are mostly customer CATEGORIES rather than customers.
 */
function toSegments(res: SegmentsResponse | null) {
  const fy = res?.fiscal_year ? `FY${res.fiscal_year}` : null;
  const pct = (v: number | null) => (v === null ? "N/A" : `${(v * 100).toFixed(1)}%`);
  const money = (v: number | null) => (v === null ? "N/A" : usdCompact(v));

  const segments = (res?.segments ?? []).map((s) => ({
    name: s.label,
    rev: money(s.revenue),
    op: money(s.operating_income),
    margin: pct(s.margin),
    // No bar where there is no margin: a 0%-wide track next to "N/A" reads as a real zero.
    marginW: s.margin === null ? "0%" : `${Math.max(0, Math.min(100, s.margin * 100)).toFixed(0)}%`,
    assets: money(s.assets),
    share: pct(s.revenue_share),
  }));

  const geography = (res?.geography ?? []).map((g) => ({
    name: g.label,
    rev: money(g.revenue),
    assets: money(g.long_lived_assets),
    share: pct(g.revenue_share),
  }));

  const missingMargins = (res?.segments ?? []).filter((s) => s.margin === null).length;
  return {
    ok: res?.status === "ok",
    fiscalYear: fy,
    segments,
    geography,
    reason: res?.reason ?? "Segment data could not be read for this company just now.",
    note:
      (fy ? `The filer's own ASC 280 segments, as tagged in its ${fy} annual report. ` : "") +
      "Segment definitions are management's and are not comparable across companies. " +
      (missingMargins
        ? `${missingMargins} of ${segments.length} segments tag no operating income, so their margin is N/A. `
        : "") +
      "Shares are of the disclosed splits, which need not sum to consolidated revenue.",
  };
}

/* ------------------------------------------------------------ the "what changed" band */

interface FilingChangesResponse {
  cik: number;
  status: string;
  reason: string | null;
  since: string | null;
  checked: string[];
  changes: { tag: string; text: string; source: string; date: string | null }[];
}

/**
 * The "What changed this filing" band — a NOTIFICATION, not a status board (operator direction
 * 2026-08-05).
 *
 * A status board answers "did the auditor change?" with *no*. A notification stays silent unless
 * something happened. So every row here is an event, and a company with a quiet year shows none —
 * replaced by one line naming what was checked, which makes the silence a checked absence rather
 * than a shrug.
 *
 * That is also why this can share filings with §06 and §08 without the page repeating itself:
 * those sections answer the same questions **including their negatives**, and this shows only the
 * positives.
 *
 * The TAGS row is the only true diff of this filing against the prior one — concepts the filer
 * started or stopped tagging. A value-level restatement diff was measured and rejected: it is
 * dominated by `Other…` aggregation lines whose content legitimately differs between filings.
 */
function toFilingChanges(res: FilingChangesResponse | null) {
  const rows = (res?.changes ?? []).map((c) => ({
    tag: c.tag,
    text: c.text,
    src: c.date ? `${c.source} · ${humanDate(c.date)}` : c.source,
  }));

  const since = res?.since ? humanDate(res.since) : null;
  return {
    ok: res?.status === "ok",
    rows,
    subtitle: since
      ? `since the annual report filed ${since} · change is described, not scored`
      : "change is described, not scored",
    // Shown only when nothing fired. Naming the signals is what separates "we looked and found
    // nothing" from "we did not look".
    quiet: since
      ? `No change among the signals checked since the annual report filed ${since}.`
      : "Nothing to compare against yet.",
    checked: res?.checked ?? [],
    reason: res?.reason ?? "This company's filing record could not be read just now.",
  };
}

/* ------------------------------------------------------------ §08 filing activity & disclosure */

interface FilingActivityResponse {
  cik: number;
  status: string;
  reason: string | null;
  indexed_filings?: number;
  covered_from?: string | null;
  covered_to?: string | null;
  amended?: number;
  amended_share?: number | null;
  forms?: { form: string; count: number }[];
  eight_k_count?: number;
  items?: { code: string; label: string | null; count: number }[];
  material_agreements?: { form: string; filed: string | null; accession: string }[];
  /** How many 1.01 filings exist in the window; `material_agreements` is capped at 8. */
  material_agreements_total?: number;
  /** Form types the route's own top-8 slice left out, so the card can name the whole remainder. */
  forms_not_listed?: { types: number; filings: number };
  /** 8-K item codes EDGAR used that we hold no label for, and how often they appeared. */
  items_not_labelled?: { codes: number; occurrences: number };
}

/**
 * §08, re-scoped from "disclosure change" to filing activity (operator ruling 2026-08-05).
 *
 * Five of the section's seven designed fields are irreducibly narrative — a risk-factor diff, the
 * MD&A's attributed drivers, outlook language, the cybersecurity FRAMEWORK line and human-capital
 * headcount. None has a Track 1 path and none was faked.
 *
 * What replaces them is what a company's filing record actually shows: which 8-K items it reports
 * and how often, its form mix, and its amendment rate. That is a real and comparable fact about
 * how a company talks to the market — Tesla files 18 Item 1.01 material agreements where Apple
 * files none, and JPMorgan's window is 87% prospectus supplements.
 *
 * **Every count is scoped to EDGAR's rolling indexed window, and the window travels with it.**
 * Apple's reaches 2015 and JPMorgan's covers twelve months; a count without its window would
 * compare a decade against a year.
 *
 * **Two of the six cards restate §06 deliberately** (operator ruling, duplication accepted). They
 * name §06 as their source rather than presenting a second finding.
 */
function toFilingActivity(res: FilingActivityResponse | null) {
  const window =
    res?.covered_from && res?.covered_to
      ? `${res.covered_from.slice(0, 4)}–${res.covered_to.slice(0, 4)}`
      : "the indexed window";

  const allItems = (res?.items ?? []).map((i) => ({
    code: i.code,
    label: i.label ?? `Item ${i.code}`,
    count: i.count,
  }));
  const allForms = (res?.forms ?? []).map((f) => ({ form: formName(f.form), count: f.count }));

  return {
    ok: res?.status === "ok",
    reason: res?.reason ?? "This company's filing index could not be read just now.",
    window,
    indexed: res?.indexed_filings ?? 0,
    eightKs: res?.eight_k_count ?? 0,
    // Both lists are CAPPED for the card, and the cap lives here so the view cannot silently
    // widen or narrow it. A capped column whose rows no longer sum to the header's total reads as
    // a rendering fault or as a smaller filer -- so what falls outside the cap is counted and
    // named rather than dropped.
    items: allItems.slice(0, ITEM_ROWS),
    itemsRest: restNote(
      allItems,
      ITEM_ROWS,
      {
        types: res?.items_not_labelled?.codes ?? 0,
        count: res?.items_not_labelled?.occurrences ?? 0,
      },
      "item type",
      "occurrence",
    ),
    forms: allForms.slice(0, FORM_ROWS),
    formsRest: restNote(
      allForms,
      FORM_ROWS,
      {
        types: res?.forms_not_listed?.types ?? 0,
        count: res?.forms_not_listed?.filings ?? 0,
      },
      "form type",
      "filing",
    ),
    // An amendment may be a correction OR a routine refiling, and the index cannot tell them
    // apart — so this is a rate, never a quality score.
    amended: res?.amended ?? 0,
    amendedPct:
      res?.amended_share === null || res?.amended_share === undefined
        ? "N/A"
        : `${(res.amended_share * 100).toFixed(1)}%`,
    // The agreements list is capped at 8 by the route. When more exist the card says so rather
    // than reading as the filer's complete history of material agreements.
    agreementsRest:
      (res?.material_agreements_total ?? 0) > (res?.material_agreements ?? []).length
        ? `${(res?.material_agreements_total ?? 0) - (res?.material_agreements ?? []).length} earlier Item 1.01 filings in the window are not listed.`
        : null,
    agreements: (res?.material_agreements ?? []).map((a) => ({
      form: a.form,
      date: a.filed ? humanDate(a.filed) : "date N/A",
    })),
    note:
      `Counts cover the ${res?.indexed_filings ?? 0} filings EDGAR lists for this company, ` +
      `${window} — a rolling window, not the company's whole history. Item codes say which kind ` +
      "of event was reported, never what it said.",
  };
}

/**
 * §08.3 cybersecurity — Item 1C, from the `cyd` taxonomy in the 10-K instance.
 *
 * **`materially_affected` is the valuable one.** An affirmative `false` is the registrant stating
 * no material cyber effect — a *checked* negative, where a missing 8-K Item 1.05 is only an
 * unchecked box. Both are shown, and they are not the same claim.
 *
 * **The framework line stays empty.** Which standard a company follows (NIST CSF, ISO 27001) is a
 * `cyd` prose TextBlock, and prose is Track 2.
 */
function toCybersecurity(res: AuditResponse | null, incidents: number) {
  const c = res?.cybersecurity;
  const ok = c?.status === "ok";
  const yes = (v: boolean | null | undefined) => v === true;

  const governance = !ok
    ? []
    : [
        yes(c?.positions_responsible) ? "a named position or committee is responsible" : null,
        yes(c?.reports_to_board) ? "it reports to the board" : null,
        yes(c?.processes_integrated) ? "processes are integrated into overall risk management" : null,
        yes(c?.third_party_engaged) ? "a third party is engaged" : null,
        yes(c?.third_party_oversight) ? "third-party risk is overseen" : null,
      ].filter(Boolean);

  return {
    ok,
    reason: c?.reason ?? "Item 1C cybersecurity tagging has not been read for this company.",
    governance,
    // The two independent answers to "was there an incident", kept apart.
    materialEffect: !ok
      ? "N/A"
      : c?.materially_affected === false
        ? "The registrant states no material effect from a cybersecurity risk or incident."
        : c?.materially_affected === true
          ? "The registrant states a cybersecurity risk or incident HAS materially affected it."
          : "Not tagged.",
    incidents:
      incidents > 0
        ? `${plural(incidents, "8-K Item 1.05 filing")} on file — a reported material incident.`
        : "No 8-K Item 1.05 in the indexed window.",
    frameworkReason:
      "Which framework a registrant follows (NIST CSF, ISO 27001) is Item 1C narrative, tagged " +
      "only as a prose block.",
  };
}

/* ------------------------------------------------------------ §05.5 Rule 10b5-1 arrangements */

interface TradingArrangementsResponse {
  cik: number;
  status: string;
  reason: string | null;
  filing?: { form: string | null; filed: string | null; accession: string | null; period_end: string | null } | null;
  adopted_count?: number;
  terminated_count?: number;
  arrangements: {
    person: string | null;
    title: string | null;
    rule_10b5_1_adopted: boolean | null;
    rule_10b5_1_terminated: boolean | null;
    adoption_date: string | null;
    adoption_date_raw: string | null;
    termination_date: string | null;
    termination_date_raw: string | null;
    duration: string | null;
    securities_amount: number | null;
    securities_unit: string | null;
  }[];
}

/** `P268D` → `268 days`. An ISO duration is precise and unreadable; this only expands days. */
function planDuration(iso: string | null): string {
  const m = /^P(\d+)D$/.exec(iso ?? "");
  return m ? `${m[1]} days` : (iso ?? "");
}

/**
 * §05.5 — who adopted or terminated a Rule 10b5-1 plan, and when.
 *
 * **This is the disclosure D-10b5-1 said did not exist.** That limitation held we can never state
 * a plan's adoption date, only that a trade was made under one — true of Form 4's `aff10b5One`
 * box, and wrong about Item 408(a), which has required the person, the date, the duration and the
 * securities covered since Dec 2022.
 *
 * **One fiscal quarter, not a year** (operator ruling 2026-08-05). Item 408(a) is disclosed
 * quarterly and this reads the latest 10-K, so it covers that filing's fourth fiscal quarter. The
 * window is stated on the card, because "no plans adopted" over one quarter and over a year are
 * very different claims.
 *
 * **Adopted and terminated are kept apart.** Amazon's CFO terminated a plan in the same quarter
 * six colleagues adopted one.
 *
 * **Amounts are as filed.** Microsoft tags its CFO's plan at 48.7 billion shares against ~7.4
 * billion outstanding. That is the filer's number in the filer's unit; correcting or hiding it
 * would be us editing a filing.
 */
function toTradingArrangements(res: TradingArrangementsResponse | null) {
  const quarter = res?.filing?.period_end ? humanDate(res.filing.period_end) : null;
  const rows = (res?.arrangements ?? []).map((a) => {
    const terminated = a.rule_10b5_1_terminated === true;
    const iso = terminated ? a.termination_date : a.adoption_date;
    const raw = terminated ? a.termination_date_raw : a.adoption_date_raw;
    return {
      person: a.person ?? "Name not reported",
      title: a.title ?? "",
      kind: terminated ? ("terminated" as const) : ("adopted" as const),
      // The ISO date where a known format parsed, otherwise the filer's own words. These
      // elements are typed as text, so an unrecognised format is shown rather than dropped.
      date: iso ? humanDate(iso) : (raw ?? "date not reported"),
      dateExact: !!iso,
      duration: planDuration(a.duration),
      shares:
        a.securities_amount === null
          ? ""
          : `${a.securities_amount.toLocaleString()} ${a.securities_unit ?? ""}`.trim(),
    };
  });

  const adopted = res?.adopted_count ?? 0;
  const terminated = res?.terminated_count ?? 0;
  const headline = !rows.length
    ? `No director or officer adopted or terminated a Rule 10b5-1 plan in the quarter ended ${quarter ?? "covered by the latest 10-K"}.`
    : `${plural(adopted, "plan")} adopted` +
      (terminated ? ` and ${plural(terminated, "terminated")}` : "") +
      ` in the quarter ended ${quarter ?? "covered by the latest 10-K"}.`;

  return {
    ok: res?.status === "ok",
    rows,
    headline,
    reason:
      res?.reason ??
      "Rule 10b5-1 arrangements could not be read for this company just now.",
    note:
      "Item 408(a) is disclosed per fiscal QUARTER — this is the quarter of the latest annual " +
      "report, not the trailing year. Dates and amounts are the filer's own, as filed.",
  };
}

/* ------------------------------------------------------------ §05.2 governance policies */

/**
 * §05.2, repointed from board COMPOSITION to the governance check marks that are tagged
 * (operator ruling 2026-08-04). Same 2×2, real values, honest labels — the §06.9 precedent.
 *
 * **All four designed tiles are confirmed absent.** Board size, independence, director tenure and
 * CEO tenure appear only in the proxy's prose; V2 verified it and re-testing the 10-K instance
 * today did not change it. Director tenure is doubly out of reach — our filing window would put
 * Apple's chair on the board since 2025.
 *
 * **What replaces them are four boxes a filer ticked**, three from the DEF 14A's `ecd` taxonomy
 * (already riding in the pay-versus-performance payload, never displayed until now) and one from
 * the 10-K cover. Every one is a declaration, not a judgment, and the card says so.
 *
 * **The clawback tile is narrower than the word suggests.** Rule 10D-1 put two check marks on the
 * cover: whether the statements correct a prior error, and — only if so — whether that required a
 * compensation recovery analysis. Whether a clawback POLICY exists at all is a listing-standard
 * disclosure in the proxy's prose and stays out of reach, so the tile never claims it.
 */
function toGovernancePolicies(pvp: PvpResponse | null, audit: AuditResponse | null) {
  const g = pvp?.governance;
  const c = audit?.clawback;

  /** A filer's tick, its cross, or the fact that they answered neither. */
  const flag = (v: boolean | null | undefined, yes: string, no: string) =>
    v === true ? yes : v === false ? no : "N/A";

  const correction = c?.error_correction;
  const fy = c?.period_end ? `FY${c.period_end.slice(0, 4)}` : "the latest 10-K";

  return {
    tiles: [
      {
        k: "Insider trading policy",
        v: flag(g?.insider_trading_policy_adopted, "Adopted", "Not adopted"),
        why:
          "ecd:InsiderTrdPoliciesProcAdoptedFlag — the filer's own declaration that it has " +
          "adopted insider trading policies and procedures. Not a view on their quality.",
      },
      {
        k: "Award timing vs MNPI",
        v: flag(g?.award_timing_considers_mnpi, "Considered", "Not considered"),
        why:
          "ecd:AwardTmgMnpiCnsdrdFlag — whether material non-public information is taken into " +
          "account when determining the timing of option awards. Untagged by many filers, and " +
          "an untagged box is not a 'no'.",
      },
      {
        k: "Award timing predetermined",
        v: flag(g?.award_timing_predetermined, "Predetermined", "Not predetermined"),
        why:
          "ecd:AwardTmgPredtrmndFlag — whether option award timing follows a predetermined " +
          "schedule. Untagged by many filers, and an untagged box is not a 'no'.",
      },
      {
        k: "Accounting-error correction",
        v:
          correction === false
            ? `None in ${fy}`
            : correction === true
              ? `Yes, ${fy}`
              : "N/A",
        why:
          correction === true
            ? "dei:DocumentFinStmtErrorCorrectionFlag — these statements correct an error in " +
              "previously issued ones. " +
              (c?.recovery_analysis === true
                ? "It required a compensation recovery analysis under Rule 10D-1(b)."
                : c?.recovery_analysis === false
                  ? "It did not require a compensation recovery analysis under Rule 10D-1(b)."
                  : "Whether it required a recovery analysis is not tagged.")
            : correction === false
              ? "dei:DocumentFinStmtErrorCorrectionFlag — no correction of a previously issued " +
                "statement, so the Rule 10D-1 compensation-recovery question does not arise."
              : c?.reason ??
                "No annual-report cover page has been read for this company yet.",
      },
    ],
    note:
      "Every value here is a box the filer ticked on a filing, not a judgment about governance. " +
      "Board size, independence, director tenure and CEO tenure are tagged in no SEC source — " +
      "they appear only in the proxy's prose. The directors themselves are listed above.",
  };
}

/* ------------------------------------------------------------ §05.1 officer & director changes */

interface OfficerChangesResponse {
  cik: number;
  changes: {
    kind: "arrival" | "role_change" | "event";
    person: string | null;
    role: string | null;
    previous_role: string | null;
    role_is_stated_title: boolean;
    source: string | null;
    date: string | null;
    accession: string | null;
    relationship: string | null;
  }[];
  arrival_count: number;
  role_change_count: number;
  event_count: number;
  roster: {
    person: string;
    role: string | null;
    role_is_stated_title: boolean;
    is_officer: boolean;
    is_director: boolean;
    last_filed: string | null;
    change: "new" | "role_change" | null;
    change_date: string | null;
    previous_role: string | null;
  }[];
  roster_total: number;
  roster_filings: number;
  since: string | null;
  changed_count: number;
  events_since: number;
  index_built: boolean;
  indexed_filings: number;
  covered_from: string | null;
  covered_to: string | null;
  arrivals_excluded: number;
  arrivals_unclassified: number;
  status: string;
  reason: string | null;
}

/**
 * §05.1, from the two structured sources — interleaved by date, never joined.
 *
 * **There is no action verb, and this does not invent one.** "Appointed" / "resigned" / "retired"
 * is Item 5.02 narrative, and EDGAR's item code carries no sub-item letter: every indexed 5.02
 * filing reads `5.02`, never `5.02(b)` or `5.02(c)`. So departure, election, appointment and
 * compensatory arrangement are indistinguishable in the index, and the card says which filing
 * exists rather than what it decided.
 *
 * **A Form 3 marks an arrival, structurally** — Section 16 requires one within 10 days of becoming
 * an officer or director. It requires nothing on departure, so a departing CFO files nothing and
 * cannot appear here. The footer says so, because a list of arrivals read as a list of changes
 * would imply a company that only ever hires.
 *
 * **Same-day rows stay two rows.** Apple filed a Form 3 for Ben Borders and an Item 5.02 on
 * 2026-01-02; neither references the other, so they sit adjacent and the reader draws the link.
 */
function toOfficerChanges(res: OfficerChangesResponse | null) {
  const rows = (res?.changes ?? []).map((c) => ({
    kind: c.kind,
    who: c.person ?? "—",
    whoTitle:
      c.kind === "event"
        ? "The 8-K index carries the filing and its date. Who it concerns is in the 8-K's text."
        : (c.relationship ?? ""),
    what:
      c.kind === "arrival"
        ? `${c.source} · ${c.role ?? ""}`.trim()
        : c.kind === "role_change"
          ? // The arrow is the whole point: the filer restated its own boxes between two
            // filings. Both sides are shown so the reader sees what actually changed.
            `${c.previous_role ?? ""} → ${c.role ?? ""}`.trim()
          : (c.source ?? ""),
    date: c.date ?? "date N/A",
  }));

  // Person, role, and a mark only where something changed. No board/officer column: the
  // relationship string already says it — "director, officer (Chief Executive Officer)" carries
  // the seat in the filer's own words, and a cell restating it just narrows the role.
  const roster = (res?.roster ?? []).map((m) => ({
    person: m.person,
    role: m.role ?? "role not stated",
    mark: m.change === "new" ? "new" : m.change === "role_change" ? "role changed" : "",
    markTitle:
      m.change === "new"
        ? `Filed a Form 3 on ${m.change_date} — Section 16 requires one within 10 days of ` +
          "becoming an insider, so this is the filer's own arrival signal."
        : m.change === "role_change"
          ? `Reported as “${m.previous_role}” before ${m.change_date}. The filer restated its ` +
            "own role boxes between filings."
          : "",
  }));

  const window =
    res?.covered_from && res?.covered_to
      ? `${res.covered_from.slice(0, 4)}–${res.covered_to.slice(0, 4)}`
      : "the filings indexed";

  // Two different absences. "We read the 8-K index and found no Item 5.02" is a finding; "we have
  // never indexed this company" is not, and the card must not let them read alike.
  const since = res?.since ? humanDate(res.since) : "the previous quarter";

  // "Who changed" is meaningless without the date it is measured from, so the baseline leads —
  // and a company where nothing changed says so, rather than showing an unexplained plain list.
  const changeLine = res?.changed_count
    ? `${plural(res.changed_count, "change")} since ${since}: marked below.`
    : `No officer or director change since ${since}.`;

  // An Item 5.02 names nobody, so it cannot become a mark. Counted here instead of dropped —
  // "a change was reported and we cannot say whose" is information, and losing it would make
  // the roster look more settled than the filings say it is.
  const eventLine = !res?.index_built
    ? " This company's 8-K index has not been built, so Item 5.02 filings have not been read."
    : res.events_since
      ? ` ${plural(res.events_since, "8-K Item 5.02 filing")} in the same window ` +
        "reports a change this card cannot attribute to a person."
      : "";

  const excluded = res?.arrivals_excluded
    ? ` ${plural(res.arrivals_excluded, "Form 3 filer was", "Form 3 filers were")} ` +
      "a 10% owner or an “other” filer, not an officer or director."
    : "";

  return {
    ok: (res?.status === "ok" && (res?.roster?.length ?? 0) > 0) as boolean,
    rows,
    roster,
    changeLine: changeLine + eventLine + excluded,
    // Completeness tracks how many filings we hold, and nothing else — Apple's 16 people cover
    // its whole Section 16 population from 60 filings, JPMorgan's 9 come from 12. Without this
    // line the two look identical.
    rosterNote: res?.roster_total
      ? `${plural(res.roster_total, "person", "people")} across the ` +
        `${plural(res.roster_filings, "ownership filing")} held for this company, each under the ` +
        `role they last reported. Indexed filings cover ${window}.`
      : "",
    rosterMore: res && res.roster_total > res.roster.length ? res.roster_total - res.roster.length : 0,
    reason:
      res?.reason ??
      "Officer and director changes could not be read for this company just now.",
  };
}

/* ------------------------------------------------------------ §Insider activity, on real forms */

interface InsiderTradeRow {
  owner_name: string | null;
  owner_relationship: string | null;
  transaction_date: string | null;
  security_title: string | null;
  shares: number | null;
  price_per_share: number | null;
  acquired_disposed: string | null;
  transaction_code: string | null;
  ownership_type: string | null;
  form_type: string | null;
  accession: string | null;
  filed: string | null;
  is_holding: boolean | null;
  is_derivative: boolean | null;
  rule_10b5_1: boolean | null;
}

interface ProposedSaleNoticesResponse {
  status: string;
  reason: string | null;
  cannot: string;
  notices: { filed: string | null; form: string; accession: string }[];
  count: number;
  covered_from: string | null;
  covered_to: string | null;
  truncated: boolean;
}

/**
 * Form 4 Table I codes, and the split the whole view argues.
 *
 * `side` is MECHANICAL -- which way shares moved, not whether anyone decided anything. Only P
 * is a purchase with the filer's own money and only S is a decision to sell; A, M and F move
 * shares as a consequence of a grant or a vesting date. Folding them into one "net insider
 * buying" number is the most common way this data is misread, so the split is structural here.
 */
const TXN_CODES: Record<string, { label: string; short: string; side: "in" | "out"; what: string }> =
  {
    A: { label: "A · award or grant", short: "A · award", side: "in",
         what: "Shares issued by the company under a plan. No purchase." },
    M: { label: "M · derivative exercise", short: "M · exercise", side: "in",
         what: "Options or units exercised into shares." },
    P: { label: "P · open-market purchase", short: "P · purchase", side: "in",
         what: "Bought with the filer's own money — the only acquisition that is a decision to buy." },
    S: { label: "S · open-market sale", short: "S · sale", side: "out",
         what: "Shares sold in the market." },
    F: { label: "F · withheld for tax", short: "F · tax withheld", side: "out",
         what: "Withheld by the issuer to cover tax at vesting. Not a decision to sell." },
    D: { label: "D · disposition to issuer", short: "D · to issuer", side: "out",
         what: "Returned to the company." },
    G: { label: "G · gift", short: "G · gift", side: "out",
         what: "Given away; no consideration received." },
    J: { label: "J · other", short: "J · other", side: "out",
         what: "The filer chose 'other' and explained it in a footnote we do not read." },
  };

const SPLIT_COLORS: Record<string, string> = {
  A: "var(--in-2)", M: "var(--in-3)", P: "var(--in-1)",
  S: "var(--out-1)", F: "var(--out-2)", D: "var(--out-3)", G: "var(--out-4)", J: "var(--out-5)",
};

interface InsiderPeerRatioResponse {
  status: string;
  reason: string | null;
  peer_group?: string;
  as_of?: string;
  window_days?: number;
  peers: {
    cik: number;
    ticker: string | null;
    name: string | null;
    net_ratio: number;
    buy_count: number;
    sell_count: number;
  }[];
  company_value?: number | null;
  company_reason?: string | null;
  quantiles?: { min: number; p25: number; median: number; p75: number; max: number } | null;
  shape?: { at_floor: number; at_ceiling: number; between: number };
  peer_count?: number;
  group_company_count?: number;
  peers_without_activity?: number;
}

/**
 * The peer strip: where this filer's open-market posture sits among its SIC group.
 *
 * **The distribution is bimodal and the copy has to say so.** 81% of NVIDIA's peer group sits at
 * exactly −1 and 12% at exactly +1, because insiders routinely sell vested stock and rarely buy
 * on the open market. Quartiles collapse onto the floor and describe almost nothing, so the note
 * leads with the three concentration counts the endpoint sends and treats the median as a
 * footnote. A reader who sees a median of −1 without that sentence would reasonably think the
 * chart is broken.
 *
 * **A peer with no open-market row has no value and is NOT a dot.** It is reported as a count of
 * peers the measure could not be computed for — plotting it at 0.0 would read as "balanced",
 * which is the opposite of "did not trade".
 */
function toInsiderPeerRatio(res: InsiderPeerRatioResponse | null) {
  if (!res || res.status !== "ok" || !res.peers?.length) {
    return {
      ok: false as const,
      note:
        res?.reason ??
        "No peer comparison could be built for this company just now.",
      peers: [] as { id: string; label: string; value: number }[],
      focal: null as number | null,
      quantiles: null,
    };
  }
  const shape = res.shape ?? { at_floor: 0, at_ceiling: 0, between: 0 };
  const n = res.peer_count ?? res.peers.length;
  const pct = (k: number) => (n ? `${Math.round((k / n) * 100)}%` : "N/A");

  return {
    ok: true as const,
    // Label order: ticker, then registrant name, then the bare cik. A chart mark has room for
    // "NVDA" and not for "NVIDIA CORPORATION", and a company we cannot name at all is still a
    // real dot in the distribution — dropping it would understate the group.
    peers: res.peers.map((p) => ({
      id: String(p.cik),
      label: p.ticker ?? p.name ?? `CIK ${p.cik}`,
      value: p.net_ratio,
    })),

    focal: res.company_value ?? null,
    quantiles: res.quantiles ?? null,
    note:
      `${pct(shape.at_floor)} of the ${n} peers with open-market activity sold and never bought ` +
      `(−1), ${pct(shape.at_ceiling)} bought and never sold (+1), and ${pct(shape.between)} did ` +
      `both — so this is two clusters, not a spread, and the median of ` +
      `${res.quantiles ? res.quantiles.median.toFixed(2) : "N/A"} sits inside the larger one. ` +
      (res.peers_without_activity
        ? `A further ${res.peers_without_activity} companies in SIC ${res.peer_group} had no ` +
          "open-market row at all and are not plotted — absent, not balanced. "
        : "") +
      "Codes P and S only: grants, exercises and tax withholding are not decisions to trade.",
    focalNote:
      res.company_value === null || res.company_value === undefined
        ? (res.company_reason ??
          "This company has no open-market row in the window, so it is not on the strip.")
        : null,
  };
}

/** Business days between two ISO dates, weekends excluded. Holidays are NOT — see `lagNote`. */
function businessDaysBetween(a: string, b: string): number | null {
  const t0 = Date.parse(`${a}T00:00:00Z`);
  const t1 = Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(t0) || Number.isNaN(t1) || t1 < t0) return null;
  let days = 0;
  for (let t = t0; t < t1; t += 86400000) {
    const d = new Date(t + 86400000).getUTCDay();
    if (d !== 0 && d !== 6) days += 1;
  }
  return days;
}

/**
 * §Insider activity, built from ONE real Section 16 ledger.
 *
 * **Which rows count, and why the exclusions are stated rather than silent.** An option
 * exercise files TWO rows — the derivative giving up units and the non-derivative receiving
 * shares — so counting both turns one event into two. `normalize/insider_summary.py` already
 * solves this server-side and reports what it dropped; this applies the SAME filter (holdings
 * out, derivative rows out) so the panels and the tally cannot disagree, and surfaces the
 * counts rather than quietly shrinking the ledger.
 *
 * **The window is FILINGS, not days.** The design asked for "trailing 180 days"; the endpoint
 * is bounded by filing count, which is six days at one filer and eight months at another. The
 * masthead states the span the filings turned out to cover.
 *
 * **Latency is Form 4 only.** The two-business-day rule is Form 4's. A Form 3 is due within ten
 * days of becoming an insider and a Form 5 within 45 days of fiscal year end, so binning all
 * three together would draw a "late" filing that met its own deadline.
 */
function toInsiderActivity(
  cik: number | null,
  trades: InsiderTradeRow[] | null,
  summary: InsiderSummaryResponse | null,
  notices: ProposedSaleNoticesResponse | null,
  peerRatio: InsiderPeerRatioResponse | null,
) {
  const e = (form: string) =>
    cik
      ? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=${encodeURIComponent(form)}&dateb=&owner=include&count=40`
      : "https://www.sec.gov/edgar/searchedgar/companysearch";
  const links = { forms4: e("4"), f144: e("144"), proxy: e("DEF 14A") };

  const all = trades ?? [];
  // The same exclusions insider_summary.py applies, counted so the view can name them.
  const holdings = all.filter((r) => r.is_holding).length;
  const derivative = all.filter((r) => !r.is_holding && r.is_derivative === true).length;
  const rows = all.filter((r) => !r.is_holding && r.is_derivative !== true);
  const uncoded = rows.filter((r) => !r.transaction_code).length;

  if (!rows.length) {
    return {
      ok: false as const,
      reason:
        summary?.reason ??
        "No Section 16 transaction rows could be read for this company just now.",
      window: "no Form 3/4/5 filings read",
      links,
      tiles: [] as { k: string; v: string; sub: string }[],
      rows: [] as InsiderLedgerRow[],
      sharesSplit: [] as InsiderSplit[],
      splitNote: "",
      acqCount: 0,
      dispCount: 0,
      codeMix: [] as InsiderCodeMix[],
      people: [] as InsiderPerson[],
      peopleNote: "",
      lagBins: [] as { label: string; n: number; median?: boolean }[],
      medBd: 0,
      lagNote: "",
      ratio: toInsiderPeerRatio(null),
      f144: { ok: false as const, note: "", notices: [] as InsiderNotice[] },
      forms: FORM_DUTIES,
      limits: INSIDER_LIMITS,
    };
  }

  const span =
    summary?.window_start && summary?.window_end
      ? `${humanDate(summary.window_start)} – ${humanDate(summary.window_end)}`
      : "dates not reported";
  const window = `${plural(summary?.filings ?? 0, "filing")} · ${span}`;

  // ---------------------------------------------------------------- ledger rows
  const ledger: InsiderLedgerRow[] = rows.map((r) => {
    const code = r.transaction_code ?? "";
    const def = TXN_CODES[code];
    const bd =
      r.form_type === "4" && r.transaction_date && r.filed
        ? businessDaysBetween(r.transaction_date, r.filed)
        : null;
    const late = bd !== null && bd > 2;
    return {
      person: r.owner_name ?? "Name not reported",
      role: r.owner_relationship ?? "relationship not reported",
      code,
      codeShort: def?.short ?? (code ? `${code} · not in Table I` : "code not reported"),
      shares: r.shares ?? 0,
      sharesLabel: r.shares === null ? "N/A" : `${Math.round(r.shares).toLocaleString()} sh`,
      side: def?.side ?? (r.acquired_disposed === "A" ? "in" : "out"),
      // The Rule 10b5-1 box is on the FILING and says a trade was pre-arranged — never when the
      // plan was adopted, so no cooling-off period can be read from it (D-10b5-1).
      planLabel:
        r.rule_10b5_1 === true
          ? "under a 10b5-1 plan"
          : r.rule_10b5_1 === false
            ? "no plan flagged"
            : "plan box not on this form",
      tDate: r.transaction_date ?? "",
      fDate: r.filed ? humanDate(r.filed) : "N/A",
      lagLabel: bd === null ? "—" : `${bd} bd${late ? " · late" : ""}`,
      lagLate: late,
    };
  });

  // ---------------------------------------------------------------- shares by code
  const byCode = new Map<string, { n: number; sh: number }>();
  for (const r of rows) {
    const key = r.transaction_code ?? "?";
    const cur = byCode.get(key) ?? { n: 0, sh: 0 };
    cur.n += 1;
    cur.sh += r.shares ?? 0;
    byCode.set(key, cur);
  }
  const totalSh = [...byCode.values()].reduce((a, b) => a + b.sh, 0);
  const sharesSplit: InsiderSplit[] = [...byCode.entries()]
    .sort((a, b) => b[1].sh - a[1].sh)
    .map(([code, v]) => ({
      label: TXN_CODES[code]?.label ?? (code === "?" ? "code not reported" : `${code} · other`),
      sh: v.sh,
      pct: totalSh ? (v.sh / totalSh) * 100 : 0,
      color: SPLIT_COLORS[code] ?? "var(--muted)",
      shLabel: `${Math.round(v.sh).toLocaleString()} sh`,
      pctLabel: totalSh ? `${((v.sh / totalSh) * 100).toFixed(1)}%` : "N/A",
    }));

  const maxSh = Math.max(...[...byCode.values()].map((v) => v.sh), 0);
  const codeMix: InsiderCodeMix[] = [...byCode.entries()]
    .sort((a, b) => b[1].sh - a[1].sh)
    .map(([code, v]) => ({
      code,
      label: TXN_CODES[code]?.label ?? (code === "?" ? "code not reported" : `${code} · other`),
      what:
        TXN_CODES[code]?.what ??
        (code === "?"
          ? "These rows reached us without a Table I code."
          : "Not one of the codes this view names."),
      n: v.n,
      shLabel: `${Math.round(v.sh).toLocaleString()} sh`,
      w: `${maxSh ? (v.sh / maxSh) * 100 : 0}%`,
      dim: TXN_CODES[code] ? "1" : "0.6",
      note: `${plural(v.n, "row")}.`,
    }));

  const acqCount = rows.filter((r) => r.acquired_disposed === "A").length;
  const dispCount = rows.filter((r) => r.acquired_disposed === "D").length;
  const splitNote =
    `Shares by Table I code over ${plural(rows.length, "transaction row")}. ` +
    `${holdings} holding ${holdings === 1 ? "row was" : "rows were"} excluded (a Form 3 position is not a trade) and ` +
    `${derivative} derivative ${derivative === 1 ? "row" : "rows"} — an exercise files two rows, and counting both doubles it.` +
    (uncoded
      ? ` ${plural(uncoded, "row")} carried no code and ${uncoded === 1 ? "is" : "are"} shown as such rather than assigned one.`
      : "");

  // ---------------------------------------------------------------- by person
  const byPerson = new Map<string, { role: string; n: number; net: number; codes: Set<string> }>();
  for (const r of rows) {
    const name = r.owner_name ?? "Name not reported";
    const cur = byPerson.get(name) ?? {
      role: r.owner_relationship ?? "",
      n: 0,
      net: 0,
      codes: new Set<string>(),
    };
    cur.n += 1;
    cur.net += (r.acquired_disposed === "A" ? 1 : -1) * (r.shares ?? 0);
    if (r.transaction_code) cur.codes.add(r.transaction_code);
    byPerson.set(name, cur);
  }
  const people: InsiderPerson[] = [...byPerson.entries()]
    .sort((a, b) => Math.abs(b[1].net) - Math.abs(a[1].net))
    .map(([name, v]) => ({
      name,
      role: v.role,
      n: plural(v.n, "row"),
      codes: [...v.codes].sort().join(", ") || "none reported",
      net: v.net,
      netLabel: `${v.net > 0 ? "+" : v.net < 0 ? "−" : ""}${Math.abs(Math.round(v.net)).toLocaleString()} sh`,
      arrow: v.net > 0 ? "▲" : v.net < 0 ? "▼" : "",
    }));
  const peopleNote =
    "Net shares across every code, so a vesting and the shares withheld to pay its tax both " +
    "count. A negative net is not necessarily selling — it is most often tax withholding.";

  // ---------------------------------------------------------------- filing latency (Form 4)
  const lags = ledger
    .filter((r) => r.lagLabel !== "—")
    .map((r) => Number.parseInt(r.lagLabel, 10))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  const medBd = lags.length ? lags[Math.floor(lags.length / 2)] : 0;
  const lagCounts = new Map<number, number>();
  for (const n of lags) lagCounts.set(n, (lagCounts.get(n) ?? 0) + 1);
  const lagBins = [...lagCounts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([d, n]) => ({ label: String(d), n, median: d === medBd }));
  const lagNote = lags.length
    ? `Transaction date to filing date, ${plural(lags.length, "Form 4 row")} only — the ` +
      "two-business-day rule is Form 4's; a Form 3 has ten days and a Form 5 forty-five, so " +
      "binning them together would call a timely filing late. Weekends are excluded, market " +
      "holidays are not, so a row at 3 bd may have met the deadline."
    : "No Form 4 row in this window carried both a transaction date and a filing date.";

  // ---------------------------------------------------------------- peer ratio
  const ratio = toInsiderPeerRatio(peerRatio);

  // ---------------------------------------------------------------- Form 144
  const f144: {
    ok: boolean;
    note: string;
    notices: InsiderNotice[];
    truncated?: boolean;
  } =
    notices?.status === "ok"
      ? {
          ok: true,
          truncated: notices.truncated,
          notices: notices.notices.map((n) => ({
            date: n.filed ?? "",
            form: n.form,
            accession: n.accession,
          })),
          note:
            `${plural(notices.count, "notice")} of proposed sale filed` +
            (notices.covered_from && notices.covered_to
              ? ` in the indexed window, ${humanDate(notices.covered_from)} – ${humanDate(notices.covered_to)}. `
              : ". ") +
            (notices.cannot ?? ""),
        }
      : {
          ok: false,
          notices: [],
          note:
            notices?.reason ??
            "We have not indexed this company's filings, so we have not looked for a Form 144 — " +
              "which is not the same as finding none.",
        };

  return {
    ok: true as const,
    reason: null as string | null,
    window,
    links,
    tiles: [
      {
        k: "Transaction rows",
        v: String(rows.length),
        sub: `${holdings} holding + ${derivative} derivative excluded`,
      },
      {
        k: "Acquisitions / dispositions",
        v: `${acqCount} / ${dispCount}`,
        sub: "direction of shares, not intent",
      },
      {
        k: "Open-market (P/S)",
        v:
          summary
            ? `${summary.open_market_purchases} / ${summary.open_market_sales}`
            : "N/A",
        sub: "the only rows that are decisions",
      },
      {
        k: "Flagged 10b5-1",
        v: summary?.plan_known
          ? `${summary.plan_flagged} of ${summary.plan_known}`
          : "N/A",
        sub: summary?.plan_known ? "pre-arranged, adoption date not filed" : "no plan box on these forms",
      },
    ],
    rows: ledger,
    sharesSplit,
    splitNote,
    acqCount,
    dispCount,
    codeMix,
    people,
    peopleNote,
    lagBins,
    medBd,
    lagNote,
    ratio,
    f144,
    forms: FORM_DUTIES,
    limits: INSIDER_LIMITS,
  };
}

export interface InsiderLedgerRow {
  person: string; role: string; code: string; codeShort: string;
  shares: number; sharesLabel: string; side: "in" | "out"; planLabel: string;
  tDate: string; fDate: string; lagLabel: string; lagLate: boolean;
}
export interface InsiderSplit {
  label: string; sh: number; pct: number; color: string; shLabel: string; pctLabel: string;
}
export interface InsiderCodeMix {
  code: string; label: string; what: string; n: number; shLabel: string; w: string;
  dim: string; note: string;
}
export interface InsiderPerson {
  name: string; role: string; n: string; codes: string; net: number; netLabel: string; arrow: string;
}
export interface InsiderNotice { date: string; form: string; accession: string }

const FORM_DUTIES = [
  { k: "Form 3", when: "10 days of becoming an insider", what: "Initial statement of ownership" },
  { k: "Form 4", when: "2 business days", what: "A reportable transaction" },
  { k: "Form 5", when: "45 days after fiscal year end", what: "Deferred or exempt transactions" },
  { k: "Form 144", when: "at or before the sale order", what: "Notice of a PROPOSED sale" },
];

const INSIDER_LIMITS = [
  "Whether a sale was a view on the company. Codes report mechanics, never motive.",
  "When a Rule 10b5-1 plan was adopted. Form 4 flags that a trade was pre-arranged and no more.",
  "What a Form 144 proposed. We index that one exists and its date; the shares and broker are in its contents, which we do not parse.",
  "Anything about a holder who is not a Section 16 insider — this is officers, directors and 10% owners only.",
];

/* ------------------------------------------------------------ §05.4 insider transactions */

interface InsiderSummaryResponse {
  cik: number;
  filings: number;
  transactions: number;
  window_start: string | null;
  window_end: string | null;
  acquisitions: number;
  dispositions: number;
  net: number;
  direction: string;
  open_market_purchases: number;
  open_market_sales: number;
  plan_flagged: number;
  plan_known: number;
  holdings_excluded: number;
  derivative_excluded: number;
  derivative_unknown: number;
  recent: {
    owner_name: string | null;
    owner_relationship: string | null;
    transaction_date: string | null;
    shares: number | null;
    acquired_disposed: string | null;
    transaction_code: string | null;
    code_short: string | null;
    code_label: string | null;
    rule_10b5_1: boolean | null;
    form_type: string | null;
  }[];
  status: string;
  reason: string | null;
}

/**
 * §05.4, Section 16 activity over the filings we read.
 *
 * **The window is filings, not days** (operator ruling 2026-08-04). The design asked for
 * "trailing 90 days"; the endpoint is bounded by filing count, and ten filings is six days at
 * NVIDIA and eight months at Atlantic American — whose newest Form 4 was filed in February 2023.
 * The hint states the span the filings turned out to cover, so a three-year-old window cannot
 * read as a recent one.
 *
 * **The headline counts are the A/D flag and the note names what that includes** (operator
 * ruling 2026-08-04). Vesting is an acquisition and the shares withheld to pay its tax are a
 * disposition — real events, but not decisions. The open-market subset (codes P and S) sits in
 * the footer, which is why Apple reads "6 acquisitions" above and "0 purchases" below: every one
 * of those six was an option exercise.
 *
 * The tally itself lives server-side in `normalize/insider_summary.py`, because getting it wrong
 * is quiet: an option exercise files two rows, and counting both turns one event into two.
 */
function toInsiderSummary(res: InsiderSummaryResponse | null) {
  const ok = res?.status === "ok" && !!res.transactions;
  if (!res || !ok) {
    return {
      ok: false as const,
      window: "no Form 3/4/5 filings read",
      reason:
        res?.reason ??
        "Section 16 filings could not be read for this company just now.",
      buy: null as number | null,
      sell: null as number | null,
      net: "N/A",
      dir: "",
      rows: [] as {
        off: string;
        role: string;
        type: string;
        typeFull: string;
        shares: string;
        date: string;
        plan: boolean | null;
      }[],
      openMarket: "",
      plans: "",
    };
  }

  const span =
    res.window_start && res.window_end
      ? res.window_start === res.window_end
        ? humanDate(res.window_start)
        : `${humanDate(res.window_start)} – ${humanDate(res.window_end)}`
      : "dates not reported";

  // "0 purchases" is a finding, not a gap — it says every acquisition in the window was a grant,
  // an exercise or a gift. So it is stated as a number, never suppressed into an empty state.
  const openMarket =
    `Of these, ${plural(res.open_market_purchases, "purchase")} and ` +
    `${plural(res.open_market_sales, "sale")} were open-market (codes P/S); the rest are ` +
    "grants, option exercises, vesting and tax withholding.";

  // The flag needs its denominator: pre-2022 filings predate the Form 4 box, so "0 under a plan"
  // would claim every trade was discretionary when nobody classified any of them.
  const plans = res.plan_known
    ? `${res.plan_flagged} of ${res.plan_known} were flagged as made under a Rule 10b5-1 plan — ` +
      "the flag reports a trade was pre-arranged, never when the plan was adopted."
    : "None of these filings carry the Rule 10b5-1 box, which was added to Form 4 in 2022.";

  return {
    ok: true as const,
    window: `${plural(res.filings, "filing")} · ${span}`,
    reason: null as string | null,
    buy: res.acquisitions,
    sell: res.dispositions,
    net: `${res.net > 0 ? "+" : res.net < 0 ? "−" : ""}${Math.abs(res.net)}`,
    dir: res.direction,
    rows: res.recent.map((r) => ({
      off: r.owner_name ?? "Name not reported",
      role: r.owner_relationship ?? "",
      type: r.code_short
        ? `${r.code_short} (${r.transaction_code})`
        : r.transaction_code
          ? `code ${r.transaction_code}`
          : "code not reported",
      typeFull: r.code_label ?? "This code is not in the Form 4 legend.",
      shares: r.shares === null ? "shares N/A" : `${r.shares.toLocaleString()} sh`,
      date: r.transaction_date ?? "date N/A",
      plan: r.rule_10b5_1,
    })),
    openMarket,
    plans,
  };
}

/* ------------------------------------------------------------ §07 obligations & contingencies */

/**
 * §07's three buildable cards. The legal-proceedings table is NOT among them.
 *
 * **This is the lowest-coverage section on the page and it will usually be empty.** Measured over
 * 485 filers with FY2023+ facts: purchase commitments 25%, restructuring 26%, guarantees 20%,
 * environmental 8%. That is the honest state of the disclosure, not a gap in the mapping — most
 * filers write these in the footnote's prose, which is permitted. Each card carries the reason.
 *
 * **A reported zero is not an absence.** AMD tags `PurchaseObligationDueAfterFifthYear` as exactly
 * 0 and `RestructuringCharges` as exactly 0. Those are disclosures — the filer said "nothing due
 * beyond five years" — and they must render as 0, not as N/A. `groupValues.num` returning `0` and
 * returning `null` are different answers and are kept apart here for the same reason the reverse
 * rule exists everywhere else on the page.
 *
 * **Letters of credit sit in the off-balance-sheet slot, not with guarantees** (operator ruling
 * 2026-08-04). A standby letter of credit is a bank undertaking bought by the filer; a guarantee
 * is a promise the filer made. Folding them together would quadruple the guarantee figure's
 * apparent coverage by counting a different instrument.
 */
function toObligationCards(res: FootnotesResponse | null) {
  const empty = { ok: false, reason: null as string | null, num: () => null, money: () => "N/A" };
  const commit = res ? groupValues(res, "purchase_commitments") : empty;
  const restr = res ? groupValues(res, "restructuring") : empty;
  const guar = res ? groupValues(res, "guarantees") : empty;
  const legal = res ? groupValues(res, "legal_proceedings") : empty;
  const legalGroup = res?.groups.find((g) => g.group === "legal_proceedings");

  const ladder = [
    ["Year 1", "purchase_obligation_y1"], ["Year 2", "purchase_obligation_y2"],
    ["Year 3", "purchase_obligation_y3"], ["Year 4", "purchase_obligation_y4"],
    ["Year 5", "purchase_obligation_y5"], ["Thereafter", "purchase_obligation_thereafter"],
  ] as const;
  const rows = ladder.filter(([, c]) => commit.num(c) !== null);
  const max = Math.max(0, ...rows.map(([, c]) => Math.abs(commit.num(c) ?? 0)));

  // Whether the ladder accounts for the total. AMD's six rungs sum exactly to its $12.166B; most
  // filers tag one or the other and never both. Stated, never silently assumed -- and never
  // patched with a plug row to make it close.
  const laddered = rows.reduce((sum, [, c]) => sum + (commit.num(c) ?? 0), 0);
  const total = commit.num("purchase_obligation");
  const reconciles =
    rows.length > 0 && total !== null && Math.abs(laddered - total) <= Math.abs(total) * 0.01;

  const positions = restr.num("restructuring_positions");

  return {
    commitments: rows.map(([y, c]) => ({
      y,
      amt: commit.money(c),
      w: barWidth(commit.num(c), max),
    })),
    purchase: commit.money("purchase_obligation"),
    purchaseNote: !commit.ok
      ? (commit.reason ?? "Not disclosed in a tagged form by this filer.")
      : rows.length === 0
        ? "The filer tagged a total but not the year-by-year split; about one filer in twenty tags the ladder."
        : reconciles
          ? "The years above sum to the total."
          : total === null
            ? "The filer tagged the ladder but no total, so none is shown rather than summed for it."
            : rows.length < ladder.length
              ? // Apple tags the total and the "after five years" rung and nothing between them.
                // That is a PARTIAL ladder, not a filing that disagrees with itself, and saying
                // the rows "do not sum" would read as an inconsistency the filer did not make.
                `The filer tagged ${rows.length} of the ${ladder.length} rungs, so the years above are part of the total rather than all of it.`
              : "The years above do not sum to the total — the filer tagged the two separately, and we do not reconcile them.",
    restructuring: restr.ok
      ? {
          active: true as const,
          charge: restr.money("restructuring_charge"),
          accrual: restr.money("restructuring_reserve"),
          paid: restr.money("restructuring_paid"),
          // A COUNT, never formatted as currency. "employee"-unit facts and USD ones share a card.
          heads: positions === null ? "N/A" : `${positions.toLocaleString()} positions`,
        }
      : { active: false as const },
    restructuringReason: restr.ok ? null : restr.reason,
    guarantees: guar.money("guarantee_obligations"),
    environmental: guar.money("environmental_accrual"),
    offBS: guar.money("letters_of_credit"),
    offBSLabel: "Letters of credit outstanding",
    guaranteesReason: guar.ok ? null : guar.reason,
    // §07.1's ONE structured column. The other three — the matter, its stage, its age — are Item 3
    // narrative, so the card reports the accrual alone rather than a table it cannot fill.
    //
    // The absence is the common case and is NOT a zero: of the four best-known filers checked,
    // none tags a recorded accrual. What JNJ and Pfizer tag instead is adjacent and different —
    // damages AWARDED against them, a loss recognised IN THE PERIOD, an exposure IN EXCESS OF the
    // accrual — and mapping any of those in would report something else under this heading.
    legalAccrual: legal.money("loss_contingency_accrual"),
    legalOk: legal.ok,
    legalReason: asCopy(legal.reason),
    // When the group is `na` the route uses the standing note AS the reason, so carrying both
    // prints the same paragraph twice. The note is the accrual's bound; the reason is the absence's
    // explanation. Where they are the same string only one is a note.
    legalNote:
      legalGroup?.note && legalGroup.note !== legalGroup.reason ? asCopy(legalGroup.note) : null,
    legalSource: legal.ok
      ? [legalGroup?.form, legalGroup?.filed ? fmtFiled(legalGroup.filed) : null]
          .filter(Boolean)
          .join(" · ")
      : null,
  };
}

/* ------------------------------------------------------------ §06 accounting quality & audit */

interface AuditResponse {
  auditor: {
    status: string;
    reason: string | null;
    name?: string | null;
    pcaob_firm_id?: string | null;
    location?: string | null;
    icfr_auditor_attestation?: boolean | null;
  };
  auditor_continuity?: {
    status: string;
    reason?: string | null;
    auditor?: string | null;
    since?: string | null;
    since_is_a_change?: boolean;
    years?: number | null;
    indexed_from?: string | null;
    indexed_to?: string | null;
    indexed_filings?: number | null;
  };
  audit_events: {
    status: string;
    reason?: string | null;
    indexed_filings?: number;
    covered_from?: string | null;
    covered_to?: string | null;
    events: { kind: string; item: string; filed: string | null; accession: string }[];
    late_filings: { form: string; filed: string | null }[];
  };
  cybersecurity?: {
    status: string;
    reason: string | null;
    materially_affected: boolean | null;
    processes_integrated: boolean | null;
    third_party_engaged: boolean | null;
    positions_responsible: boolean | null;
    reports_to_board: boolean | null;
    third_party_oversight: boolean | null;
  };
  clawback?: {
    status: string;
    reason: string | null;
    error_correction: boolean | null;
    recovery_analysis: boolean | null;
    period_end: string | null;
  };
  extension_tags: {
    status: string;
    reason: string | null;
    distinct?: number;
    facts?: number;
    total_facts?: number;
    share?: number | null;
    top?: { name: string; count: number }[];
  };
  critical_audit_matters: { status: string; reason: string };
  critical_accounting_estimates: { status: string; reason: string };
  filing?: { form: string | null; filed: string | null; accession: string | null } | null;
}

/** How many rows each capped column on §08 shows. */
const FORM_ROWS = 6;
const ITEM_ROWS = 7;

/**
 * What a capped column left out, or null when it left out nothing.
 *
 * There are TWO caps in series and both must be counted, which is the whole reason this is a
 * function. The route returns only its own top slice and reports the rest as a residual; the card
 * then shows fewer rows still. Counting only the card's cap understates the remainder badly —
 * NVIDIA reads as "2 further form types (15 filings)" when the truth is 24 types and 79 filings —
 * and a note that undercounts is worse than no note, because it asserts a completeness that the
 * uncounted tail contradicts.
 */
function restNote(
  all: { count: number }[],
  cap: number,
  residual: { types: number; count: number },
  kind: string,
  unit: string,
): string | null {
  const beyondCap = all.slice(cap);
  const types = beyondCap.length + residual.types;
  if (!types) return null;
  const n = beyondCap.reduce((sum, r) => sum + r.count, 0) + residual.count;
  return `${types} further ${kind}${types === 1 ? "" : "s"} (${n.toLocaleString()} ${unit}${n === 1 ? "" : "s"}) not shown.`;
}

/**
 * Where a non-reliance restatement lands on a series' own period axis.
 *
 * An Item 4.02 8-K is dated by when it was FILED, and the chart's x-axis is fiscal periods — so a
 * mark goes on the first period that ENDED on or after the filing, which is the earliest period a
 * reader could have been looking at when the warning appeared. It is never placed on the period
 * the restatement was *about*: the 8-K's body says which periods those are, and that is prose.
 *
 * An event before the visible range is dropped rather than clamped to the first point, which
 * would move a real date onto a period it did not happen in.
 */
async function restatementMarks(
  auditP: Promise<AuditResponse | null>,
  pts: { period_end?: string | null }[],
): Promise<{ i: number; tag: string }[]> {
  const audit = await auditP;
  const evs = (audit?.audit_events?.events ?? []).filter((e) => e.kind === "non_reliance_restatement");
  const marks: { i: number; tag: string }[] = [];
  for (const e of evs) {
    if (!e.filed) continue;
    const i = pts.findIndex((p) => (p.period_end ?? "") >= e.filed!);
    if (i >= 0) marks.push({ i, tag: "non-reliance restatement" });
  }
  return marks;
}

/* ------------------------------------------------------- financial history: the real catalogue */

interface ConceptSeriesResponse {
  concept: string;
  label: string;
  unit: string | null;
  kind: "flow" | "stock" | null;
  source_tag: string | null;
  is_extension: boolean;
  frequency: string;
  restatement_basis: string;
  reason: string | null;
  points: { fiscal_year: number; fiscal_period: string; period_end: string | null; value: number | null }[];
}

/**
 * What the financial-history picker offers, and where each entry actually comes from.
 *
 * TWO backends, because a line item and a ratio are different things: the 30 computed metrics come
 * from `/metrics/{key}/history`, the statement line items from `/concept-series`. Both share a
 * period axis and a point shape, so overlaying one on the other is safe.
 *
 * **The fixture this replaced offered 25 entries and drew a seeded random walk for every one of
 * them.** Two are gone rather than faked:
 *
 *  - *Risk factor count* — Item 1A is narrative; there is no structured source and no plan for one.
 *  - Nothing else. *Employees* stays despite being tagged by 2.2% of filers (operator ruling
 *    2026-08-07): a real series for the few who tag it and an explained absence for the rest.
 *
 * Two labels changed because the fixture's were wrong about what the data is — `cash` is cash and
 * equivalents (short-term investments are a separate concept the filer tags separately), and
 * `debt` is long-term debt (no filer tags a single "total debt" figure; the metrics engine builds
 * one by adding the current portion, which is a DERIVED number and not a line item).
 */
export const HISTORY_METRICS: {
  id: string;
  label: string;
  group: string;
  source: "concept" | "metric";
  key: string;
}[] = [
  { id: "rev", label: "Revenue", group: "Income statement", source: "concept", key: "revenue" },
  { id: "gm", label: "Gross margin", group: "Income statement", source: "metric", key: "gross_margin" },
  { id: "opm", label: "Operating margin", group: "Income statement", source: "metric", key: "operating_margin" },
  { id: "cogs", label: "Cost of revenue", group: "Income statement", source: "concept", key: "cost_of_revenue" },
  { id: "gp", label: "Gross profit", group: "Income statement", source: "concept", key: "gross_profit" },
  { id: "rd", label: "R&D expense", group: "Income statement", source: "concept", key: "research_and_development" },
  { id: "sga", label: "SG&A expense", group: "Income statement", source: "concept", key: "sga_expense" },
  { id: "oi", label: "Operating income", group: "Income statement", source: "concept", key: "operating_income" },
  { id: "ni", label: "Net income", group: "Income statement", source: "concept", key: "net_income" },
  { id: "eps", label: "Diluted EPS", group: "Income statement", source: "metric", key: "eps_diluted" },

  { id: "cfo", label: "Cash from operations", group: "Cash flow", source: "concept", key: "cash_from_operations" },
  { id: "capex", label: "Capital expenditures", group: "Cash flow", source: "concept", key: "capital_expenditures" },
  { id: "fcf", label: "Free cash flow", group: "Cash flow", source: "metric", key: "fcf" },
  { id: "buyback", label: "Share repurchases", group: "Cash flow", source: "concept", key: "share_repurchases" },

  { id: "cash", label: "Cash & equivalents", group: "Balance sheet", source: "concept", key: "cash_and_equivalents" },
  { id: "inv", label: "Inventories", group: "Balance sheet", source: "concept", key: "inventory" },
  { id: "debt", label: "Long-term debt", group: "Balance sheet", source: "concept", key: "long_term_debt" },
  { id: "defrev", label: "Deferred revenue", group: "Balance sheet", source: "concept", key: "deferred_revenue" },

  { id: "rpo", label: "Remaining perf. obligations", group: "Footnote", source: "concept", key: "rpo_total" },
  { id: "sbc", label: "Stock compensation", group: "Footnote", source: "concept", key: "share_based_compensation" },
  { id: "etr", label: "Effective tax rate", group: "Footnote", source: "concept", key: "effective_tax_rate" },
  { id: "legal", label: "Legal accruals", group: "Footnote", source: "concept", key: "loss_contingency_accrual" },

  { id: "shares", label: "Diluted shares", group: "Cover page", source: "metric", key: "share_count" },
  { id: "heads", label: "Employees", group: "Cover page", source: "concept", key: "employees" },
];

/** EDGAR names the Section 16 ownership forms and the proposed-sale notice by bare number — `3`,
 * `4`, `5`, `144`, and their `/A` amendments. In a column beside counts those read as numbers
 * rather than as names, so they get the word EDGAR itself uses. Display only: the form string the
 * API returned is unchanged, and nothing is renamed except by prefix. */
function formName(form: string): string {
  return /^\d+(\/A)?$/.test(form) ? `Form ${form}` : form;
}

/** `"2026-07-29" → "29 Jul 2026"`. A filing date is known to the day, so unlike an index edge it
 * is shown to the day. */
function fmtFiled(iso?: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  const names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${Number(d)} ${names[Number(m) - 1] ?? ""} ${y}`;
}

/** API `reason` strings are authored in Python, where the repo writes an em dash as ASCII `--`.
 * That is correct in source and reads as a typo once rendered, so it is converted here — at the
 * boundary where a reason stops being data and becomes copy. */
function asCopy(reason?: string | null): string | null {
  return reason ? reason.replace(/\s--\s/g, " — ") : (reason ?? null);
}

/** `"2015-06-01" → "Jun 2015"`. Month granularity: the floor is the edge of the INDEX, not an
 * event, so a day would imply precision about the auditor that the date does not carry. */
function monthYear(iso?: string | null): string {
  if (!iso) return "";
  const [y, m] = iso.split("-");
  const names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${names[Number(m) - 1] ?? ""} ${y}`.trim();
}

/** `"2015-06-01" → "2015"`. Only the year, because a window is a range, not a date. */
function windowYears(from?: string | null, to?: string | null): string {
  if (!from || !to) return "the filings indexed";
  const a = from.slice(0, 4);
  const b = to.slice(0, 4);
  return a === b ? a : `${a}–${b}`;
}

/**
 * A camelCase-ish XBRL element name split into readable words.
 *
 * These are the registrant's OWN tag names, which is the whole point of showing them — they read
 * like `OffBalanceSheetLendingRelatedFinancialInstrumentsContractualAmount`, and a filer that
 * needed to invent that has departed from the standard taxonomy in a way worth seeing.
 */
function readableTag(name: string): string {
  return name.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
}

/**
 * §06, three separately-sourced answers and two honest refusals.
 *
 * **The auditor and the extension census are real** — both read from the 10-K's extracted XBRL
 * instance (`sec/cover.py`), which is tagged facts in an XML file, not a parsed document.
 *
 * **Every absence here names its window.** "No auditor change" is only ever true of the filings
 * we indexed, and those windows differ wildly between filers: Apple's index reaches back to 2015,
 * Atlantic American's to 1995, and JPMorgan's covers ONE YEAR because it files thousands of 424B2s
 * that fill EDGAR's rolling window. A card that said "no auditor change on file" without the years
 * would be making a much bigger claim for JPMorgan than the data supports.
 *
 * **Two things this deliberately refuses to say.** Auditor TENURE is not in any SEC source (it is
 * in PCAOB Form AP, and the PCAOB firm id shown beside the firm is the join key to it). And
 * `IcfrAuditorAttestationFlag` is NOT the Item 9A conclusion — it says the control is subject to
 * attestation, not that it was effective — so the ICFR line reports the boundary instead.
 */
function toAuditCards(res: AuditResponse | null) {
  const ev = res?.audit_events;
  const window = windowYears(ev?.covered_from, ev?.covered_to);
  const indexed = ev?.status === "ok";

  const changes = (ev?.events ?? []).filter((e) => e.kind === "auditor_change");
  const restatements = (ev?.events ?? []).filter((e) => e.kind === "non_reliance_restatement");
  const late = ev?.late_filings ?? [];

  /** "none found" only when we actually looked; otherwise say we have not looked. */
  const absence = (label: string) =>
    indexed ? `No ${label} in filings indexed ${window}` : `${label}: not indexed for this filer`;

  const a = res?.auditor;
  const auditorOk = a?.status === "ok" && !!a.name;
  const ext = res?.extension_tags;
  const extOk = ext?.status === "ok" && !!ext.total_facts;
  const sharePct = extOk && ext.share != null ? `${(ext.share * 100).toFixed(1)}%` : "N/A";

  return {
    firm: auditorOk ? (a?.name as string) : "N/A",
    firmReason: auditorOk ? null : (asCopy(a?.reason) ?? "The auditor is not tagged in this filing."),
    // The slot the fixture used for tenure. Tenure is NOT available from any SEC source, so it
    // carries the two auditor facts that are — and names the PCAOB id as an id, not a duration.
    tenure: auditorOk
      ? [a?.pcaob_firm_id ? `PCAOB firm ${a.pcaob_firm_id}` : null, a?.location]
          .filter(Boolean)
          .join(" · ") || "N/A"
      : "N/A",
    tenureReason:
      "Auditor tenure is not disclosed in any SEC filing — PCAOB Form AP carries it, and the " +
      "PCAOB firm id shown here is the key that joins to it.",
    // A FLOOR under the tenure, not the tenure. Two sentences, because the second is what stops
    // the first being read as a start date: E&Y has audited Apple since 2009 and our index reaches
    // 2015, so `since` is bounded by the index, not by the engagement.
    continuity: (() => {
      const c = res?.auditor_continuity;
      if (c?.status !== "ok" || !c.since) return null;
      return c.since_is_a_change
        ? `Signed every annual report since the Item 4.01 change of ${c.since}`
        : `Signed every annual report since at least ${monthYear(c.since)}`;
    })(),
    continuityNote: (() => {
      const c = res?.auditor_continuity;
      if (c?.status !== "ok" || !c.since) return asCopy(c?.reason);
      return c.since_is_a_change
        ? `Dated from the auditor change itself — the engagement began here.`
        : `No Item 4.01 auditor change in the ${c.years} yrs indexed. A floor, not a tenure: ` +
          `the firm may have served long before the index reaches.`;
    })(),
    fees: "N/A",
    nonAudit: "non-audit share N/A",
    feesReason:
      "Audit fees and the non-audit share are not tagged in the DEF 14A. Checked and found " +
      "absent, not assumed missing — they appear only in the proxy's fee table as prose.",
    change: changes.length
      ? `Auditor changed · 8-K Item 4.01 · ${changes[0].filed}` +
        (changes.length > 1 ? ` (+${changes.length - 1} earlier)` : "")
      : absence("auditor change"),
    // Never "ICFR effective". That conclusion is Item 9A prose; the flag we hold says something
    // narrower and is reported as what it is.
    icfr:
      a?.icfr_auditor_attestation === true
        ? "ICFR subject to auditor attestation — the effectiveness conclusion is narrative"
        : a?.icfr_auditor_attestation === false
          ? "ICFR not subject to auditor attestation — the effectiveness conclusion is narrative"
          : "ICFR effectiveness is narrative (Item 9A) — not tagged",
    icfrReason:
      "IcfrAuditorAttestationFlag means the control is SUBJECT TO attestation. It does not say " +
      "internal control was effective and it does not say no material weakness was found — " +
      "both of those are the Item 9A narrative conclusion.",
    restate: restatements.length
      ? `Non-reliance restatement · 8-K Item 4.02 · ${restatements[0].filed}`
      : absence("non-reliance restatement"),
    late: late.length
      ? `${late.length} Form 12b-25 filed · latest ${late[0].filed}`
      : absence("Form 12b-25"),
    windowNote: indexed
      ? `Absences above are over the ${ev?.indexed_filings ?? 0} filings EDGAR lists for this ` +
        `filer (${ev?.covered_from} to ${ev?.covered_to}). That is a rolling window, not the ` +
        "company's whole history."
      : (ev?.reason ?? null),
    // The non-GAAP slot, re-pointed (operator ruling 2026-08-03). NOT a non-GAAP count.
    nonGaap: {
      count: extOk ? (ext?.distinct as number) : 0,
      recur: sharePct,
      items: extOk
        ? (ext?.top ?? [])
            .slice(0, 3)
            .map((t) => readableTag(t.name).toLowerCase())
            .join("; ")
        : "N/A",
    },
    extensionsOk: extOk,
    extensionsReason: extOk ? null : (asCopy(ext?.reason) ?? "No annual report is indexed for this filer."),
    camsReason: asCopy(res?.critical_audit_matters?.reason),
    estimatesReason: asCopy(res?.critical_accounting_estimates?.reason),
    filing: res?.filing ?? null,
  };
}

/* ------------------------------------------------------------ §04 capital structure */

interface CapitalResponse {
  fiscal_year: number;
  groups: {
    group: string;
    label: string;
    status: string;
    reason: string | null;
    note?: string;
    coverage: number;
    lines: { canonical_concept: string; label: string; value: number | null; unit: string }[];
  }[];
}

/** Share counts read in millions/billions, not dollars — `usdCompact` would prefix a `$`. */
function shareCount(v: number | null): string {
  if (v === null) return "N/A";
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  return v.toLocaleString();
}

/**
 * §04's three cards from the capital groups.
 *
 * What this deliberately does NOT build:
 *
 * **The dilution percentage.** Options + unvested over shares outstanding is one division, and
 * the adapter is allowed to derive (the FCF ruling). It is left underived because the NUMERATOR
 * IS USUALLY PARTIAL: the unvested-award count is tagged by 13% of recent filers. A percentage
 * computed from options alone would read as total overhang and understate it, and no chip can fix
 * a number that is quietly measuring something narrower than its label.
 *
 * **A roll-forward that closes.** Opening + issued − repurchased = closing needs every movement
 * tagged; they are not. The movements the filer reported are shown as rows, with no balancing
 * plug and no total that implies arithmetic nobody filed.
 *
 * **Class structure and insider ownership** stay on their existing states: the `ClassOfStock`
 * axis is dimensional (Phase C) and votes-per-share is charter prose, while the beneficial
 * ownership table was verified absent from the tagged DEF 14A.
 */
function toCapitalCards(res: CapitalResponse) {
  const g = (key: string) => {
    const grp = res.groups.find((x) => x.group === key);
    const by = new Map((grp?.lines ?? []).map((l) => [l.canonical_concept, l]));
    return {
      ok: grp?.status === "ok",
      reason: grp?.reason ?? null,
      coverage: grp?.coverage ?? 0,
      num: (c: string) => by.get(c)?.value ?? null,
    };
  };
  const roll = g("share_rollforward");
  const dil = g("dilution");
  const buy = g("buyback");

  /* Only the movements that RESOLVED become rows. An absent movement is omitted rather than
     shown as a zero — "no shares were repurchased" and "the filer did not tag repurchases" are
     different statements, and a 0 makes the second look like the first. */
  const rollRows: { k: string; v: string }[] = [];
  const push = (k: string, concept: string) => {
    const v = roll.num(concept);
    if (v !== null) rollRows.push({ k, v: shareCount(v) });
  };
  push("Shares issued", "shares_issued");
  push("Shares outstanding", "shares_outstanding");
  push("Issued on option exercise", "shares_issued_options_exercised");
  push("Issued, new issues", "shares_issued_new");
  push("Repurchased", "shares_repurchased_count");

  return {
    roll: rollRows,
    rollReason: roll.ok ? null : roll.reason,
    overhang: {
      opts: shareCount(dil.num("options_outstanding")),
      rsu: shareCount(dil.num("unvested_awards")),
      // Not derived — see the docstring. The numerator is partial for most filers.
      pct: "N/A",
      reason: dil.ok ? null : dil.reason,
    },
    buyback: {
      auth: buy.num("buyback_authorized") === null ? "N/A" : usdCompact(buy.num("buyback_authorized")!),
      remaining:
        buy.num("buyback_remaining") === null ? "N/A" : usdCompact(buy.num("buyback_remaining")!),
      qtr: buy.num("share_repurchases") === null ? "N/A" : usdCompact(buy.num("share_repurchases")!),
      src: `FY${res.fiscal_year} · cash flow statement`,
      shares: shareCount(buy.num("shares_repurchased_count")),
      reason: buy.ok ? null : buy.reason,
    },
  };
}

/* ------------------------------------------------------------ §01.13 subsidiaries */

interface SubsidiariesResponse {
  status: string;
  reason: string | null;
  has_ownership: boolean;
  cannot: string;
  subsidiaries: { name: string; jurisdiction: string | null; ownership: string | null }[];
  filing?: { form: string; filed: string; accession: string; exhibit_url?: string };
}

/* ------------------------------------------------------------ §02.6 snapshot tiles */

interface MetricsResponse {
  metrics: {
    metric: string; label: string; value: number | null; unit: string;
    basis: string | null; status: string; reason: string | null;
  }[];
}
interface MetricHistoryResponse {
  metric: string; label: string; unit: string;
  restatement_basis?: string;
  points: {
    fiscal_year: number; fiscal_period: string; value: number | null; status: string;
    period_end?: string | null;
  }[];
}

/**
 * The eight snapshot tiles, and where each one really comes from.
 *
 * Two are `null` on purpose. "Cash & ST inv." and "Total debt" each name a figure no filer files
 * as one line — cash plus marketable securities, long-term plus current debt. Summing two
 * reported numbers to fill a tile would put a figure on the page that nobody reported under a
 * label that says they did. Same rule as the statement rows; free cash flow remains the single
 * sanctioned derivation, and here it does not even need deriving because `/metrics` serves it.
 */
const SNAPSHOT_TILES: {
  label: string;
  src: string;
  /** A canonical concept from the condensed INCOME statement. */
  concept?: string;
  /** A metric key, read from `/metrics/{metric}/history`. */
  metric?: string;
  /** The metric key carrying this tile's year-over-year change, where the API computes one. */
  growth?: string;
  reason?: string;
}[] = [
  { label: "Revenue", src: "Income stmt", concept: "revenue", growth: "revenue_growth_yoy" },
  { label: "Gross margin", src: "derived · IS", metric: "gross_margin" },
  { label: "Operating margin", src: "derived · IS", metric: "operating_margin" },
  { label: "Net income", src: "IS", concept: "net_income", growth: "earnings_growth_yoy" },
  { label: "Free cash flow", src: "CFO − capex", metric: "fcf" },
  {
    label: "Cash & ST inv.", src: "Balance sheet",
    reason: "Cash and short-term investments are filed as separate lines. Adding them here would put a total on the page that nobody reported.",
  },
  {
    label: "Total debt", src: "Balance sheet",
    reason: "No filer reports one total-debt line; it would mean adding long-term to current debt.",
  },
  { label: "Diluted shares", src: "Cover · 10-Q", concept: "shares_diluted" },
];

/** Tile value formatting, by unit. A ratio is a percentage; everything else keeps its magnitude. */
function tileValue(v: number | null, unit: string): string {
  if (v === null || v === undefined) return "N/A";
  if (unit === "ratio") return `${(v * 100).toFixed(1)}%`;
  if (unit === "shares") return compactNumber(v);
  return usdCompact(v);
}


/**
 * One tile per spec. A tile with no source renders N/A and says why, rather than vanishing.
 *
 * The YoY line is shown ONLY where the API computes a growth metric for it. Working the change
 * out from the spark would be arithmetic on numbers we were given — the thing the adapter does
 * not do — and an arrow is a claim about direction whether or not it looks like one.
 */
function buildSnapshot(
  income: CondensedResponse,
  metrics: MetricsResponse,
  histories: MetricHistoryResponse[],
): hub.SnapshotTile[] {
  const byMetric = new Map(metrics.metrics.map((m) => [m.metric, m]));
  const byHistory = new Map(histories.map((h) => [h.metric, h]));
  const byConcept = new Map(income.rows.map((r) => [r.canonical_concept, r]));

  return SNAPSHOT_TILES.map((t) => {
    let value = "N/A";
    let spark: number[] = [];
    let unit = "USD";

    if (t.metric) {
      const h = byHistory.get(t.metric);
      const m = byMetric.get(t.metric);
      unit = h?.unit ?? m?.unit ?? "USD";
      spark = (h?.points ?? []).slice(-8).map((p) => p.value).filter((v): v is number => v !== null);
      value = tileValue(m?.value ?? spark[spark.length - 1] ?? null, unit);
    } else if (t.concept) {
      const row = byConcept.get(t.concept);
      unit = row?.unit ?? "USD";
      spark = (row?.values ?? []).filter((v): v is number => v !== null);
      value = tileValue(row?.values[row.values.length - 1] ?? null, unit);
    }

    /*
     * The BASIS, carried on the tile.
     *
     * Free cash flow reads $123B here and $51.6B in the statement two cards up — the tile is TTM,
     * the statement row is one quarter. Both correct, and a reader seeing the same name twice with
     * different numbers would reasonably conclude one is wrong. The design has no slot for a basis
     * line, so it rides the value's title rather than changing the layout.
     */
    const basis = t.metric ? byMetric.get(t.metric)?.basis : null;
    const note = t.reason ?? (basis ? `${basis} basis — ${t.src}.` : null);

    const growth = t.growth ? byMetric.get(t.growth) : undefined;
    const yoy =
      growth && growth.value !== null && growth.status === "ok"
        ? `${growth.value >= 0 ? "↑ +" : "↓ −"}${Math.abs(growth.value * 100).toFixed(1)}% YoY`
        : "";

    return { label: t.label, src: t.src, value, yoy, spark, reason: note ?? undefined } as hub.SnapshotTile;
  });
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
      vals: res.columns.slice(-4).map((_c, j) => {
        const i = res.columns.length - 4 + j;
        if (spec.compute) return statementValue(spec.compute(valueAt(i)), "USD");
        return row ? statementValue(row.values[i], row.unit) : "N/A";
      }),
    };
  });
}


/* ------------------------------------------------------------------ institutional: the register */

interface PeriodsResponse {
  cik: number;
  periods: string[];
  period_meta: {
    as_of: string;
    filed_earliest: string | null;
    filed_latest: string | null;
    deadline: string | null;
    deadline_days: number | null;
    days_after_period_end: number | null;
  };
  caveats: string[];
}

interface FiledSinceResponse {
  period: string;
  filings: { form: string; filer: string | null; filed: string | null; shares: number | null;
             what: string | null; accession: string | null }[];
  filing_count: number;
  does_not_restate: boolean;
  does_not_restate_reason: string;
  register_filed_latest: string | null;
  dates_are: string;
}

interface AttributionResponse {
  period: string;
  attribution: {
    status: string;
    reason: string | null;
    formula: string;
    cannot: string;
    population: string;
    rows_are_additive: boolean;
    shares_outstanding: number | null;
    shares_outstanding_as_of: string | null;
    rows: { key: string; label: string; source: string; shares: number | null; as_of: string | null;
            holder_count: number | null; share_of_outstanding: number | null }[];
  };
}

interface RegisterResponse {
  period: string;
  period_meta: { within_deadline?: boolean; ingested_filer_count?: number } | null;
  total_reported_shares: number | null;
  excluded_holder_count: number | null;
  concentration: {
    status: string; formula: string; cannot: string; population: string;
    holder_count: number | null; hhi: number | null; effective_holders: number | null;
    gini: number | null; top1_share: number | null; top5_share: number | null;
    top10_share: number | null; managers_for_half: number | null;
  };
  composition: {
    status: string; formula: string; cannot: string; population: string;
    categories: { key: string; label: string; holder_count: number; shares: number; weight: number }[];
    classified_holder_count: number; unclassified_holder_count: number;
    unclassified_shares: number; coverage: number;
  };
  share_vector: {
    manager_cik: number; manager_name: string; shares: number; weight: number;
    cumulative: number; sic: string | null;
  }[];
  share_vector_total_rows: number;
}

interface HoldingsSeriesResponse {
  periods: string[];
  series: {
    manager_cik: number; manager_name: string;
    points: { period: string; shares: number | null; value: number | null }[];
  }[];
}

interface HoldersResponse {
  period: string;
  holders: { manager_cik: number; manager_name: string; shares: number | null; value: number | null;
             location: string | null }[];
}

interface ActivityResponse {
  from_period: string;
  to_period: string;
  activity: { manager_cik: number; manager_name: string; shares_before: number | null;
              shares_after: number | null; shares_change: number | null; action: string }[];
}

/**
 * Which quarter the register should be read at.
 *
 * NOT the newest period on file. A 13F is due 45 days after quarter end, so the newest quarter is
 * a partially-filed register until its deadline passes — measured 2026-08-10, Apple's newest
 * quarter held 817 reporting managers against 9,237 in the quarter before it, because only ~9% of
 * filers had reported. Every holder count, concentration figure and manager-mix share computed on
 * that quarter would be a statistic about who files early.
 *
 * So: if today is before the newest period's deadline, the register uses the period before it, and
 * the card names the filling quarter separately. Derived from `period_meta` rather than pinned to a
 * constant — the view previously hardcoded "2026-03-31", which is right only until it isn't.
 */
export function pickBasePeriod(
  periods: string[],
  meta: PeriodsResponse["period_meta"],
  today = new Date().toISOString().slice(0, 10),
): { base: string | null; filling: string | null } {
  if (!periods.length) return { base: null, filling: null };
  const newest = periods[0];
  const stillFilling = !!meta?.deadline && today < meta.deadline;
  if (!stillFilling) return { base: newest, filling: null };
  // Past the deadline for the previous quarter but not this one: the previous quarter is the
  // complete register, and the newest is reported as what is arriving.
  return { base: periods[1] ?? newest, filling: newest };
}

/** `"2026-03-31"` → `"31 Mar 2026"`. */
function instDate(iso?: string | null): string {
  if (!iso) return "N/A";
  const [y, m, d] = iso.split("-");
  const names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${Number(d)} ${names[Number(m) - 1] ?? ""} ${y}`;
}

function daysBetween(a?: string | null, b?: string | null): number | null {
  if (!a || !b) return null;
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

/**
 * The freshness band. Every figure below it on the page inherits this quarter's age, which is why
 * it leads the section.
 *
 * The filling quarter is reported HERE rather than silently excluded: a reader who knows Q2 exists
 * needs to see why the register does not use it yet.
 */
function toInstFreshness(
  periods: PeriodsResponse,
  base: string | null,
  filling: string | null,
  filed: FiledSinceResponse | null,
): hub.InstFreshness {
  const meta = periods.period_meta ?? ({} as PeriodsResponse["period_meta"]);
  const today = new Date().toISOString().slice(0, 10);
  const filedOn = filed?.register_filed_latest ?? meta.filed_latest ?? null;
  const age = daysBetween(base, today);
  const toDeadline = daysBetween(today, meta.deadline);
  return {
    asOfQtr: instDate(base),
    filedOn: instDate(filedOn),
    age: age === null ? "age unknown" : `${age} days old`,
    nextClose: instDate(meta.deadline),
    daysToNext: toDeadline === null ? "date unknown" : `${toDeadline} days`,
    deltaCount: filed ? String(filed.filing_count) : "N/A",
    // A RE-confirmation means a manager restating a position it already held, which needs the
    // prior position to compare against; `-filed-since` returns the filings, not that comparison.
    // Reporting the filing count here would relabel one number as a different one.
    confirmed: "N/A",
    confirmedNote:
      "a re-confirmation needs the filing matched to the position it restates, which is not derived",
    lag:
      "13F is filed up to 45 days after quarter end, so this register is a lagged snapshot, never live." +
      (filling
        ? ` ${instDate(filling)} is still being filed and is excluded from the register until ${instDate(meta.deadline)}.`
        : ""),
    scope: "Long positions in Section 13(f) securities only — no shorts, no cash, no non-US holdings.",
  };
}

/**
 * §01's arithmetic row and the filings behind it.
 *
 * **There is no adjusted register, and the tile says so in the API's own words.** A Schedule 13D/G
 * reports a total beneficial position, a Form 4 a single transaction, and a 13F a quarter-end
 * holding by a DIFFERENT population of filers; summing them would invent a share count nobody
 * filed. The endpoint refuses to derive it (`does_not_restate`), and the tile carries that refusal
 * rather than a number.
 */
function toInstSnapshot(
  base: string | null,
  filed: FiledSinceResponse | null,
  attribution: AttributionResponse | null,
  activity: ActivityResponse | null,
): hub.InstSnapshot {
  const a = attribution?.attribution;
  const inst = a?.rows.find((r) => r.key === "institutional");

  const figs = (a?.rows ?? []).map((r) => ({
    id: r.key,
    label: r.label,
    value: r.shares === null ? "N/A" : usdCompact(r.shares).replace("$", ""),
    sub:
      r.share_of_outstanding === null
        ? `${r.holder_count ?? 0} holders · source ${r.source}`
        : `${(r.share_of_outstanding * 100).toFixed(1)}% of shares outstanding · ${r.holder_count ?? 0} holders`,
    calc: {
      formula: a?.formula ?? "",
      // The single most important line in this section: these rows overlap by construction.
      note: a?.cannot ?? "",
      inputs: [
        { k: "Source", v: r.source },
        { k: "As of", v: instDate(r.as_of) },
        { k: "Holders", v: String(r.holder_count ?? "N/A") },
        { k: "Shares outstanding", v: a?.shares_outstanding ? usdCompact(a.shares_outstanding).replace("$", "") : "N/A" },
        { k: "Outstanding as of", v: instDate(a?.shares_outstanding_as_of) },
      ],
    },
  }));

  /*
   * The ten largest MOVES, and only positions reported at BOTH ends.
   *
   * Two things this deliberately does not do. It does not take the first ten rows: the endpoint
   * returns every manager in the register (5,955 for Apple) in filer order, so an unsorted head is
   * an alphabetical accident. And it does not plot an exit or a new position — those carry a null
   * on one side, and a dumbbell can only draw a number, so `?? 0` would render "Norges Bank
   * 192.3M → 0M" for a manager that simply left the register. A null is not a reported zero, and
   * for Apple's quarter 519 of 5,955 rows are one-sided. They are counted beneath the chart
   * instead.
   */
  const rows = activity?.activity ?? [];
  const moved = rows
    .filter((m) => m.shares_before != null && m.shares_after != null)
    .sort((a, b) => Math.abs(b.shares_change ?? 0) - Math.abs(a.shares_change ?? 0))
    .slice(0, 10)
    .map((m) => ({
      key: String(m.manager_cik),
      label: m.manager_name,
      prior: (m.shares_before as number) / 1e6,
      current: (m.shares_after as number) / 1e6,
    }));
  const exited = rows.filter((m) => m.action === "exited").length;
  const opened = rows.filter((m) => m.action === "new").length;

  return {
    adjusted: {
      base: inst?.holder_count ? `${inst.holder_count.toLocaleString()} managers` : "N/A",
      baseLabel: base ? `13F register at ${instDate(base)}` : "no 13F quarter on file",
      net: filed ? String(filed.filing_count) : "N/A",
      appliedCount: 0,
      deltaCount: filed?.filing_count ?? 0,
      // Deliberately not a number — see the docstring.
      value: "N/A",
      // The view renders this hint verbatim, so it carries the whole clause.
      pct: "not derived — the three form families count different populations",
      note: filed?.does_not_restate_reason ?? "",
    },
    adjustedCalc: {
      formula: "base 13F register + faster forms filed since = NOT DERIVED",
      note: filed?.does_not_restate_reason ?? "",
      inputs: [
        { k: "Base quarter", v: instDate(base) },
        { k: "Base register", v: inst?.holder_count ? `${inst.holder_count.toLocaleString()} managers` : "N/A" },
        { k: "Filings since", v: String(filed?.filing_count ?? 0) },
        { k: "Dates are", v: filed?.dates_are ?? "filing dates" },
      ],
    },
    deltaForms: (filed?.filings ?? []).map((f) => ({
      form: f.form,
      who: f.filer ?? "filer not stated",
      what: f.what ?? "position reported",
      shares: f.shares === null || f.shares === undefined ? "N/A" : usdCompact(f.shares).replace("$", ""),
      accepted: instDate(f.filed),
      // The per-form deadline is NOT stated per row: 13D and 13G share the "SC 13" prefix and have
      // different deadlines, so a prefix test asserted the 13D rule over every 13G. The cadence
      // table below states the rules once, where they can be qualified properly.
      lagRule: "see the cadence table",
      applied: "not applied to the register — see the note",
    })),
    moved,
    movedNote:
      rows.length === 0
        ? null
        : // NOT "in the register": this is the two-quarter DIFF population, which differs from the
          // single-quarter holder count on the tile above (Coca-Cola: 3,127 compared vs 3,534 held).
          `Ten largest moves of the ${rows.length.toLocaleString()} managers compared across the ` +
          `two quarters. ` +
          `${exited.toLocaleString()} exited and ${opened.toLocaleString()} opened a position this ` +
          `quarter — those report a position on one side only, so they are counted here rather ` +
          `than drawn against a zero nobody filed.`,
    /*
     * The only REGULATORY claims on this page — asserted, not derived from any filing, so they
     * are stated conservatively.
     *
     * "45 days after year end" for a 13G was the pre-2024 rule. The SEC's 2023 amendments to
     * Regulation 13D-G (compliance from late 2024, which is inside every window this page reads)
     * moved 13G onto a quarterly cycle and shortened 13D. The sub-cases differ by filer type —
     * qualified institutional versus passive versus exempt — so the rows name the cycle each form
     * runs on rather than a single number that is wrong for some filers.
     */
    cadence: [
      { form: "13F-HR", rule: "45 days after quarter end", role: "the register itself" },
      {
        form: "SC 13D",
        rule: "days after crossing 5% (shortened by the 2023 amendments)",
        role: "5%+ stake where influence over control may be sought",
      },
      {
        form: "SC 13G",
        rule: "a quarterly cycle since the 2023 amendments; the deadline differs by filer type",
        role: "5%+ stake reported as passive",
      },
      { form: "Form 4", rule: "2 business days", role: "insider transactions, between quarters" },
    ],
    figs,
    // Required by the fixture's interface and read by nothing: the §01 tiles carry their own
    // `calc`, so this duplicate of the third tile's is left pointing at the same object rather
    // than fabricated. Drops out when `InstSnapshot` moves off `hub.ts`.
    instPctCalc: figs[2]?.calc ?? { formula: "", note: "", inputs: [] },
  };
}

/** `"2026-03-31"` → `"1Q26"`, the label the register charts use. */
function qLabel(iso: string): string {
  const [y, m] = iso.split("-");
  return `${Math.ceil(Number(m) / 3)}Q${y.slice(2)}`;
}

/**
 * The legend swatch for band `i` of `n`.
 *
 * Mirrors `stackedAreaDraw`'s own ramp in `charts/series.tsx` (#c0703a → #f0dcc6 across the band
 * index). The chart colours by position and takes no colour input, so a legend with its own
 * palette shows one colour beside a band drawn in another — which makes "colour is categorical
 * identity" false exactly where a reader relies on it to match a row to a layer.
 */
function mixSwatch(i: number, n: number): string {
  const from = [0xc0, 0x70, 0x3a];
  const to = [0xf0, 0xdc, 0xc6];
  const t = n <= 1 ? 0 : i / (n - 1);
  const ch = from.map((f, k) => Math.round(f + (to[k] - f) * t));
  return `#${ch.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * §02's register-over-time, manager mix and largest holders.
 *
 * **The mix describes a MINORITY of the register and the card has to say so.** Categories come
 * from each filer's own SIC registration, and most filers carry none: for Apple's quarter 80 of
 * 6,044 holders are classified — 1.3% of holders, but 43.1% of shares. The endpoint reports that
 * as `coverage`, and a stacked area with no such note reads as the whole register's composition.
 *
 * SIC is also a REGISTRATION category, not a strategy — an index fund, a stock-picker and a quant
 * shop all register as investment advice. The endpoint's own `cannot` says so and is carried into
 * the "how this is computed" drawer rather than paraphrased.
 */
function toInstRegister(
  base: string | null,
  periods: string[],
  registers: (RegisterResponse | null)[],
  series?: HoldingsSeriesResponse | null,
): hub.InstRegister {
  // Oldest-first for charting; the API returns newest-first.
  const chron = [...periods].reverse();
  const regByPeriod = new Map<string, RegisterResponse>();
  registers.forEach((r) => r && regByPeriod.set(r.period, r));

  /*
   * Register over time, from the per-quarter `-register` reads rather than by aggregating the
   * series.
   *
   * Aggregating the series is a trap in both directions. A series row is per (manager, CUSIP) and
   * Apple has 43 CUSIPs, so 1,238 of its 7,424 rows carry TWO points for the same quarter —
   * Eastern Bank reports 958,350 and 156,941 separately. Taking the first point per row silently
   * drops the rest (6,024M against 8,315M actual); counting points instead of managers inflates
   * the holder count to 9,237 against 6,076 distinct filers. `-register` already publishes both
   * figures on the same population the §01 tiles and the top-ten denominator use, so the chart
   * agrees with the rest of the page by construction.
   */
  /*
   * A quarter whose register did not come back stays `null`.
   *
   * The nine reads are independent and each carries its own `.catch(() => null)`, so ONE 429 or
   * dropped connection is enough. Coalescing that to 0 drew Apple's 3Q25 at 54 managers between
   * neighbours of 5,635 and 6,138 — a quarter in which the stock read as unheld, caused by the
   * transport rather than by any filing. The chart breaks its line on null instead.
   */
  const counts: (number | null)[] = [];
  const sharesM: (number | null)[] = [];
  for (const p of chron) {
    const r = regByPeriod.get(p);
    counts.push(r?.concentration?.holder_count ?? null);
    sharesM.push(r?.total_reported_shares == null ? null : r.total_reported_shares / 1e6);
  }
  const last = counts[counts.length - 1];
  const prev = counts[counts.length - 2];
  const net = last != null && prev != null ? last - prev : null;

  // Manager mix over the same quarters. A category absent in a quarter contributes 0 for that
  // quarter, which is a real zero weight, not a missing one.
  const catKeys = new Map<string, string>();
  for (const r of registers) {
    for (const c of r?.composition?.categories ?? []) catKeys.set(c.key, c.label);
  }
  const bands = [...catKeys].map(([key, label]) => ({
    key,
    label,
    values: chron.map((p) => {
      const cat = regByPeriod.get(p)?.composition?.categories?.find((c) => c.key === key);
      return (cat?.weight ?? 0) * 100;
    }),
  }));

  const current = base ? regByPeriod.get(base) : undefined;
  const priorPeriod = chron[chron.length - 2];
  const prior = priorPeriod ? regByPeriod.get(priorPeriod) : undefined;

  // Band order must match the chart's, which stacks `bands` in array order — the legend indexes
  // into the same list so swatch i is layer i.
  const bandOrder = bands.map((b) => b.key);
  const mixLegend = (current?.composition?.categories ?? []).map((c) => {
    const p = prior?.composition?.categories?.find((x) => x.key === c.key);
    return {
      k: c.label,
      pct: `${(c.weight * 100).toFixed(1)}%`,
      pctN: c.weight * 100,
      prior: p ? `${(p.weight * 100).toFixed(1)}%` : "N/A",
      priorN: (p?.weight ?? 0) * 100,
      color: mixSwatch(Math.max(0, bandOrder.indexOf(c.key)), bandOrder.length),
    };
  });

  const con = current?.concentration;
  const comp = current?.composition;
  // The area is normalised to 100%, so a swinging DENOMINATOR is invisible in it: Apple's
  // classified share runs 18.9%-43.1% across these quarters on 68-80 filers. Without this the
  // chart reads as the register's composition changing.
  const covers = chron
    .map((p) => regByPeriod.get(p)?.composition?.coverage)
    .filter((c): c is number => typeof c === "number");
  const coverRange = covers.length
    ? `${(Math.min(...covers) * 100).toFixed(1)}%-${(Math.max(...covers) * 100).toFixed(1)}%`
    : null;
  const total = current?.total_reported_shares ?? null;

  // Largest managers, with each one's own nine-quarter panel from the same series.
  const holders = (current?.share_vector ?? []).slice(0, 12).map((h) => {
    const mgr = series?.series.find((m) => m.manager_cik === h.manager_cik);
    // Sum every point for the period, not the first: a manager holding two of the issuer's CUSIPs
    // reports them as separate points, and taking one understates that manager's position.
    const spark = chron.map((p) => {
      const pts = (mgr?.points ?? []).filter((x) => x.period === p && x.shares != null);
      return pts.length ? pts.reduce((a, x) => a + (x.shares as number), 0) / 1e6 : null;
    });
    const last = spark[spark.length - 1];
    const prev = spark[spark.length - 2];
    return {
      name: h.manager_name,
      kind: h.sic ? `SIC ${h.sic}` : "no SIC on its registration",
      form: "13F-HR",
      filed: base ? instDate(base) : "N/A",
      shares: usdCompact(h.shares).replace("$", ""),
      // Weight is of REPORTED 13F shares, not of shares outstanding — a different denominator
      // from §01's tiles, and mixing them would overstate every holder.
      pct: `${(h.weight * 100).toFixed(2)}%`,
      delta:
        last == null || prev == null
          ? "N/A"
          : `${last - prev >= 0 ? "+" : ""}${(last - prev).toFixed(1)}M`,
      spark,
    };
  });

  return {
    quarters: chron.map(qLabel),
    holderCounts: counts,
    sharesM,
    netHolders:
      net === null
        ? "N/A"
        : `${net >= 0 ? "+" : ""}${net.toLocaleString()} managers vs the prior quarter`,
    mix: { periods: chron.map(qLabel), bands },
    mixLegend,
    top10: con?.top10_share == null ? "N/A" : `${(con.top10_share * 100).toFixed(1)}%`,
    top10Note:
      con?.top10_share == null
        ? "no register ingested for this quarter"
        : `of the ${(total ?? 0) / 1e6 >= 1 ? usdCompact(total ?? 0).replace("$", "") : "0"} shares reported by ${con.holder_count?.toLocaleString() ?? "?"} managers — a share of 13F-REPORTED shares, not of shares outstanding.` +
          (comp
            ? ` Manager mix covers ${comp.classified_holder_count.toLocaleString()} of ${(comp.classified_holder_count + comp.unclassified_holder_count).toLocaleString()} holders (${(comp.coverage * 100).toFixed(1)}% of reported shares) — the rest carry no SIC code` +
              (coverRange ? `, and that coverage runs ${coverRange} across the quarters charted, so the mix's own denominator moves.` : ".")
            : ""),
    holders,
  };
}

/** §02's "how this is computed" drawers and the top-ten history behind the figure. */
function toInstRegisterExtras(
  periods: string[],
  registers: (RegisterResponse | null)[],
): hub.InstRegisterExtras {
  const chron = [...periods].reverse();
  const byPeriod = new Map<string, RegisterResponse>();
  registers.forEach((r) => r && byPeriod.set(r.period, r));

  const top10Series = chron
    .map((p) => ({ period: qLabel(p), value: (byPeriod.get(p)?.concentration?.top10_share ?? 0) * 100 }))
    .filter((x) => x.value > 0);
  const latest = top10Series[top10Series.length - 1]?.value ?? null;
  const first = top10Series[0]?.value ?? null;
  const current = byPeriod.get(chron[chron.length - 1] ?? "");

  return {
    top10Series,
    top10Latest: latest === null ? "N/A" : `${latest.toFixed(1)}%`,
    top10Change:
      latest === null || first === null
        ? ""
        : `${latest - first >= 0 ? "+" : ""}${(latest - first).toFixed(1)}pp over ${top10Series.length} quarters`,
    top10DrawerNote:
      current?.concentration?.cannot ??
      "A concentration figure describes the ingested register, not the whole market.",
    classificationCalc: {
      formula: current?.composition?.formula ?? "",
      // The endpoint's own warning, carried verbatim: SIC is a registration category, not a
      // strategy, so this is not "index vs active".
      note: current?.composition?.cannot ?? "",
      inputs: [
        { k: "Population", v: current?.composition?.population ?? "N/A" },
        { k: "Classified holders", v: current?.composition?.classified_holder_count?.toLocaleString() ?? "N/A" },
        { k: "Unclassified holders", v: current?.composition?.unclassified_holder_count?.toLocaleString() ?? "N/A" },
        { k: "Share coverage", v: current?.composition ? `${(current.composition.coverage * 100).toFixed(1)}%` : "N/A" },
      ],
    },
    top10Calc: {
      formula: current?.concentration?.formula ?? "",
      note: current?.concentration?.cannot ?? "",
      inputs: [
        { k: "Population", v: current?.concentration?.population ?? "N/A" },
        { k: "Managers", v: current?.concentration?.holder_count?.toLocaleString() ?? "N/A" },
        { k: "HHI", v: current?.concentration?.hhi?.toFixed(0) ?? "N/A" },
        { k: "Effective holders", v: current?.concentration?.effective_holders?.toFixed(1) ?? "N/A" },
        { k: "Managers for half the register", v: current?.concentration?.managers_for_half?.toLocaleString() ?? "N/A" },
      ],
    },
  };
}

interface ActivitySeriesResponse {
  transitions: {
    from_period: string; to_period: string;
    counts: { new: number; added: number; reduced: number; exited: number };
    inflow_shares: number | null; outflow_shares: number | null; net_shares: number | null;
  }[];
}

interface DomicileResponse {
  period: string;
  domicile: {
    status: string; formula: string; cannot: string; population: string;
    rows: { place: string; country: string; holder_count: number; shares: number; weight: number }[];
    located_holder_count: number; unlocated_holder_count: number; coverage: number;
  };
}

interface PeerOverlapResponse {
  period: string;
  overlap: {
    status: string; formula: string; cannot: string; peer_basis: string;
    issuers: { cik: number; label: string; name: string | null; holder_count: number; is_focus: boolean }[];
    matrix: (number | null)[][];
    combinations: { ciks: number[]; labels: string[]; manager_count: number }[];
    combinations_truncated: boolean;
    holders: { manager_cik: number; manager_name: string; weight: number; peers_held: number; peer_count: number }[];
  };
}

interface RegisterShapeResponse {
  periods: string[];
  turnover: {
    status: string; formula: string; cannot: string;
    to_period: string; from_period: string;
    entrants: number; exits: number; retained: number;
    prior_holder_count: number | null; turnover_pct: number | null;
  };
  retention: {
    status: string; reason: string | null; formula: string; cannot: string; population: string;
    periods: string[];
    cohorts: { period: string; holder_count: number; survival: number[]; label?: string }[];
  };
  tenure: {
    status: string; formula: string; cannot: string; newest_period: string;
    quarters_observed: number; median_quarters_held: number | null;
    cohorts: { label: string; min_quarters: number; holder_count: number; share_of_register: number }[];
  };
  stable_capital: {
    status: string; formula: string; cannot: string;
    stable_share: number | null; quarters_observed: number;
  };
}

/**
 * §03's flows, concentration, domicile and peer overlap.
 *
 * **The transition into the filling quarter is dropped.** `-activity-series`' newest entry for
 * Apple reads `exited: 5,775` with an outflow of 2.72B shares — which is not an exodus, it is
 * 5,775 managers that have not filed yet. Drawn, it is the loudest possible bar on the page and
 * says the opposite of the truth.
 */
function toInstFlows(
  base: string | null,
  act: ActivitySeriesResponse | null,
  reg: RegisterResponse | null,
  dom: DomicileResponse | null,
  peer: PeerOverlapResponse | null,
  attribution: AttributionResponse | null,
  shape: RegisterShapeResponse | null,
): hub.InstFlows {
  const trans = (act?.transitions ?? []).filter((t) => !base || t.to_period <= base);

  /*
   * Two bars per quarter sharing ONE key, which is what puts them in one column.
   *
   * The chart positions every bar at its key's band and draws a label at that band's centre. With
   * distinct keys the inflow and outflow of a quarter got adjacent bands, so each label sat under
   * the up-bar while the matching down-bar hung to its right — Apple's -500M outflow for 2Q24
   * rendered between the "2Q24" and "3Q24" ticks and read as belonging to neither. A shared key
   * collapses them onto one band: added above the axis, reduced below, one tick underneath, which
   * is what "shares added above the axis, reduced below" describes.
   *
   * The outflow row carries an empty label so the tick is drawn once rather than twice over
   * itself.
   */
  const flow = trans.flatMap((t) => [
    { key: t.to_period, label: qLabel(t.to_period), value: (t.inflow_shares ?? 0) / 1e6 },
    { key: t.to_period, label: "", value: -(t.outflow_shares ?? 0) / 1e6 },
  ]);

  const quarterTable = [...trans].reverse().slice(0, 6).map((t) => ({
    q: qLabel(t.to_period),
    added: `${(t.counts.added + t.counts.new).toLocaleString()}`,
    reduced: `${(t.counts.reduced + t.counts.exited).toLocaleString()}`,
    addedSh: t.inflow_shares == null ? "" : `+${usdCompact(t.inflow_shares).replace("$", "")}`,
    reducedSh: t.outflow_shares == null ? "" : `−${usdCompact(t.outflow_shares).replace("$", "")}`,
  }));

  const sv = reg?.share_vector ?? [];
  const pareto = sv.slice(0, 20).map((h) => ({
    key: String(h.manager_cik),
    label: h.manager_name,
    value: h.shares / 1e6,
  }));
  const treemap = sv.slice(0, 20).map((h) => ({
    id: String(h.manager_cik),
    label: h.manager_name,
    value: h.shares / 1e6,
    note: `${(h.weight * 100).toFixed(2)}% of the 13F register`,
  }));

  const con = reg?.concentration;
  const calcBase = (formula?: string, note?: string) => ({
    formula: formula ?? "",
    note: note ?? "",
    inputs: [
      { k: "Population", v: con?.population ?? "N/A" },
      { k: "Managers", v: con?.holder_count?.toLocaleString() ?? "N/A" },
      { k: "Top 1 / 5 / 10", v: con
        ? `${((con.top1_share ?? 0) * 100).toFixed(1)}% / ${((con.top5_share ?? 0) * 100).toFixed(1)}% / ${((con.top10_share ?? 0) * 100).toFixed(1)}%`
        : "N/A" },
    ],
  });

  /*
   * Domicile is a STACKED BAR, so it has to sum to the whole it claims to decompose.
   *
   * Showing the top eight places alone covered 70.8% of Apple's placed shares and 74.9% of
   * Coca-Cola's — the remaining ~29% and ~25% simply vanished, under a bar a reader takes for a
   * complete split. The rest is carried as one explicit segment rather than dropped.
   */
  const dr = dom?.domicile;
  const domRows = dr?.rows ?? [];
  const TOP_PLACES = 8;
  const shown = domRows.slice(0, TOP_PLACES);
  const restWeight = domRows.slice(TOP_PLACES).reduce((a, r) => a + r.weight, 0);
  const domicile = [
    ...shown.map((r) => ({
      key: r.place,
      label: r.place.replace("United States · ", ""),
      share: r.weight * 100,
    })),
    ...(restWeight > 0
      ? [
          {
            key: "other",
            label: `${domRows.length - TOP_PLACES} other places`,
            share: restWeight * 100,
          },
        ]
      : []),
  ];

  const ov = peer?.overlap;
  const issuers = ov?.issuers ?? [];
  const upsetSets = issuers.map((i) => ({ key: i.label, label: i.label }));
  const upset = (ov?.combinations ?? []).map((c) => ({
    members: c.labels,
    size: c.manager_count,
    note: `${c.manager_count.toLocaleString()} managers report ${c.labels.length === 1 ? "only this issuer" : "this exact combination"}`,
  }));
  const overlap = (ov?.holders ?? []).map((h) => ({
    name: h.manager_name,
    peers: h.peers_held,
    of: h.peer_count,
  }));
  const matrix = {
    rows: issuers.map((i) => i.label),
    cols: issuers.map((i) => i.label),
    cells: issuers.flatMap((r, ri) =>
      issuers.map((c, ci) => ({
        row: r.label,
        col: c.label,
        value: ov?.matrix?.[ri]?.[ci] == null ? null : (ov.matrix[ri][ci] as number) * 100,
      })),
    ),
  };

  // Share attribution as a residual: what the ingested filings do NOT place.
  const at = attribution?.attribution;
  const instRow = at?.rows.find((r) => r.key === "institutional");
  const attributed = instRow?.share_of_outstanding ?? null;
  const residual =
    attributed === null
      ? []
      : [
          { key: "attributed", label: "13F-reported", share: attributed * 100 },
          { key: "residual", label: "Not attributed", share: Math.max(0, 100 - attributed * 100) },
        ];

  // Tenure and stable capital anchor on the NEWEST INGESTED quarter, which the endpoint reports
  // and which is the still-filing one — so they describe a partial register. Said, not hidden.
  const t = shape?.tenure;
  const sc = shape?.stable_capital;
  const anchoredOnFilling = !!(t?.newest_period && base && t.newest_period > base);
  const shapeWarn = anchoredOnFilling
    ? ` Computed on ${instDate(t?.newest_period)}, which is still being filed, so it describes the filers in so far — not the ${instDate(base)} register.`
    : "";

  return {
    // The Pareto draws the top 20 of a register in the thousands; without this its cumulative
    // curve would reach 100% at the 20th manager.
    registerTotalM:
      reg?.total_reported_shares == null ? null : reg.total_reported_shares / 1e6,
    flow,
    quarterTable,
    pareto,
    treemap,
    lorenz: (con as unknown as { lorenz?: number[] })?.lorenz ?? [],
    effective: con?.effective_holders == null ? "N/A" : con.effective_holders.toFixed(1),
    hhi: con?.hhi == null ? "N/A" : Math.round(con.hhi).toLocaleString(),
    gini: con?.gini == null ? "N/A" : con.gini.toFixed(3),
    halfCount: con?.managers_for_half?.toLocaleString() ?? "N/A",
    domicile,
    upsetSets,
    upset,
    overlap,
    matrix,
    residual,
    residualSeries: [],
    /*
     * `-register-shape` anchors on the newest INGESTED quarter whatever period is asked for, and
     * that is the still-filing one: Apple's cohorts total 490 managers against a 6,044-manager
     * register, because only the early filers are in. The figures are reported as the endpoint
     * computes them and the anchor is named in the tile itself, not buried in a drawer — a bare
     * "93.8% stable" over 817 filers reads as a fact about the register.
     */
    stable:
      sc?.stable_share == null
        ? "N/A"
        : `${(sc.stable_share * 100).toFixed(1)}%${anchoredOnFilling ? " *" : ""}`,
    tenureWeighted:
      t?.median_quarters_held == null ? "N/A" : `${t.median_quarters_held} quarters median`,
    // The label beneath this reads "reporting this issuer for the first time", so it takes the
    // quarter these cohorts are measured over — not a count, and not a date pretending to be one.
    firstQuarter: t?.newest_period
      ? `${qLabel(t.newest_period)}${anchoredOnFilling ? " — still filing" : ""}`
      : "N/A",
    cohorts: (t?.cohorts ?? []).map((c) => ({
      cohort: c.label,
      share: `${(c.share_of_register * 100).toFixed(1)}%`,
      weight: `${c.holder_count.toLocaleString()} managers`,
    })),
    calcs: {
      eff: calcBase(con?.formula, con?.cannot),
      hhi: calcBase(con?.formula, con?.cannot),
      gini: calcBase(con?.formula, con?.cannot),
      residual: {
        formula: at?.formula ?? "",
        note: at?.cannot ?? "",
        inputs: [
          { k: "Shares outstanding", v: at?.shares_outstanding ? usdCompact(at.shares_outstanding).replace("$", "") : "N/A" },
          { k: "As of", v: instDate(at?.shares_outstanding_as_of) },
          { k: "Rows add up?", v: at?.rows_are_additive ? "yes" : "NO — holders appear in more than one row" },
        ],
      },
      stable: {
        formula: sc?.formula ?? "",
        note: `${sc?.cannot ?? ""}${shapeWarn}`,
        inputs: [
          { k: "Quarters observed", v: String(sc?.quarters_observed ?? "N/A") },
          { k: "Anchored on", v: instDate(t?.newest_period) },
          { k: "Median tenure", v: t?.median_quarters_held == null ? "N/A" : `${t.median_quarters_held} quarters` },
        ],
      },
    },
  };
}

/**
 * §04 stewardship — the beneficial-ownership half is real, the voting half is not ingested.
 *
 * **13D vs 13G is the one thing the filings state outright**, and it is the only activism signal
 * here: a 13D is filed by a holder who may seek to influence control, a 13G by one asserting a
 * passive stake. Everything the card would otherwise say about an activist campaign — board
 * seats, standstill terms, the purpose behind a filing — is Item 4 NARRATIVE and is not parsed,
 * so those read as absent rather than as zero.
 *
 * **Voting is empty by ruling (D-voting).** Manager-level votes live in N-PX, which is not
 * ingested; the outcome figures on an 8-K Item 5.07 — say-on-pay support, turnout, withhold —
 * are in the 8-K's body, which is narrative. The card says "not ingested yet", never "cannot be
 * reported" and never a number.
 */
function toInstSteward(bo: BlockholdersResponse | null): hub.InstSteward {
  const holders = bo?.current?.holders ?? [];
  const filings = bo?.beneficial_ownership ?? [];

  const blocks = holders.map((h) => ({
    name: h.owner,
    // Item 4 is the filing's stated purpose, in prose. Naming the source beats inventing a phrase.
    purpose: h.reporting_person_type_label
      ? `${h.reporting_person_type_label} · purpose is Item 4 narrative, not parsed`
      : "purpose is Item 4 narrative, not parsed",
    amended: h.filed
      ? `${(h.form ?? "").includes("/A") ? "amendment" : "original"} filed ${instDate(h.filed)}`
      : "filing date not stated",
    form: h.form ?? "SC 13D/G",
    pct: h.percent_of_class == null ? "N/A" : `${h.percent_of_class.toFixed(2)}%`,
  }));

  // One lane per owner, its filings in order. Only structured-XML 13D/G is parsed (~mid-2025 on),
  // so a short lane is our coverage window and not the holder's whole history.
  const byOwner = new Map<string, typeof filings>();
  for (const f of filings) {
    const k = f.owner_name || "unnamed filer";
    byOwner.set(k, [...(byOwner.get(k) ?? []), f]);
  }
  const blockLanes = [...byOwner].slice(0, 8).map(([owner, rows]) => ({
    id: owner,
    label: owner,
    events: rows
      .filter((r) => r.filed)
      .map((r, i) => ({
        id: `${owner}-${i}`,
        date: r.filed as string,
        kind: (r.form_type ?? "").includes("13D") ? "13d" : "13g",
        title: `${r.form_type ?? "SC 13D/G"} · ${
          r.percent_of_class == null ? "no percentage stated" : `${r.percent_of_class.toFixed(2)}%`
        }`,
      })),
  }));

  const has13D = filings.some((f) => (f.form_type ?? "").includes("13D"));
  const activistFilings = filings.filter((f) => (f.form_type ?? "").includes("13D"));
  const activist = activistFilings[0];

  const NOT_INGESTED =
    "Manager-level voting is reported on Form N-PX, which is not ingested. The outcome figures " +
    "on an 8-K Item 5.07 — say-on-pay support, turnout, withhold — are in the filing's body, " +
    "which is narrative. Not reported here rather than estimated.";

  return {
    blocks,
    blockLanes,
    blockStripNote:
      filings.length === 0
        ? "No structured Schedule 13D or 13G is on file for this issuer. Only filings from the SEC's ~mid-2025 XML transition onward are parsed, so an empty strip is a coverage window, not a statement that nobody crossed 5%."
        : `${filings.length} structured 13D/G filing${filings.length === 1 ? "" : "s"} parsed. Only filings from the SEC's ~mid-2025 XML transition onward are parsed, so this is a coverage window rather than the full history.`,
    voting: { sayOnPay: "N/A", withhold: "N/A", turnout: "N/A", proposals: "N/A" },
    sopSeries: [],
    withholdSeries: [],
    dissentSeries: [],
    voteWeighted: { rows: [], dissentShares: "N/A", note: NOT_INGESTED },
    activism: {
      active: has13D,
      holder: activist?.owner_name ?? "",
      stake:
        activist?.percent_of_class == null ? "N/A" : `${activist.percent_of_class.toFixed(2)}%`,
      // Item 4 narrative — see the docstring.
      seats: null,
      standstill: "not parsed",
      steps: activistFilings
        .filter((f) => f.filed && f.percent_of_class != null)
        .map((f) => ({ date: f.filed as string, value: f.percent_of_class as number })),
      trail: activistFilings.map((f) => ({
        form: f.form_type ?? "SC 13D",
        date: instDate(f.filed),
        what: `${f.reporting_person_type_label ?? "reporting person"} · ${
          f.percent_of_class == null ? "no percentage stated" : `${f.percent_of_class.toFixed(2)}% of class`
        }`,
      })),
    },
  };
}

/**
 * §05 holder behaviour.
 *
 * **Turnover is recomputed here rather than read off the endpoint**, and that is the whole point
 * of this adapter. `-register-shape` anchors on the newest INGESTED quarter, which while a
 * quarter is still being filed is a partial register: for Apple it reports 5,563 exits and
 * `turnover_pct` 92.19%, a headline that reads as a catastrophic exodus when those managers have
 * simply not filed yet. The same formula — (entrants + exits) / prior-quarter holder count — on
 * the base quarter gives 9.1%.
 *
 * Tenure and its cohorts CANNOT be recomputed the same way (the endpoint does not expose the
 * per-manager history), so they are reported as it computes them with the anchor named on the
 * card, exactly as §03 does.
 */
function toInstBehavior(
  base: string | null,
  shape: RegisterShapeResponse | null,
  act: ActivitySeriesResponse | null,
  priorRegister: RegisterResponse | null,
): hub.InstBehavior {
  const trans = (act?.transitions ?? []).filter((t) => !base || t.to_period <= base);
  const latest = trans[trans.length - 1];

  // The endpoint's own formula, applied to a quarter whose filers are all in.
  const priorCount =
    priorRegister?.concentration?.holder_count ??
    (latest ? latest.counts.added + latest.counts.reduced + latest.counts.exited : null);
  const turnoverPct =
    latest && priorCount
      ? (100 * (latest.counts.new + latest.counts.exited)) / priorCount
      : null;

  const turnoverSeries = trans.map((t) => {
    const prior = t.counts.added + t.counts.reduced + t.counts.exited;
    return {
      period: qLabel(t.to_period),
      value: prior ? (100 * (t.counts.new + t.counts.exited)) / prior : 0,
    };
  });

  const ten = shape?.tenure;
  const ret = shape?.retention;
  const anchoredOnFilling = !!(ten?.newest_period && base && ten.newest_period > base);
  const anchorNote = anchoredOnFilling
    ? ` Tenure figures are computed on ${instDate(ten?.newest_period)}, which is still being filed, so they describe the filers in so far.`
    : "";

  // Retention, truncated at the base quarter: the final column of every cohort is the drop into
  // the filling quarter (Apple's cohorts all end at ~7% survival for that reason alone).
  const retPeriods = (ret?.periods ?? []).filter((p) => !base || p <= base);
  const cols = retPeriods.map((_p, i) => `+${i}Q`);
  const rows = (ret?.cohorts ?? []).filter((c) => !base || c.period <= base).map((c) => qLabel(c.period));
  const cells = (ret?.cohorts ?? [])
    .filter((c) => !base || c.period <= base)
    .flatMap((c) =>
      cols.map((col, i) => ({
        row: qLabel(c.period),
        col,
        // Only quarters that actually elapsed before the base are shown; beyond that a cohort has
        // no observation, which is not the same as zero survival.
        value: i < c.survival.length - 1 && c.survival[i] != null ? c.survival[i] * 100 : null,
      })),
    );

  return {
    turnover: turnoverPct == null ? "N/A" : `${turnoverPct.toFixed(1)}%`,
    medianHold:
      ten?.median_quarters_held == null
        ? "N/A"
        : `${ten.median_quarters_held} quarters${anchoredOnFilling ? " *" : ""}`,
    turnoverSeries,
    cohortHeat: { rows, cols, cells },
    // Joined as sentences: the endpoint's `cannot` and `reason` are independent fragments and
    // concatenating them raw produced "rather than a measurement of it. followed over the 9
    // ingested quarter(s)... and no further The quarter now being filed".
    cohortNote: [
      ret?.cannot,
      ret?.reason ? `Cohorts are ${ret.reason}` : null,
      "The quarter now being filed is excluded: every cohort's survival collapses into it because most managers have not reported yet, not because they left.",
    ]
      .filter(Boolean)
      .map((t) => (t as string).trim().replace(/\.?$/, "."))
      .join(" "),
    cohorts: (ten?.cohorts ?? []).map((c) => ({
      k: c.label,
      pct: `${(c.share_of_register * 100).toFixed(1)}%`,
      pctN: c.share_of_register * 100,
    })),
    note: [
      shape?.turnover?.cannot,
      `Turnover is computed on ${instDate(base)} — the quarter the register is read at — rather than on the quarter still being filed`,
      anchoredOnFilling
        ? `Tenure figures are computed on ${instDate(ten?.newest_period)}, which is still being filed, so they describe the filers in so far`
        : null,
    ]
      .filter(Boolean)
      .map((t) => (t as string).trim().replace(/\.?$/, "."))
      .join(" "),
    // N-PORT is a fund-level monthly filing and is not ingested. Named, never estimated.
    funds: [],
    fundNote:
      "Fund-level positions are reported on Form N-PORT, filed monthly by the fund rather than by " +
      "the manager. N-PORT is not ingested, so no fund rows are shown — an absence of coverage, " +
      "not a finding that no fund holds this issuer.",
    calcs: {
      turnover: {
        formula: shape?.turnover?.formula ?? "(entrants + exits) / prior-quarter holder count",
        note: shape?.turnover?.cannot ?? "",
        inputs: [
          { k: "Quarter", v: latest ? `${qLabel(latest.from_period)} → ${qLabel(latest.to_period)}` : "N/A" },
          { k: "Entrants", v: latest ? latest.counts.new.toLocaleString() : "N/A" },
          { k: "Exits", v: latest ? latest.counts.exited.toLocaleString() : "N/A" },
          { k: "Prior holders", v: priorCount ? priorCount.toLocaleString() : "N/A" },
        ],
      },
      persist: {
        formula: ten?.formula ?? "",
        note: `${ten?.cannot ?? ""}${anchorNote}`,
        inputs: [
          { k: "Quarters observed", v: String(ten?.quarters_observed ?? "N/A") },
          { k: "Anchored on", v: instDate(ten?.newest_period) },
          { k: "Median tenure", v: ten?.median_quarters_held == null ? "N/A" : `${ten.median_quarters_held} quarters` },
        ],
      },
    },
  };
}

interface FilingIndexResponse {
  indexed_count: number;
  covered_from: string | null;
  covered_to: string | null;
  supply: {
    status: string; reason: string | null; formula: string; cannot: string; population: string;
    categories: {
      key: string; label: string; forms: string[]; count: number;
      latest_filed: string | null; latest_form: string | null;
    }[];
  };
  acceptance_lag: {
    status: string; reason: string | null; formula?: string; cannot?: string;
    median_days?: number | null; days?: number[];
  };
}

/**
 * §06 register limits & supply.
 *
 * **Existence and date, never terms.** A registration statement establishes which shares MAY be
 * resold; it does not say a sale happened, how many shares it covers, or when a lock-up ends —
 * that is exhibit prose. So the supply checks report which categories of filing EXIST over the
 * indexed window, the selling-shareholder card names the form rather than a share count, and the
 * windows-and-expiries chart has no source at all and says so instead of drawing invented dates.
 *
 * **An absence is scoped to the window, which differs enormously by filer.** EDGAR serves a
 * rolling slice of recent filings, so Apple's index reaches 2015 while a heavy filer's covers one
 * year. Every "no filing on file" here carries the window it was checked over.
 */
function toInstLimits(
  fi: FilingIndexResponse | null,
  act: FilingActivityResponse | null,
  plans: TradingArrangementsResponse | null,
): hub.InstLimits {
  const cats = fi?.supply?.categories ?? [];
  const cat = (k: string) => cats.find((c) => c.key === k);
  const window =
    fi?.covered_from && fi?.covered_to
      ? `${instDate(fi.covered_from)} to ${instDate(fi.covered_to)}`
      : "the indexed window";

  const registration = cat("registration");
  const checks = cats.map((c) => ({
    k: c.label,
    // A count with its latest date, or a checked absence naming the window it was checked over.
    // Short enough not to collide with the row label — the window itself is stated once, in the
    // note below, rather than repeated on every absent row.
    state:
      c.count > 0
        ? `${c.count.toLocaleString()} filed · latest ${instDate(c.latest_filed)}`
        : "none in the indexed window",
    forms: c.forms.slice(0, 6).join(" · "),
    on: c.count > 0,
  }));

  const lag = fi?.acceptance_lag;
  const lagDays = lag?.days ?? [];

  return {
    selling: {
      active: (registration?.count ?? 0) > 0,
      form: registration?.latest_form ?? "S-1 / S-3",
      // Who may sell and how many shares are TERMS inside the filing, not facts about it. Kept
      // short: these two render inline beside the form badge.
      holders: "selling holders not parsed",
      shares: "share count N/A",
    },
    checks,
    asOf: fi?.covered_to ? instDate(fi.covered_to) : "N/A",
    // Lock-up and expiry DATES live in exhibits, which are prose. Nothing to plot.
    gantt: [],
    ganttNote:
      "No windows or expiries are plotted. A lock-up's length, an expiry date or a standstill " +
      "term is stated in an exhibit to the filing, which is narrative and is not parsed — the " +
      "filing index carries which forms exist and when, never what they say.",
    supplyNote: [fi?.supply?.cannot, `Checked over ${window}, which is EDGAR's rolling recent window rather than this company's whole history`]
      .filter(Boolean)
      .map((t) => (t as string).trim().replace(/\.?$/, "."))
      .join(" "),
    insiderFilings: {
      plans:
        plans?.status === "ok" && plans.adopted_count != null
          ? `${plans.adopted_count} Rule 10b5-1 arrangement${plans.adopted_count === 1 ? "" : "s"} adopted in the latest annual report`
          : "N/A — Item 408(a) not tagged in this filer's latest annual report",
      delinquent:
        "N/A — Item 405 delinquent-filer disclosure is proxy narrative and is not parsed",
    },
    mechanics: {
      confidential: "N/A — confidential-treatment requests are not ingested",
      amendments:
        act?.amended_share == null
          ? "N/A"
          : `${(act.amended_share * 100).toFixed(1)}% of indexed filings are amendments`,
      indexEvent: "N/A — index membership is not an SEC filing",
      lag: lag?.status === "ok" && lag.median_days != null ? `${lag.median_days} days median` : "N/A",
      note: lag?.reason ?? "",
    },
    lagValues: lagDays,
    lagMedian: lag?.median_days ?? 0,
    lagNote:
      lag?.status === "ok"
        ? lag.cannot ?? ""
        : lag?.reason ??
          "Acceptance timestamps are not stored yet, so no arrival lag can be measured.",
    amendRate:
      act?.forms?.slice(0, 6).map((f) => ({ key: f.form, label: f.form, value: f.count })) ?? [],
    amendNote:
      "An amendment may be a correction or a routine refiling, and the filing index cannot tell " +
      "them apart — a rate, not a quality measure.",
  };
}

export const api = {
  /**
   * The global topbar typeahead — the ONE read here that hits a real endpoint on a page whose
   * other figures are synthetic. Suggestions come from the live ticker→CIK map, so what the
   * search offers is genuinely what the API knows about.
   *
   * Failures resolve to an empty list rather than rejecting: a typeahead that throws turns a
   * keystroke into an error state, and having nothing to suggest is not an error.
   */
  suggest: async (q: string, limit = 8): Promise<CompanySuggestion[]> => {
    const query = q.trim();
    if (!query) return [];
    try {
      const d = await getJson<{ suggestions: CompanySuggestion[] }>(
        `/v1/companies/suggest?q=${encodeURIComponent(query)}&limit=${limit}`,
      );
      return d.suggestions ?? [];
    } catch {
      return [];
    }
  },

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
    const enc = encodeURIComponent(symbol);
    /*
     * Two reads. The subsidiary one is allowed to FAIL WITHOUT TAKING THE CARD WITH IT: it is the
     * one endpoint that fetches filing documents, so it is the slowest and the likeliest to be
     * unavailable, and identity should not disappear because an exhibit could not be reached.
     */
    const [p, subs, audit] = await Promise.all([
      getJson<ProfileResponse>(`/v1/companies/${enc}/profile`),
      getJson<SubsidiariesResponse>(`/v1/companies/${enc}/subsidiaries`).catch(() => null),
      // §01.9. The same read §06 makes, and the server has it cached per accession after the
      // first call for a filer — so this is one SQLite lookup, not a second 15 MB fetch.
      getJson<AuditResponse>(`/v1/companies/${enc}/audit`).catch(() => null),
      getJson<TradingArrangementsResponse>(`/v1/companies/${enc}/trading-arrangements`).catch(
        () => null,
      ),
    ]);
    return {
      profile: profileRows(p, audit),
      links: edgarLinks(p.cik),
      segmentChips: [],
      contextPill: hub.hubContextPill(subIdx >= 0, proto.SUB_COUNTS[subIdx] ?? 0),
      bizText: identitySentence(p),
      structure: subsidiaryStructure(subs),
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
    const q = `period=${encodeURIComponent(fiscalPeriod)}&limit=8`;
    const enc = encodeURIComponent(symbol);
    // `limit=8` so ONE read serves both the four-column table and the eight-point sparks. The
    // table still shows four; asking twice for the same facts to render them two ways would be
    // the aggregate-endpoint mistake in miniature.
    const metricKeys = SNAPSHOT_TILES.map((t) => t.metric).filter(Boolean) as string[];
    const [income, balance, cash, metrics, ...histories] = await Promise.all([
      getJson<CondensedResponse>(`/v1/companies/${enc}/statements/income/condensed?${q}`),
      getJson<CondensedResponse>(`/v1/companies/${enc}/statements/balance/condensed?${q}`),
      getJson<CondensedResponse>(`/v1/companies/${enc}/statements/cashflow/condensed?${q}`),
      getJson<MetricsResponse>(`/v1/companies/${enc}/metrics?year=${_year}&period=${encodeURIComponent(fiscalPeriod)}`),
      ...metricKeys.map((m) => getJson<MetricHistoryResponse>(`/v1/companies/${enc}/metrics/${m}/history`)),
    ]);
    return {
      // The table shows the four most recent of the eight columns fetched.
      years: income.columns.slice(-4).map(columnLabel),
      statements: {
        income: toStatementRows(income, "income"),
        balance: toStatementRows(balance, "balance"),
        cash: toStatementRows(cash, "cash"),
      },
      snapshot: buildSnapshot(income, metrics, histories),
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
  companyMetricSeries: async (
    symbol: string,
    id: string,
    range: "8q" | "20q" | "5y",
    basis: "filed" | "restated",
  ): Promise<CompanyMetricSeries> => {
    const def = HISTORY_METRICS.find((m) => m.id === id);
    if (!def) return { series: null, defs: HISTORY_METRICS };

    const enc = encodeURIComponent(symbol);
    const annual = range === "5y";
    const frequency = annual ? "annual" : "quarterly";
    // The page's two tabs, in the vocabulary the schema already had. `as-originally-reported` is
    // the value the FIRST filing to report a period gave; `as-restated` the latest.
    const rb = basis === "filed" ? "as-originally-reported" : "as-restated";
    const q = `frequency=${frequency}&restatement_basis=${rb}`;

    // The comparability marks. 8-K Item 4.02 is a REQUIRED filing when previously-issued
    // statements should no longer be relied on, which is the one comparability break the filing
    // record states outright. Fetched alongside, allowed to fail alone: a chart without its marks
    // is still a chart, but a chart that cannot draw is nothing.
    const eventsP = getJson<AuditResponse>(`/v1/companies/${enc}/audit`).catch(() => null);

    const res =
      def.source === "metric"
        ? await getJson<MetricHistoryResponse>(`/v1/companies/${enc}/metrics/${def.key}/history?${q}`)
            .catch(() => null)
        : await getJson<ConceptSeriesResponse>(`/v1/companies/${enc}/concept-series?concept=${def.key}&${q}`)
            .catch(() => null);
    if (!res) return { series: null, defs: HISTORY_METRICS };

    // Newest N, then back into chronological order. The route returns the WHOLE history — Apple's
    // reaches 2007 — and the range tabs are about how much of it to show.
    const take = annual ? 5 : range === "8q" ? 8 : 20;
    const pts = (res.points ?? []).slice(-take);

    return {
      series: {
        vals: pts.map((p) => p.value),
        labels: pts.map((p) =>
          p.fiscal_period === "FY" ? `FY${p.fiscal_year}` : `${p.fiscal_period} FY${String(p.fiscal_year).slice(2)}`,
        ),
        events: await restatementMarks(eventsP, pts),
        unit: res.unit ?? "",
        label: res.label ?? def.label,
        annual,
        // Provenance the fixture had no way to carry.
        sourceTag: "source_tag" in res ? (res.source_tag ?? null) : null,
        isExtension: "is_extension" in res ? !!res.is_extension : false,
        restatementBasis: res.restatement_basis ?? rb,
        reason: "reason" in res ? ((res as ConceptSeriesResponse).reason ?? null) : null,
        periodEnds: pts.map((p) => p.period_end ?? null),
      },
      defs: HISTORY_METRICS,
    };
  },

  /**
   * §02's footnote cards, §04's capital cards and §07's obligations.
   *
   * One group because they are ONE Phase B read: the grouped-concepts route over `raw_facts`.
   * V1 (2026-08-02) verified every candidate tag is already stored -- this is mapping work, not
   * ingest. Coverage varies hard by filer (ETR reconciliation 95.6%, goodwill-by-unit 3.7%), so
   * most of these cards are `N/A` for most companies and that is the honest answer.
   */
  /**
   * §02's footnote cards. **REAL — one `/footnotes` read serving all eight groups.**
   *
   * Three annual reads now, not one: `/footnotes`, `/capital` (§04) and `/obligations` (§07).
   * They travel together because they are annual for the same reason — see the note below — and
   * because they resolve through the same `build_concept_group`, so a share count or a commitment
   * here cannot disagree with the statements about which filing it came from.
   */
  companyFootnotes: async (symbol: string, _year: number, _fiscalPeriod: string) => {
    // ASKED FOR THE PAGE'S QUARTER, THESE CARDS ALL GO BLANK -- and dishonestly so.
    //
    // A debt maturity ladder, a tax rate reconciliation, a lease maturity table: these are 10-K
    // disclosures a filer publishes once a year. Passing the hub's Q1 through returned "not
    // disclosed" for every one of them, which is true of the quarter and false about the filer.
    // The page's period is deliberately dropped rather than adjusted here: only the facts know
    // which annual period a given filer actually has, so the route resolves the latest one and
    // tells us which it used. Subtracting one from the current year would be a guess.
    const enc = encodeURIComponent(symbol);
    // Both are ANNUAL reads for the same reason (see the note above), so they go together.
    const [res, cap, obl, blocks, classes] = await Promise.all([
      getJson<FootnotesResponse>(`/v1/companies/${enc}/footnotes?period=FY`),
      getJson<CapitalResponse>(`/v1/companies/${enc}/capital?period=FY`),
      // §07. Annual for the same reason, and allowed to fail alone: it is the thinnest section on
      // the page and the rest of the footnote reads should not disappear with it.
      getJson<FootnotesResponse>(`/v1/companies/${enc}/obligations?period=FY`).catch(() => null),
      // §04.7 and §04.5. Each fails alone: the first costs a live SEC fetch on a cold filer, and
      // neither should be able to take the rest of §04 down.
      getJson<BlockholdersResponse>(`/v1/companies/${enc}/beneficial-ownership?limit=20`).catch(
        () => null,
      ),
      getJson<ShareClassesResponse>(`/v1/companies/${enc}/share-classes`).catch(() => null),
    ]);
    return {
      footnotes: toFootnoteCards(res),
      /** Which annual period these came from — never assume it is the one the page is showing. */
      footnotePeriod: `FY${res.fiscal_year}`,
      /*
       * §04, merged over the fixture's shape. `insiderOwn`, `shelf` and `convert` are the only
       * fields still on the fixture, and each is permanently so: the DEF 14A beneficial-ownership
       * table is untagged (V2-verified), and shelf/convertible TERMS are exhibit prose.
       */
      capital: { ...hub.hubData(symbol).capital, ...toCapitalCards(cap) },
      /** §04.7 on real Schedule 13D/G filings. */
      blockholders: toBlockholders(blocks),
      /** §04.5 on the ASC ClassOfStock axis. */
      shareClasses: toShareClasses(classes),
      /*
       * §07, now all four cards on filings. The 2026-08-04 ruling kept the legal-proceedings TABLE
       * as a marked fixture; it was overturned on 2026-08-06 once the fixture's contents were
       * looked at rather than its shape. It invented three matters per company — "securities class
       * action · on appeal · $214M" against a named issuer — which is a fabricated ALLEGATION, not
       * a fabricated number, and the synthetic chip did not stop the rows reading as data. The
       * card now reports the one structured column, the recorded accrual.
       */
      obligations: { ...hub.hubData(symbol).obligations, ...toObligationCards(obl) },
      covenant: hub.hubData(symbol).covenant,
    } as CompanyFootnotes;
  },

  /**
   * §03 segments & geography, plus §02.7's ASC 606 split.
   *
   * Phase C: a widening of `ingest/dimensional_backfill.py` beyond geography-revenue. V5 verified
   * the axes exist in DERA `num.txt` -- under DERA's SHORT names (`BusinessSegments`, not
   * `StatementBusinessSegmentsAxis`). ANNUAL only: ASC 280 is a yearly footnote, so this takes a
   * fiscal year and not a quarter.
   */
  companySegments: async (symbol: string, _fiscalYear: number) => {
    const seg = await getJson<SegmentsResponse>(
      `/v1/companies/${encodeURIComponent(symbol)}/segments`,
    ).catch(() => null);
    return { seg: toSegments(seg) } as CompanySegments;
  },

  /**
   * §05 governance & people, now entirely on real filings.
   *
   * `/insider-summary` (§05.4), `/officer-changes` (§05.1), `/pay-versus-performance` (§05.3) and
   * `/audit`'s Rule 10D-1 flags (§05.2). The fixture `governance` block that used to ride along
   * is gone — every field of it had been replaced, and shipping a dead branch invites a future
   * reader to plug it back in.
   */
  companyGovernance: async (symbol: string) => {
    const enc = encodeURIComponent(symbol);
    // Two independent reads, in parallel and each failing alone. A proxy read costs three SEC
    // round-trips server-side (submissions, directory, instance) and the insider read can cost
    // one ownership-XML fetch per uncached filing, so neither may take the section down with it
    // — `null` flows into each adapter's honest-empty branch.
    // Four independent reads, in parallel and each failing alone. `/audit` is shared with §06 —
    // it is cache-aside over the 10-K instance, so the second caller pays a SQLite read.
    const [pvp, insiderSummary, officers, audit, plans] = await Promise.all([
      getJson<PvpResponse>(`/v1/companies/${enc}/pay-versus-performance`).catch(() => null),
      getJson<InsiderSummaryResponse>(`/v1/companies/${enc}/insider-summary?limit=10`).catch(
        () => null,
      ),
      getJson<OfficerChangesResponse>(`/v1/companies/${enc}/officer-changes`).catch(() => null),
      getJson<AuditResponse>(`/v1/companies/${enc}/audit`).catch(() => null),
      getJson<TradingArrangementsResponse>(`/v1/companies/${enc}/trading-arrangements`).catch(
        () => null,
      ),
    ]);
    return {
      insider: toInsiderSummary(insiderSummary),
      officers: toOfficerChanges(officers),
      policies: toGovernancePolicies(pvp, audit),
      plans: toTradingArrangements(plans),
      pvp: toPayVersusPerformance(pvp),
    } as CompanyGovernance;
  },

  /**
   * §06 audit quality and §08 disclosure change.
   *
   * Phase A splits three ways: 8-K item codes from `/filing-index` (auditor change, restatement,
   * late filings), the 10-K instance's `dei:AuditorName` and `cyd:` cybersecurity flags (V3), and
   * Track 2 for the rest (CAMs, ICFR conclusion, risk-factor diff, MD&A) -- which get honest empty
   * states, never a fabricated figure.
   */
  companyDisclosure: async (symbol: string) => {
    // The auditor read can cost a 15 MB instance fetch server-side on a filer's FIRST request
    // (cached per accession after that), so a failure must not take §08 down with it. `null`
    // flows into the adapter's honest-empty branch.
    const enc = encodeURIComponent(symbol);
    const [audit, activity, changes] = await Promise.all([
      getJson<AuditResponse>(`/v1/companies/${enc}/audit`).catch(() => null),
      getJson<FilingActivityResponse>(`/v1/companies/${enc}/filing-activity`).catch(() => null),
      getJson<FilingChangesResponse>(`/v1/companies/${enc}/changes`).catch(() => null),
    ]);
    const incidents =
      (activity?.items ?? []).find((i) => i.code === "1.05")?.count ?? 0;
    return {
      audit: toAuditCards(audit),
      activity: toFilingActivity(activity),
      cyber: toCybersecurity(audit, incidents),
      changes: toFilingChanges(changes),
    } as CompanyDisclosure;
  },

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
  companyInsiderActivity: async (symbol: string, filings: number) => {
    const enc = encodeURIComponent(symbol);
    // Three calls, not one aggregate (operator ruling 4). They stay consistent because the
    // ledger and the tally are the SAME filings — `/insider-summary` is the server-side count
    // over exactly what `/insider-trades` returns at this limit, which is why both take it.
    const [trades, summary, notices, peerRatio] = await Promise.all([
      getJson<InsiderTradeRow[]>(`/v1/companies/${enc}/insider-trades?limit=${filings}`).catch(
        () => null,
      ),
      getJson<InsiderSummaryResponse>(
        `/v1/companies/${enc}/insider-summary?limit=${filings}`,
      ).catch(() => null),
      getJson<ProposedSaleNoticesResponse>(
        `/v1/companies/${enc}/proposed-sale-notices?limit=400`,
      ).catch(() => null),
      getJson<InsiderPeerRatioResponse>(
        `/v1/companies/${enc}/peers/insider-net-ratio`,
      ).catch(() => null),
    ]);
    return {
      ledger: toInsiderActivity(summary?.cik ?? null, trades, summary, notices, peerRatio),
    };
  },

  /**
   * §Peer-relative. Phase A: `/peers` + `/peers/{metric}/distribution` +
   * `/sectors/{group}/{metric}/companies`, all keyed on the filer's SIC group.
   *
   * `beyond` is the ragged half — acceptance lag and extension-tag share are `M`, auditor and CAM
   * counts need the 10-K instance parse (V3), and risk-factor counts are Track 2 and get an honest
   * empty state. Grouped here anyway because they share the peer set, not because they share a
   * source.
   */
  companyPeerRelative: async (symbol: string, year: number, fiscalPeriod: string) => {
    const enc = encodeURIComponent(symbol);
    // §Segment & geographic mix is REAL (2026-08-12); every other surface on this view is still
    // the prototype's. Ported one panel at a time, the same way §01-§06 of the institutional
    // view were, so each lands with its own verification instead of one unreviewable sweep.
    const [segments, activity, audit, themes] = await Promise.all([
      getJson<SegmentsResponse>(`/v1/companies/${enc}/segments`).catch(() => null),
      getJson<FilingActivityResponse>(`/v1/companies/${enc}/filing-activity`).catch(() => null),
      getJson<AuditResponse>(`/v1/companies/${enc}/audit`).catch(() => null),
      getJson<ThemePercentilesResponse>(
        `/v1/companies/${enc}/theme-percentiles?year=${year}&period=${fiscalPeriod}`,
      ).catch(() => null),
    ]);

    // The table's rows ARE the scored themes' constituents, in theme order, so the table and the
    // rail beside it cannot show different metrics. Two reads per row, hence the cap.
    const scoredThemes =
      themes?.status === "ok" ? themes.themes.filter((t) => t.scored) : [];
    const ranked = scoredThemes.flatMap((t) => t.components.map((c) => c.metric));
    // ROUND-ROBIN across themes, not the first N in theme order. Taking the head of a flat list
    // fills the whole table from profitability and growth and never reaches financial health or
    // efficiency — so the table would silently describe two themes while the rail beside it
    // showed five, and no lower-is-better metric would ever appear.
    const shown: string[] = [];
    for (let depth = 0; shown.length < PX_METRIC_ROWS; depth += 1) {
      const before = shown.length;
      for (const t of scoredThemes) {
        const m = t.components[depth]?.metric;
        if (m && !shown.includes(m)) shown.push(m);
        if (shown.length >= PX_METRIC_ROWS) break;
      }
      if (shown.length === before) break; // every theme exhausted
    }
    const group = themes?.peer_group ?? null;
    const distRows = group
      ? await Promise.all(
          shown.map(async (m) => ({
            metric: m,
            values: await getJson<SectorCompanyValuesResponse>(
              `/v1/sectors/${group}/${m}/companies?year=${year}&period=${fiscalPeriod}`,
            ).catch(() => null),
            dist: await getJson<PeerDistributionResponse>(
              `/v1/companies/${enc}/peers/${m}/distribution?year=${year}&period=${fiscalPeriod}`,
            ).catch(() => null),
          })),
        )
      : [];
    return {
      segmentMix: toSegmentMix(segments),
      // Reuses §Filings' adapter rather than a second one, so the two cards cannot disagree
      // about a filer's form mix or about what their caps dropped.
      filingActivity: toFilingActivity(activity),
      filingFlags: toFilingFlags(audit),
      themePercentiles: toThemePercentiles(themes),
      distribution: toDistributionRows(themes?.cik ?? null, distRows, Math.max(ranked.length - shown.length, 0)),
      extras: peers.peerExtras(symbol),
      geographicMix: proto.GEO_MIX,
      // Peer-set size belongs with the peer payload — it is what "rank 4 of N" is counting.
      subCounts: proto.SUB_COUNTS,
      basePeerCount: proto.BASE_PEER_COUNT,
    };
  },

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

  /**
   * §01 register snapshot — REAL, on `-periods`, `-filed-since`, `-share-attribution`,
   * `-holders` and `-activity`.
   *
   * The quarter is DERIVED, not passed in: see `pickBasePeriod`. A caller cannot ask for "the
   * latest" and get a meaningful register, because the latest quarter is still being filed.
   */
  instRegisterSnapshot: async (symbol: string): Promise<InstRegisterSnapshot> => {
    const enc = encodeURIComponent(symbol);
    const periods = await getJson<PeriodsResponse>(`/v1/companies/${enc}/institutional-periods`);
    const { base, filling } = pickBasePeriod(periods.periods, periods.period_meta);
    if (!base) {
      return {
        freshness: toInstFreshness(periods, null, null, null),
        snapshot: toInstSnapshot(null, null, null, null),
      };
    }
    // Each read is allowed to fail alone: a missing dumbbell should not blank the freshness band.
    const [filed, attribution, holders, activity] = await Promise.all([
      getJson<FiledSinceResponse>(
        `/v1/companies/${enc}/institutional-filed-since?period=${base}`,
      ).catch(() => null),
      getJson<AttributionResponse>(
        `/v1/companies/${enc}/institutional-share-attribution?period=${base}`,
      ).catch(() => null),
      getJson<HoldersResponse>(
        `/v1/companies/${enc}/institutional-holders?period=${base}&limit=12`,
      ).catch(() => null),
      getJson<ActivityResponse>(
        `/v1/companies/${enc}/institutional-activity?period=${base}&limit=12`,
      ).catch(() => null),
    ]);
    return {
      freshness: toInstFreshness(periods, base, filling, filed),
      snapshot: toInstSnapshot(base, filed, attribution, activity),
    };
  },

  /**
   * §02 over time & holders — REAL, on `-holdings-series` and `-register`.
   *
   * `-register` is per QUARTER and carries the composition, so the nine-quarter manager mix costs
   * nine calls. They run in parallel and are ~130ms / 14KB each; the operator ruling allows the
   * frontend as many requests as it needs, and the alternative is a mix chart with one point.
   */
  instRegisterSeries: async (symbol: string, quarters: number): Promise<InstRegisterSeries> => {
    const enc = encodeURIComponent(symbol);
    const periodsRes = await getJson<PeriodsResponse>(`/v1/companies/${enc}/institutional-periods`);
    const { base } = pickBasePeriod(periodsRes.periods, periodsRes.period_meta);
    if (!base) {
      return { register: toInstRegister(null, [], []), extras: toInstRegisterExtras([], []) };
    }

    // Only quarters up to and including the base: the newest is still being filed, and including
    // it drops Apple from 9,237 holders to 817 — a 91% cliff that reads as the register
    // collapsing rather than as a deadline that has not passed.
    const upTo = periodsRes.periods.filter((p) => p <= base).slice(0, quarters);

    const [series, ...registers] = await Promise.all([
      getJson<HoldingsSeriesResponse>(
        `/v1/companies/${enc}/institutional-holdings-series?quarters=${quarters + 1}`,
      ).catch(() => null),
      ...upTo.map((p) =>
        getJson<RegisterResponse>(`/v1/companies/${enc}/institutional-register?period=${p}`).catch(
          () => null,
        ),
      ),
    ]);
    return {
      register: toInstRegister(base, upTo, registers, series),
      extras: toInstRegisterExtras(upTo, registers),
    };
  },

  /**
   * §03 flows & concentration — REAL, on `-activity-series`, `-register`, `-holder-domicile`,
   * `-peer-overlap`, `-share-attribution` and `-register-shape`.
   *
   * Six reads, each allowed to fail alone: this section stacks five independent cards and one
   * dead endpoint should cost one card, not the section.
   */
  instFlows: async (symbol: string): Promise<InstFlows> => {
    const enc = encodeURIComponent(symbol);
    const periodsRes = await getJson<PeriodsResponse>(`/v1/companies/${enc}/institutional-periods`);
    const { base } = pickBasePeriod(periodsRes.periods, periodsRes.period_meta);
    const q = base ? `?period=${base}` : "";
    const [act, reg, dom, peer, attribution, shape] = await Promise.all([
      getJson<ActivitySeriesResponse>(
        `/v1/companies/${enc}/institutional-activity-series?quarters=9`,
      ).catch(() => null),
      base
        ? getJson<RegisterResponse>(`/v1/companies/${enc}/institutional-register${q}`).catch(() => null)
        : null,
      base
        ? getJson<DomicileResponse>(`/v1/companies/${enc}/institutional-holder-domicile${q}`).catch(() => null)
        : null,
      base
        ? getJson<PeerOverlapResponse>(`/v1/companies/${enc}/institutional-peer-overlap${q}`).catch(() => null)
        : null,
      base
        ? getJson<AttributionResponse>(`/v1/companies/${enc}/institutional-share-attribution${q}`).catch(() => null)
        : null,
      base
        ? getJson<RegisterShapeResponse>(`/v1/companies/${enc}/institutional-register-shape${q}`).catch(() => null)
        : null,
    ]);
    return { flows: toInstFlows(base, act, reg, dom, peer, attribution, shape) };
  },

  /**
   * §05 register behaviour — REAL, on `-register-shape` and `-activity-series`, with the prior
   * quarter's `-register` for the turnover denominator.
   */
  instBehaviour: async (symbol: string): Promise<InstBehaviour> => {
    const enc = encodeURIComponent(symbol);
    const periodsRes = await getJson<PeriodsResponse>(`/v1/companies/${enc}/institutional-periods`);
    const { base } = pickBasePeriod(periodsRes.periods, periodsRes.period_meta);
    const prior = base ? periodsRes.periods[periodsRes.periods.indexOf(base) + 1] : undefined;
    const [shape, act, priorReg] = await Promise.all([
      base
        ? getJson<RegisterShapeResponse>(
            `/v1/companies/${enc}/institutional-register-shape?period=${base}`,
          ).catch(() => null)
        : null,
      getJson<ActivitySeriesResponse>(
        `/v1/companies/${enc}/institutional-activity-series?quarters=9`,
      ).catch(() => null),
      prior
        ? getJson<RegisterResponse>(`/v1/companies/${enc}/institutional-register?period=${prior}`).catch(
            () => null,
          )
        : null,
    ]);
    return { behavior: toInstBehavior(base, shape, act, priorReg) };
  },

  /**
   * §04 stewardship. Phase A: `/beneficial-ownership`. The VOTING half needs N-PX, which is not
   * ingested -- it gets an honest "not ingested yet" empty state (D-voting, widened 2026-08-01),
   * never "cannot be reported" and never a fabricated figure.
   */
  /**
   * §04 stewardship — REAL on `/beneficial-ownership`; the voting half is an honest empty state.
   *
   * No quarter is passed: a Schedule 13D/G reports a position as of its own event date, not as of
   * a 13F quarter end, so pinning it to one would misdate every row.
   */
  instStewardship: async (symbol: string): Promise<InstStewardship> => {
    const enc = encodeURIComponent(symbol);
    const bo = await getJson<BlockholdersResponse>(
      `/v1/companies/${enc}/beneficial-ownership?limit=60`,
    ).catch(() => null);
    return { steward: toInstSteward(bo) };
  },

  /**
   * §06 register limits & supply — REAL, on `/filing-index` (supply events + acceptance lag),
   * `/filing-activity` (amendment rate) and `/trading-arrangements` (Rule 10b5-1 adoptions).
   */
  instLimits: async (symbol: string): Promise<InstLimits> => {
    const enc = encodeURIComponent(symbol);
    const [fi, act, plans] = await Promise.all([
      getJson<FilingIndexResponse>(`/v1/companies/${enc}/filing-index?limit=1`).catch(() => null),
      getJson<FilingActivityResponse>(`/v1/companies/${enc}/filing-activity`).catch(() => null),
      getJson<TradingArrangementsResponse>(`/v1/companies/${enc}/trading-arrangements`).catch(
        () => null,
      ),
    ]);
    return { limits: toInstLimits(fi, act, plans) };
  },
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
  /** The adapter's shape: `subReason` is the API's own account of why the list is empty. */
  structure: Omit<hub.HubData["structure"], "subCount" | "offshore"> & {
    subReason: string | null;
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

/** One picked metric's series, as the financial-history chart consumes it. */
export interface HistorySeries {
  vals: (number | null)[];
  labels: string[];
  /** Comparability events at point indices — filled from the filing index, not from the series. */
  events: { i: number; tag: string }[];
  unit: string;
  label: string;
  annual: boolean;
  /** Which us-gaap/dei tag this line actually read, and whether the filer defined it itself. */
  sourceTag: string | null;
  isExtension: boolean;
  /** Echoed from the route so the chart states the basis it is on rather than assuming. */
  restatementBasis: string;
  /** Set when the filer tags this concept nowhere — an absence, not a series of zeros. */
  reason: string | null;
  periodEnds: (string | null)[];
}

export interface CompanyMetricSeries {
  series: HistorySeries | null;
  defs: typeof HISTORY_METRICS;
}

export interface CompanyFootnotes {
  /** The adapter's shape, not the fixture's: each card can now carry the REASON it is empty. */
  footnotes: ReturnType<typeof toFootnoteCards>;
  /** e.g. "FY2025" — the annual period the footnotes came from, which the section must show. */
  footnotePeriod: string;
  /** §04: the fixture's shape with the plumbed cards merged over it. */
  capital: hub.HubData["capital"] & ReturnType<typeof toCapitalCards>;
  /** §04.7 blockholders, on real 13D/G filings. */
  blockholders: ReturnType<typeof toBlockholders>;
  /** §04.5 share classes, on the ASC ClassOfStock axis. */
  shareClasses: ReturnType<typeof toShareClasses>;
  // The fixture's shape with §07's plumbed cards merged over it. As of 2026-08-06 the fixture's
  // `legal` rows and `rangeNote` are no longer READ by the view: §07.1 renders the recorded
  // accrual and an explained absence instead of three invented matters. The fixture fields remain
  // in the type only because `hub.HubData` still declares them.
  obligations: hub.HubData["obligations"] & ReturnType<typeof toObligationCards>;
  covenant: string;
}

export interface CompanySegments {
  /** §03 on ASC 280 dimensional facts. The fixture branch is gone. */
  seg: ReturnType<typeof toSegments>;
}

export interface CompanyGovernance {
  /** §05.3 re-pointed: compensation actually paid, not the untagged pay mix. */
  pvp: ReturnType<typeof toPayVersusPerformance>;
  /** §05.4 on real Form 3/4/5 rows — no longer `hub.HubInsider`. */
  insider: ReturnType<typeof toInsiderSummary>;
  /** §05.1 on Form 3 arrivals + 8-K Item 5.02 events. */
  officers: ReturnType<typeof toOfficerChanges>;
  /** §05.2 repointed: the governance check marks that ARE tagged. */
  policies: ReturnType<typeof toGovernancePolicies>;
  /** §05.5 on 10-K Item 408(a) — named officers, adoption dates, durations. */
  plans: ReturnType<typeof toTradingArrangements>;
}

export interface CompanyDisclosure {
  // No longer `hub.HubData["audit"]`: `cams` and `estimates` are gone from the shape because
  // neither exists in any SEC structured source, and a field that can only ever hold invented
  // strings should not be typed as if it might hold real ones.
  audit: ReturnType<typeof toAuditCards>;
  /** §08 re-scoped: what this company files, and how often. */
  activity: ReturnType<typeof toFilingActivity>;
  /** §08.3 Item 1C, from the `cyd` flags. */
  cyber: ReturnType<typeof toCybersecurity>;
  /** The "what changed" band, on real filings. */
  changes: ReturnType<typeof toFilingChanges>;
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
  ledger: ReturnType<typeof toInsiderActivity>;
}

export interface CompanyPeerRelative {
  segmentMix: ReturnType<typeof toSegmentMix>;
  filingActivity: ReturnType<typeof toFilingActivity>;
  filingFlags: ReturnType<typeof toFilingFlags>;
  extras: ReturnType<typeof peers.peerExtras>;
  themePercentiles: ReturnType<typeof toThemePercentiles>;
  distribution: ReturnType<typeof toDistributionRows>;
  geographicMix: typeof proto.GEO_MIX;
  subCounts: typeof proto.SUB_COUNTS;
  basePeerCount: number;
}

export interface InstRegisterSnapshot {
  freshness: hub.InstFreshness;
  snapshot: hub.InstSnapshot;
}

export interface InstRegisterSeries {
  register: hub.InstRegister;
  /** §02's drawers. They live here rather than on the §01 payload because their inputs are the
   *  per-quarter `-register` reads this section already makes. */
  extras: hub.InstRegisterExtras;
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
