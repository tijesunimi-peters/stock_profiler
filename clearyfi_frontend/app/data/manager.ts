/**
 * The Managers altitude's data, ported from the prototype's `mgrData`.
 *
 * A 13F filer described entirely by its own filings. Two rules hold the whole surface together:
 *
 *  1. **No market values, anywhere.** A 13F's dollar column is market-priced, so every
 *     cross-issuer figure here is a STAKE — reported shares over the issuer's shares
 *     outstanding. Ranking by stake keeps pricing out of the comparison.
 *  2. **Every date derives from one of two facts** — a campaign event date, or the single 13F
 *     acceptance instant. Nothing invents a timestamp, which is why the acceptance stream, the
 *     staleness ledger, the cadence histogram and the threshold crossings cannot disagree.
 *
 * Synthetic (see `data/README.md`), seeded from the manager id.
 */
import { seedN } from "../lib/seed";
import { SECTOR_NAMES } from "./prototype";

const DAY = 86400000;
const Q1_END = "2026-03-31";
const Q2_END = "2026-06-30";
/** The prototype's fixed "now". Every age and gap on the activity view measures back from it. */
const NOW = Date.UTC(2026, 6, 26, 14, 32, 0);

export interface Manager {
  id: string;
  name: string;
  kind: string;
  cik: string;
}

export const MANAGER_ROSTER: Manager[] = [
  ["Calder Index Partners", "index / passive", "0001094012"],
  ["Ironmark Global Index", "index / passive", "0000913760"],
  ["Verity Active Equity", "active / fundamental", "0001056903"],
  ["Pinehurst Value Partners", "active / fundamental", "0001167483"],
  ["Ashgrove Capital Management", "hedge fund", "0001061768"],
  ["Rowan Quantitative", "quant manager", "0001358071"],
  ["Cobalt Systematic", "quant manager", "0001423053"],
  ["Kestrel Activist Partners", "hedge fund", "0001495730"],
  ["Thames Pension Board", "pension system", "0000933691"],
  ["Northmoor Sovereign Fund", "sovereign fund", "0001582090"],
  ["Belmont Insurance Advisors", "insurance manager", "0000315066"],
  ["Larkfield Endowment", "endowment", "0001040719"],
  ["Sandhill Bank Trust", "bank trust", "0000036270"],
  ["Willowbrook Growth", "active / fundamental", "0001350694"],
].map(([name, kind, cik]) => ({ id: name.split(" ")[0].toLowerCase(), name, kind, cik }));

/** Categorical identity for a filer type — never a rating. */
const MGR_PALETTE = ["#C0703A", "#3D6A8A", "#8B8579", "#A88C5F", "#4E4A42"];

export function mgrColor(kind: string): string {
  const k = (kind || "").toLowerCase();
  if (k.includes("index") || k.includes("passive")) return MGR_PALETTE[0];
  if (k.includes("active") || k.includes("fundamental")) return MGR_PALETTE[1];
  if (k.includes("hedge") || k.includes("quant")) return MGR_PALETTE[2];
  if (k.includes("pension") || k.includes("sovereign") || k.includes("insurance") || k.includes("endowment"))
    return MGR_PALETTE[3];
  return MGR_PALETTE[4];
}

export function managerByCik(cik: number | string): Manager {
  const s = String(cik).padStart(10, "0");
  return MANAGER_ROSTER.find((m) => m.cik === s) ?? MANAGER_ROSTER[0];
}

/** The cross-sector issuer universe the footprint draws its stakes from. */
const UNIVERSE: { ticker: string; name: string; sec: number }[] = [
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

const Q = ["1Q24", "2Q24", "3Q24", "4Q24", "1Q25", "2Q25", "3Q25", "4Q25", "1Q26"];

const pct = (v: number) => `${v.toFixed(1)}%`;
const d0 = (v: number) => Math.round(v).toLocaleString();
const dys = (v: number) => `${Math.round(v)} d`;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const hhmm = (ms: number) => new Date(ms).toISOString().slice(11, 16);

function ago(ms: number): string {
  const mn = Math.round(ms / 60000);
  if (mn < 60) return `${mn} min ago`;
  const hr = mn / 60;
  if (hr < 48) return `${Math.round(hr)} h ago`;
  const dd = Math.round(hr / 24);
  if (dd < 70) return `${dd} d ago`;
  return `${Math.round(dd / 30.4)} mo ago`;
}

export interface HistBin { label: string; n: number; median?: boolean }
export interface CampEvent { date: string; pct: number; tag: string }
export interface Campaign { name: string; form: string; formCode: string; color: string; evs: CampEvent[] }

export interface UniverseDist {
  vals: { ticker: string; val: number }[];
  min: number; max: number; q1: number; med: number; q3: number;
  label: string;
  medLabel: string;
  focalVal: number;
}

export interface ManagerData {
  name: string; kind: string; cik: string; kindColor: string; id: string;
  // profile
  positions: string; addedLabel: string; exitedLabel: string; lagLabel: string;
  posTrend: number[]; posTrendNote: string;
  profile: { k: string; v: string; src: string }[];
  // footprint
  stakes: { ticker: string; name: string; sector: string; stake: number; prior: number; holders: number; stakeLabel: string; delta: string }[];
  pareto: { label: string; share: number; cum: number; cumPrior: number; color: string }[];
  paretoNote: string;
  sectorMix: { k: string; pctLabel: string; w: string; pw: string; sw: string; swLabel: string }[];
  sectorNote: string;
  stakeBins: HistBin[]; stakeHistNote: string;
  scatterNote: string;
  // voting
  supportLabel: string; sopLabel: string;
  againstTrend: number[]; againstNote: string;
  sopDist: UniverseDist; sopDistNote: string;
  voteCats: { k: string; meetings: string; forPct: string; againstPct: string; abstainPct: string; fw: string; aw: string; bw: string }[];
  voteNote: string;
  notable: { issuer: string; item: string; vote: string; meeting: string }[];
  // 5% filings
  campaigns: Campaign[]; campNote: string;
  steps: { date: string; form: string; pct: number }[];
  campOverlayNote: string; campEmpty: string; hasCamp: boolean;
  // activity
  nowLabel: string;
  newestForm: string; newestSubject: string; newestTag: string; newestAgo: string; newestWhy: string;
  sinceLastLabel: string; medGapLabel: string; posAgeLabel: string; posAsOf: string;
  nextDueLabel: string; nextDueIn: string; nextDueSub: string;
  s16Label: string; s16Sub: string;
  stream: { date: string; time: string; form: string; subject: string; tag: string; detail: string; ago: string; color: string }[];
  streamCount: string; streamNote: string;
  ledger: { k: string; asOf: string; ageLabel: string; w: string; color: string; what: string; cant: string }[];
  ledgerNote: string;
  gapBins: HistBin[]; medGap: number; cadenceNote: string;
  amendGaps: { issuer: string; form: string; gapLabel: string; w: string; pace: string; color: string }[];
  actAmendNote: string; hasAmend: boolean;
  crossings: { issuer: string; form: string; level: string; dir: string; arrow: string; date: string; detail: string; color: string }[];
  crossNote: string; hasCross: boolean;
  hourBins: HistBin[]; medHour: number; hourNote: string;
  windowRows: { form: string; date: string; day: number; hour: number }[];
  actBehaviourNote: string; actLimits: string[];
  // behaviour
  behaviour: { k: string; v: string; note: string }[]; behaviourNote: string;
  lagBins: HistBin[]; lag: number; lagNote: string;
  lagDist: UniverseDist; lagDistNote: string;
  amendSeries: number[]; amendNote: string;
  // rail
  railFacts: { k: string; v: string }[];
  railStream: { date: string; ago: string; form: string; subject: string; color: string }[];
  sourceNote: string;
}

export function managerData(cik: number | string): ManagerData {
  const M = managerByCik(cik);
  const T = M.id;
  const sd = seedN;
  const r = (k: string, lo: number, hi: number) => lo + sd(T + k) * (hi - lo);
  const ri = (k: string, lo: number, hi: number) => Math.round(r(k, lo, hi));
  const passive = M.kind.includes("index");
  const activist = M.name.includes("Activist");
  const color = mgrColor(M.kind);

  // ---------------------------------------------------------------- identity
  const positions = ri("pos", passive ? 1600 : 180, passive ? 3200 : 900);
  const posTrend = Q.map((_q, i) =>
    Math.round(positions * (1 + (i - 8) * r("pt", -0.02, 0.015) + (sd(`${T}pn${i}`) - 0.5) * 0.03)),
  );
  posTrend[8] = positions;
  const added = ri("add", 8, passive ? 90 : 64);
  const exited = ri("exit", 6, passive ? 80 : 58);
  const amendments = ri("amd", 0, 6);
  const lag = ri("lag", 36, 44);
  const f13fAccepted = Date.parse(`${Q1_END}T00:00:00Z`) + lag * DAY + (13 + Math.floor(sd(`${T}f13h`) * 5)) * 3600000;
  const f13fDate = iso(f13fAccepted);
  const nextDue = Date.parse(`${Q2_END}T00:00:00Z`) + 45 * DAY;
  const firstFiled = ri("ff", 1994, 2012);

  const profile = [
    { k: "CIK", v: M.cik, src: "EDGAR filer index" },
    { k: "Filer type", v: "13F-HR · institutional investment manager", src: "13F cover page" },
    { k: "First 13F on record", v: String(firstFiled), src: "EDGAR filing history" },
    { k: "Latest 13F accepted", v: `${f13fDate} · ${lag} days after the ${Q1_END} quarter end`, src: "EDGAR acceptance timestamp" },
    { k: "Amendments, trailing 3 years", v: String(amendments), src: "13F-HR/A" },
    { k: "Other forms on file", v: `${activist ? "SC 13D, SC 13D/A, " : ""}SC 13G, N-PX${passive ? ", N-PORT" : ""}`, src: "EDGAR filing index" },
  ];

  // ---------------------------------------------------------------- stakes
  const issuers = UNIVERSE.filter((_c, i) => sd(`${T}own${i}`) > 0.62).slice(0, 10);
  const stakes = issuers
    .map((c, i) => {
      const stake = r(`stk${i}`, 0.4, passive ? 9.2 : 6.4);
      const prior = Math.max(0.05, stake * (1 + r(`stp${i}`, -0.22, 0.22)));
      return {
        ticker: c.ticker, name: c.name, sector: SECTOR_NAMES[c.sec], sec: c.sec,
        holders: Math.round(28 + sd(`${T}hc${i}`) * 210),
        stake, prior, stakeLabel: pct(stake),
        delta: `${stake >= prior ? "↑ +" : "↓ −"}${Math.abs(stake - prior).toFixed(2)} pt`,
      };
    })
    .sort((a, b) => b.stake - a.stake);

  let cum = 0;
  let cumPrior = 0;
  const stakeTot = stakes.reduce((a, x) => a + x.stake, 0) || 1;
  const priorTot = stakes.reduce((a, x) => a + x.prior, 0) || 1;
  const pareto = stakes.map((x) => {
    cum += x.stake;
    cumPrior += x.prior;
    return { label: x.ticker, share: (x.stake / stakeTot) * 100, cum: (cum / stakeTot) * 100, cumPrior: (cumPrior / priorTot) * 100, color };
  });

  const secCounts = SECTOR_NAMES.map((n, i) => ({ k: n, n: Math.round(positions * (0.02 + sd(`${T}sc${i}`) * 0.22)) }));
  const scTot = secCounts.reduce((a, x) => a + x.n, 0) || 1;
  const stakeBySec = SECTOR_NAMES.map((_n, i) => 0.3 + sd(`${T}sw${i}`) * 3.2);
  const swTot = stakeBySec.reduce((a, x) => a + x, 0) || 1;
  const sectorMix = secCounts
    .map((x, i) => {
      const med = 6 + sd(`univ${x.k}`) * 14;
      return {
        k: x.k, pctLabel: `${((x.n / scTot) * 100).toFixed(1)}%`,
        w: `${((x.n / scTot) * 100).toFixed(1)}%`, pw: `${med.toFixed(1)}%`,
        sw: `${((stakeBySec[i] / swTot) * 100).toFixed(1)}%`,
        swLabel: `${((stakeBySec[i] / swTot) * 100).toFixed(1)}%`,
      };
    })
    .sort((a, b) => parseFloat(b.pctLabel) - parseFloat(a.pctLabel));

  const stakeBins: HistBin[] = [];
  for (let i = 0; i < 10; i++) {
    stakeBins.push({ label: `${i}${i === 9 ? "+" : ""}`, n: Math.round(Math.exp(-i * 0.45) * ri(`sb${i}`, 60, 240)), median: i === 1 });
  }

  // ---------------------------------------------------------------- voting
  const support = r("sup", passive ? 88 : 62, passive ? 97 : 92);
  const sopAgainst = r("sop", 2, 34);
  const voteCats = (
    [
      ["Director elections", 0.62], ["Say-on-pay", 0.5], ["Auditor ratification", 0.86],
      ["Equity plans", 0.44], ["Shareholder proposals — governance", 0.3],
      ["Shareholder proposals — environmental & social", 0.24],
    ] as [string, number][]
  )
    .map(([k, bias], i) => {
      const f = Math.max(4, Math.min(98, bias * 100 * (0.7 + sd(`${T}vc${i}`) * 0.55)));
      const ag = Math.max(1, Math.min(100 - f, (100 - f) * (0.5 + sd(`${T}va${i}`) * 0.45)));
      const ab = Math.max(0, 100 - f - ag);
      return {
        k, forPct: `${f.toFixed(1)}%`, againstPct: `${ag.toFixed(1)}%`, abstainPct: `${ab.toFixed(1)}%`,
        fw: `${f.toFixed(1)}%`, aw: `${ag.toFixed(1)}%`, bw: `${ab.toFixed(1)}%`, ag,
        meetings: `${ri(`vm${i}`, 40, 900)} meetings`,
      };
    })
    .sort((a, b) => b.ag - a.ag);

  const notable = stakes.slice(0, 5).map((x, i) => ({
    issuer: x.ticker,
    item: ["Say-on-pay", "Director — audit committee chair", "Equity incentive plan", "Shareholder proposal — political spending report", "Auditor ratification"][i],
    vote: ["Against", "Withhold", "For", "For", "For"][Math.floor(sd(`${T}nv${i}`) * 5)],
    meeting: `2026-0${2 + Math.floor(sd(`${T}nm${i}`) * 4)}-${String(ri(`nd${i}`, 3, 27)).padStart(2, "0")}`,
  }));

  const againstTrend = Array.from({ length: 9 }, (_x, i) =>
    Math.max(0.5, sopAgainst * (1 + (i - 8) * r("at", -0.05, 0.03) + (sd(`${T}an${i}`) - 0.5) * 0.16)),
  );
  againstTrend[8] = sopAgainst;

  // ---------------------------------------------------------------- 5% filings
  const campIssuers = stakes.filter((_x, i) => sd(`${T}cf${i}`) > (activist ? 0.35 : 0.78)).slice(0, activist ? 4 : 2);
  const campaigns: Campaign[] = campIssuers.map((x, i) => {
    const form = activist && i < 2 ? "SC 13D" : "SC 13G";
    const n = ri(`ce${i}`, 2, 4);
    const evs: CampEvent[] = [];
    let p = Math.max(5.0, x.stake - r(`cs${i}`, 0.4, 2.2));
    for (let k = 0; k < n; k++) {
      const mo = 2 + k * 2 + ri(`cm${i}${k}`, 0, 1);
      const yr = 2025 + (mo > 12 ? 1 : 0);
      const m = ((mo - 1) % 12) + 1;
      if (k) p = Math.max(5.0, p + r(`ck${i}_${k}`, -0.3, 1.3));
      evs.push({ date: `${yr}-${String(m).padStart(2, "0")}-${String(ri(`cd${i}${k}`, 2, 26)).padStart(2, "0")}`, pct: p, tag: k === 0 ? "initial" : `amendment ${k}` });
    }
    evs[evs.length - 1].pct = Math.max(5.0, x.stake);
    return { name: x.ticker, form: `${form} · ${x.name}`, formCode: form, color: form === "SC 13D" ? "var(--gaap-color)" : "var(--accent)", evs };
  });

  const steps = campaigns.length
    ? campaigns[0].evs.map((e, i) => ({ date: e.date, form: campaigns[0].formCode + (i ? `/A ${i}` : ""), pct: e.pct }))
    : [];

  // ---------------------------------------------------------------- filing activity
  // Section 16 applies above 10% of a class, read off the highest stake ever reported — the
  // same figures the acceptance stream prints, so the two can never disagree.
  const allPcts = campaigns.flatMap((c) => c.evs.map((e) => e.pct));
  const maxStake = allPcts.length ? Math.max(...allPcts) : stakes.length ? stakes[0].stake : 0;
  const isInsider = maxStake >= 10;
  const at = (dateStr: string, seed: string) =>
    Date.parse(`${dateStr}T${String(13 + Math.floor(sd(T + seed) * 6)).padStart(2, "0")}:${String(Math.floor(sd(`${T}${seed}m`) * 60)).padStart(2, "0")}:00Z`);

  const hasRestate = sd(`${T}rst`) > 0.62;
  const npxPeriodEnd = "2025-06-30";

  interface Filing { form: string; rule: string; why: string; issuer: string | null; issuerName: string | null; scope: string | null; color: string; when: number }
  const filings: Filing[] = [];
  campaigns.forEach((c, ci) => {
    const uni = UNIVERSE.find((u) => u.ticker === c.name);
    c.evs.forEach((e, k) => {
      filings.push({
        form: c.formCode + (k ? `/A ${k}` : ""),
        rule: c.formCode === "SC 13D" ? "prompt" : "annual or on crossing",
        why: k ? `amendment — stake now ${e.pct.toFixed(1)}%` : `stake first reported above 5% at ${e.pct.toFixed(1)}%`,
        issuer: c.name, issuerName: uni ? uni.name : c.name, scope: null, color: c.color,
        when: at(e.date, `ev${ci}_${k}`),
      });
    });
    if (isInsider && c.evs[c.evs.length - 1].pct >= 10) {
      const last = c.evs[c.evs.length - 1];
      filings.push({ form: "Form 4", rule: "2 business days", why: "transaction by a >10% owner", issuer: c.name, issuerName: uni ? uni.name : c.name, scope: null, color: "var(--accent)", when: at(last.date, `f4${ci}`) + ri(`f4d${ci}`, 3, 26) * DAY });
      filings.push({ form: "Form 144", rule: "at or before sale", why: "notice of a proposed sale", issuer: c.name, issuerName: uni ? uni.name : c.name, scope: null, color: "var(--accent)", when: at(last.date, `f1${ci}`) + ri(`f1d${ci}`, 2, 20) * DAY });
    }
  });
  filings.push({ form: "13F-HR", rule: "45 days after quarter end", why: `positions held at ${Q1_END}`, issuer: null, issuerName: null, scope: `${d0(positions)} positions`, color: "var(--accent)", when: f13fAccepted });
  if (hasRestate) filings.push({ form: "13F-HR/A", rule: "no deadline", why: `restates the ${Q1_END} table`, issuer: null, issuerName: null, scope: "restates the prior table", color: "var(--accent)", when: f13fAccepted + ri("rstd", 12, 40) * DAY });
  filings.push({ form: "N-PX", rule: "by 31 August", why: `ballots cast in the year to ${npxPeriodEnd}`, issuer: null, issuerName: null, scope: "all ballots cast", color: "var(--accent)", when: at(`2025-08-${String(ri("npxd", 18, 29)).padStart(2, "0")}`, "npx") });

  const streamRows = filings
    .filter((f) => f.when <= NOW)
    .sort((a, b) => b.when - a.when)
    .map((f) => ({
      ...f, at: f.when, date: iso(f.when), time: `${hhmm(f.when)} UTC`, ago: ago(NOW - f.when),
      subject: f.issuerName ?? "Whole register",
      tag: f.issuer ?? (f.scope ?? ""),
      detail: `${f.why} · ${f.rule}`,
    }));
  const stream = streamRows.slice(0, 9);
  const newest = stream[0];
  const sinceMs = NOW - newest.at;
  const sinceLast = Math.round(sinceMs / DAY);
  const f4Count = filings.filter((f) => f.form === "Form 4" && f.when <= NOW).length;
  const f144Count = filings.filter((f) => f.form === "Form 144" && f.when <= NOW).length;

  // ---------------------------------------------------------------- staleness ledger
  const newestOf = (pred: (form: string) => boolean) =>
    filings.filter((f) => f.when <= NOW && pred(f.form)).sort((a, b) => b.when - a.when)[0] ?? null;
  const blockFiling = newestOf((f) => f.startsWith("SC 13"));
  const f4Filing = newestOf((f) => f === "Form 4");
  const f144Filing = newestOf((f) => f === "Form 144");
  const asOfDays = (dstr: string) => Math.round((NOW - Date.parse(`${dstr}T00:00:00Z`)) / DAY);

  const ledgerRaw = [
    { k: "13F-HR positions", asOf: Q1_END as string | null, age: asOfDays(Q1_END) as number | null,
      what: "Every position held at quarter end, above the $100M table threshold.",
      cant: `Says nothing about any trade made inside the quarter, or since it ended. The ${Q2_END} table is not due until ${iso(nextDue)}.` },
    { k: "SC 13D / 13G stakes", asOf: blockFiling ? iso(blockFiling.when) : null, age: blockFiling ? Math.round((NOW - blockFiling.when) / DAY) : null,
      what: "Stake above 5% in a named issuer, as of the filing date.",
      cant: blockFiling ? "Only exists above 5%; a 4.9% stake is invisible." : "This manager holds no position above 5% anywhere." },
    { k: "Form 4 transactions", asOf: f4Filing ? iso(f4Filing.when) : null, age: f4Filing ? Math.round((NOW - f4Filing.when) / DAY) : null,
      what: "Dated transactions, filed within two business days.",
      cant: f4Filing ? "Only applies while the manager is a >10% owner or an officer."
        : isInsider ? "Section 16 applies to this manager, but no Form 4 is on record for the period shown."
        : "No reported stake reaches 10% of a class, so Section 16 does not apply and no Form 4 is due." },
    { k: "N-PX votes", asOf: npxPeriodEnd as string | null, age: asOfDays(npxPeriodEnd) as number | null,
      what: "Every ballot cast, with the vote and the recommendation.",
      cant: "Filed once a year, so the newest vote may be over a year old." },
    { k: "Form 144 notices", asOf: f144Filing ? iso(f144Filing.when) : null, age: f144Filing ? Math.round((NOW - f144Filing.when) / DAY) : null,
      what: "Shares proposed for sale, filed at or before the sale.",
      cant: f144Filing ? "A notice is permission, not a sale — only a Form 4 records settlement."
        : isInsider ? "Eligible to file, but no notice is on record for the period shown."
        : "Requires restricted or affiliate stock; none is reported for this manager." },
  ];
  const ledgerMax = Math.max(...ledgerRaw.map((x) => x.age ?? 0)) || 1;
  const ledger = ledgerRaw.map((x) => ({
    k: x.k, what: x.what, cant: x.cant,
    asOf: x.asOf ? `as of ${x.asOf}` : "no filing on record",
    ageLabel: x.age === null ? "—" : `${x.age} d old`,
    w: x.age === null ? "0%" : `${((x.age / ledgerMax) * 100).toFixed(1)}%`,
    // Age buckets, not a severity ramp: the darkest band means oldest, and old is not bad.
    color: x.age === null ? "var(--border-strong)" : x.age < 60 ? "var(--accent)" : x.age < 250 ? "#A88C5F" : "var(--border-strong)",
  }));

  // ---------------------------------------------------------------- cadence
  const accAsc = streamRows.map((f) => f.at).sort((a, b) => a - b);
  const gapDays: number[] = [];
  for (let i = 1; i < accAsc.length; i++) gapDays.push(Math.max(1, Math.round((accAsc[i] - accAsc[i - 1]) / DAY)));
  const sortedGaps = gapDays.slice().sort((a, b) => a - b);
  const medGap = sortedGaps.length ? sortedGaps[Math.floor(sortedGaps.length / 2)] : 0;
  const gapMax = sortedGaps.length ? sortedGaps[sortedGaps.length - 1] : 1;
  const binW = Math.max(5, Math.ceil(gapMax / 8 / 5) * 5);
  const gapBins: HistBin[] = [];
  for (let b = 0; b < 8; b++) {
    const lo = b * binW;
    const hi = lo + binW;
    gapBins.push({ label: `${lo}${b === 7 ? "+" : ""}`, n: gapDays.filter((g) => g >= lo && (b === 7 || g < hi)).length, median: lo <= medGap && (b === 7 || medGap < hi) });
  }

  const amendGaps = campaigns.slice(0, 5).map((c) => {
    if (c.evs.length < 2) return { issuer: c.name, form: c.formCode, gapLabel: "no amendment", w: "0%", pace: "no amendment on file", color: c.color };
    const g = Math.max(1, Math.round((Date.parse(c.evs[1].date) - Date.parse(c.evs[0].date)) / DAY));
    return {
      issuer: c.name, form: c.formCode, gapLabel: `${g} d`,
      w: `${Math.min(100, (g / 180) * 100).toFixed(0)}%`,
      pace: g < 21 ? "amended within three weeks" : g < 90 ? "amended within a quarter" : "no amendment for months",
      color: c.color,
    };
  });

  // ---------------------------------------------------------------- crossings
  const crossings: ManagerData["crossings"] = [];
  campaigns.forEach((c) => {
    c.evs.forEach((e, k) => {
      if (!k) {
        crossings.push({ issuer: c.name, form: c.formCode, date: e.date, level: "5%", dir: "crossed upward", arrow: "↑", color: c.color, detail: `first reported at ${e.pct.toFixed(1)}%` });
        return;
      }
      const prev = c.evs[k - 1].pct;
      const now = e.pct;
      for (const lvl of [10, 15, 20]) {
        if (prev < lvl && now >= lvl)
          crossings.push({ issuer: c.name, form: `${c.formCode}/A ${k}`, date: e.date, level: `${lvl}%`, dir: "crossed upward", arrow: "↑", color: c.color, detail: `${prev.toFixed(1)}% → ${now.toFixed(1)}%` });
        if (prev >= lvl && now < lvl)
          crossings.push({ issuer: c.name, form: `${c.formCode}/A ${k}`, date: e.date, level: `${lvl}%`, dir: "crossed downward", arrow: "↓", color: c.color, detail: `${prev.toFixed(1)}% → ${now.toFixed(1)}%` });
      }
    });
  });

  // ---------------------------------------------------------------- hour + window
  const hours = streamRows.map((f) => new Date(f.at).getUTCHours());
  const hLo = Math.min(...hours);
  const hHi = Math.max(...hours);
  const hSorted = hours.slice().sort((a, b) => a - b);
  const medHour = hSorted[Math.floor(hSorted.length / 2)];
  const hourBins: HistBin[] = [];
  for (let h = hLo; h <= hHi; h++) hourBins.push({ label: String(h), n: hours.filter((x) => x === h).length, median: h === medHour });

  const windowRows = streamRows
    .filter((f) => f.form.startsWith("13F"))
    .map((f) => ({ form: f.form, date: f.date, day: Math.round((Date.parse(f.date) - Date.parse(`${Q1_END}T00:00:00Z`)) / DAY), hour: new Date(f.at).getUTCHours() }));

  // ---------------------------------------------------------------- universe position
  const distOf = (key: string, lo: number, hi: number, f: (v: number) => string, val: number): UniverseDist => {
    const vals = MANAGER_ROSTER.map((m) => ({ ticker: m.name, val: lo + sd(m.id + key) * (hi - lo) }));
    const sorted = vals.map((v) => v.val).slice().sort((x, y) => x - y);
    const q = (p: number) => sorted[Math.max(0, Math.min(sorted.length - 1, Math.round(p * (sorted.length - 1))))];
    const pctl = Math.round((vals.filter((v) => v.val < val).length / Math.max(1, vals.length - 1)) * 100);
    return { vals, min: sorted[0], max: sorted[sorted.length - 1], q1: q(0.25), med: q(0.5), q3: q(0.75), label: `${f(val)} · P${pctl}`, medLabel: `median ${f(q(0.5))}`, focalVal: val };
  };

  const behaviour = [
    { k: "Median acceptance lag", v: dys(lag), note: "The statutory deadline is 45 days after quarter end, so no register is complete before then." },
    { k: "Positions reported", v: d0(positions), note: "Each line is one issuer and class on the 13F information table." },
    { k: "Issuers added this quarter", v: d0(added), note: "Present in this quarter’s table and absent from the last." },
    { k: "Issuers exited this quarter", v: d0(exited), note: "A holding falling under the $100M reporting threshold reads as an exit." },
    { k: "Amendments on file", v: d0(amendments), note: "A 13F-HR/A restates a table already filed." },
    { k: "Confidential treatment requests", v: d0(ri("ctr", 0, 3)), note: "Positions withheld under a granted request are absent from the public table for that quarter." },
  ];

  const lagBins: HistBin[] = [];
  for (let dd = 33; dd <= 46; dd++) {
    const wgt = Math.exp(-((dd - lag) ** 2) / 7);
    lagBins.push({ label: String(dd), n: Math.round(wgt * ri(`lb${dd}`, 60, 150)) + ri(`lb2${dd}`, 0, 5), median: dd === lag });
  }

  return {
    name: M.name, kind: M.kind, cik: M.cik, kindColor: color, id: M.id,
    positions: d0(positions), addedLabel: d0(added), exitedLabel: d0(exited), lagLabel: dys(lag),
    posTrend,
    posTrendNote: "Positions reported on each quarter’s 13F information table. A change can be a real decision or an issuer crossing the $100M reporting threshold — the filing does not distinguish them.",
    profile,
    stakes, pareto,
    paretoNote: "Bars are each disclosed stake as a share of this manager’s ten largest stakes; the solid line is the running total and the dotted line the same issuers one quarter earlier. This is a footprint across registers, not a portfolio weighting — 13F dollar columns are market-priced and are not used.",
    sectorMix,
    sectorNote: `Share of the manager’s reported positions by issuer sector, counted one position per issuer. The tick is the median across all ${MANAGER_ROSTER.length} managers in this prototype. Counting positions avoids the market-priced value column entirely, so a large and a small holding count the same.`,
    stakeBins,
    stakeHistNote: "Distribution of this manager’s disclosed stakes. Most sit under the 5% threshold that would require a Schedule 13D or 13G, which is why so few managers ever file one.",
    scatterNote: "Each dot is one issuer: how large this manager’s stake is, against how many managers report that issuer at all. Lower right is a large stake in a thinly held register; upper left a small stake in a crowded one. Both axes come from 13F tables.",
    supportLabel: pct(support), sopLabel: pct(sopAgainst),
    againstTrend,
    againstNote: "Share of compensation votes cast against, by N-PX year. A rising line means more dissent, not better or worse stewardship.",
    sopDist: distOf("sop", 2, 34, pct, sopAgainst),
    sopDistNote: `Against-say-on-pay rate against all ${MANAGER_ROSTER.length} managers. Position in the distribution is not a verdict — managers differ in policy, not only in judgment.`,
    voteCats,
    voteNote: "Every bar is 100% of the ballots this manager reported voting in that category over the N-PX year, split for / against / abstain-or-withheld and ordered by the against share. N-PX records how the manager voted, not why.",
    notable,
    campaigns,
    campNote: "One lane per issuer where this manager crossed 5%. The dot is a filing and the figure above it the stake reported in it. 13D and 13G are the manager’s own election of form — 13G is available only to passive holders — shown as identity, not judgment.",
    steps,
    campOverlayNote: "Every 5% position on one axis, so sequential and overlapping campaigns are distinguishable. Each line holds flat between filings because that is all the filings assert.",
    campEmpty: "This manager has no Schedule 13D or 13G on file for the issuers shown. Every disclosed stake sits below the 5% threshold that triggers the requirement.",
    hasCamp: campaigns.length > 0,
    nowLabel: `${iso(NOW)} ${hhmm(NOW)} UTC`,
    newestForm: newest.form, newestSubject: newest.subject, newestTag: newest.tag, newestAgo: newest.ago, newestWhy: newest.why,
    sinceLastLabel: ago(sinceMs).replace(" ago", ""), medGapLabel: `${medGap} d`,
    posAgeLabel: `${ledgerRaw[0].age} d`, posAsOf: String(ledgerRaw[0].asOf),
    nextDueLabel: iso(nextDue), nextDueIn: `${Math.round((nextDue - NOW) / DAY)} d`,
    nextDueSub: `${Q2_END} table · 45 days after quarter end`,
    s16Label: f4Count + f144Count ? String(f4Count + f144Count) : "none",
    s16Sub: f4Count + f144Count
      ? `${f4Count} Form 4 · ${f144Count} Form 144 on record`
      : `highest stake ever reported is ${maxStake.toFixed(1)}% · Section 16 applies above 10%`,
    stream: stream.map((f) => ({ date: f.date, time: f.time, form: f.form, subject: f.subject, tag: f.tag, detail: f.detail, ago: f.ago, color: f.color })),
    streamCount: streamRows.length > 9 ? `9 most recent of ${streamRows.length} on record` : `${streamRows.length} on record`,
    streamNote: `EDGAR acceptance timestamps, newest first. The timestamp is when the filing was lodged, not when the act it describes happened — the 13F-HR above reports positions held at ${Q1_END}, ${Math.round((NOW - Date.parse(Q1_END)) / DAY)} days before today.`,
    ledger,
    ledgerNote: "Age is measured from the date the fact refers to, not the date it was filed. A row with no filing on record is a structural absence: the form does not apply to this manager.",
    gapBins, medGap,
    cadenceNote: `Every bar counts gaps between two filings on this manager’s EDGAR record — ${gapDays.length} gaps across ${accAsc.length} filings, median ${medGap} days. It is the baseline that makes a quiet period readable: ${sinceLast} days since the last filing is ${sinceLast > medGap ? "longer" : "shorter"} than this manager’s usual gap, and nothing more than that.`,
    amendGaps,
    actAmendNote: "Days from each 5% filing to its next amendment. A 13D must be amended promptly on a material change, so a short gap is the filing record of an active position; a long gap is not evidence of inactivity, only of nothing requiring amendment.",
    hasAmend: amendGaps.length > 0,
    crossings,
    crossNote: "A crossing of 5%, 10%, 15% or 20% obliges a filing, so the filing date is the event date. Direction is as stated in the filing, not inferred from a change in value.",
    hasCross: crossings.length > 0,
    hourBins, medHour,
    hourNote: `One count per filing on this manager’s record — ${hours.length} filings between ${hLo}:00 and ${hHi}:00 UTC, median ${medHour}:00. With this few filings the shape is indicative only.`,
    windowRows,
    actBehaviourNote: `The strip is the statutory 13F window for the ${Q1_END} quarter: day 0 is quarter end and day 45 the deadline. ${
      windowRows.length === 1 ? `One 13F filing is on record for this quarter, lodged on day ${windowRows[0].day}.` : `${windowRows.length} 13F filings are on record for this quarter.`
    } Where a filing sits in the window describes filing behaviour, not the positions inside it.`,
    actLimits: [
      "No position is real-time. A 13F reports quarter end and may be filed 45 days later, so an intra-quarter entry and exit never appears in any filing.",
      "Only the filing act is near-real-time: EDGAR acceptance timestamps arrive within minutes.",
      "Form 4 and Form 144 exist only where the manager is a Section 16 insider — for most managers there are none at all.",
      "“Prompt” amendment of a 13D is not defined as a fixed number of days, so amendment gaps are not deadlines.",
      "A quiet period is silence in the filings, not an absence of trading.",
    ],
    behaviour,
    behaviourNote: "All six figures come from EDGAR metadata and the manager’s own tables. None of them says whether the manager is skilled — they describe how and when it files.",
    lagBins, lag,
    lagNote: "Distribution of acceptance lag across this manager’s 13F filings, in days after quarter end.",
    lagDist: distOf("lag", 33, 45, dys, lag),
    lagDistNote: `This manager’s median acceptance lag against all ${MANAGER_ROSTER.length} managers: grey dots are the other filers, the band the interquartile range and the tick the median.`,
    amendSeries: Q.map((_q, i) => 0.5 + sd(`${T}ar${i}`) * 6),
    amendNote: "Amended 13F filings per 100 filings, by quarter. An amendment restates a table already filed.",
    railFacts: [
      { k: "Classification", v: M.kind },
      { k: "CIK", v: M.cik },
      { k: "Positions", v: d0(positions) },
      { k: "Latest 13F", v: f13fDate },
      { k: "Since last filing", v: ago(sinceMs).replace(" ago", "") },
      { k: "5% positions", v: campaigns.length ? String(campaigns.length) : "none" },
    ],
    railStream: stream.slice(0, 6).map((f) => ({ date: f.date, ago: f.ago, form: f.form, subject: f.tag ? `${f.subject} · ${f.tag}` : f.subject, color: f.color })),
    sourceNote: "Every figure on this page is derived from this manager’s own filings — 13F-HR information tables, Schedules 13D and 13G, N-PX voting records and EDGAR acceptance metadata. Figures in this prototype are synthetic.",
  };
}

export const MANAGER_QUARTERS = Q;
export const NPX_YEARS = ["2018", "2019", "2020", "2021", "2022", "2023", "2024", "2025", "2026"];
