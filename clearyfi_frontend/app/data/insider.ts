/**
 * ⚠️ DEPRECATED (2026-08-11) — the Insider activity view no longer reads this module.
 *
 * `insiderData` and `f144Ledger` are SYNTHETIC. They were the accepted design's figures, and the
 * view now builds the same surfaces from real Forms 3/4/5 in `data/api.ts`'s `toInsiderActivity`
 * (`/insider-trades` + `/insider-summary`) and real Form 144 filing dates from
 * `/proposed-sale-notices`. Nothing here should be wired into a view again.
 *
 * Kept rather than deleted, on the same terms as `surfaces.ts` and `metrics.ts`: `hub-catalog.ts`
 * still re-exports `CODES` and the row TYPES from here, and the code definitions themselves are
 * the honest Table I glossary the real adapter re-states. It goes when those references go.
 *
 * ---
 *
 * Company Hub → Insider activity, ported from the prototype's `insiderData` and `f144Ledger`.
 *
 * EVERY figure on the view is read off ONE ledger of Section 16 filings for the issuer — the
 * tiles, the disposition split, the code mix, the per-person rollup and the latency histogram
 * all derive from the same 19 rows. That is structural, not stylistic: the moment two panels
 * sample independently they can disagree, and a page that contradicts itself is worse than one
 * that shows less.
 *
 * Synthetic (see `data/README.md`), seeded from the ticker so a filer renders the figures the
 * design was drawn against.
 */
import { seedN } from "../lib/seed";
import { PEER_TICKERS } from "./qualitative";

/** The prototype's fixed "today". Every date on the view is measured back from it. */
const NOW = Date.UTC(2026, 6, 24);
const DAY = 86400000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export type Side = "in" | "out";

export interface CodeDef {
  label: string;
  side: Side;
  what: string;
}

/**
 * Form 4 Table I transaction codes.
 *
 * The `side` split is mechanical — it says which way shares moved, not whether anyone decided
 * anything. Only P is a purchase with the filer's own money and only S is a decision to sell;
 * A, M and F move shares as a consequence of a plan or a vesting schedule.
 */
export const CODES: Record<string, CodeDef> = {
  A: { label: "A · award or grant", side: "in", what: "Shares issued by the company under a plan. No purchase." },
  M: { label: "M · derivative exercise", side: "in", what: "Options or units exercised into shares." },
  P: {
    label: "P · open-market purchase",
    side: "in",
    what: "Shares bought with the filer’s own money — the only acquisition that is a decision to buy.",
  },
  S: { label: "S · open-market sale", side: "out", what: "Shares sold in the market." },
  F: {
    label: "F · withheld for tax",
    side: "out",
    what: "Withheld by the issuer to cover tax at vesting. Not a decision to sell.",
  },
  D: { label: "D · disposition to issuer", side: "out", what: "Returned to the company." },
  G: { label: "G · gift", side: "out", what: "Given away; no consideration received." },
};

const SHORT: Record<string, string> = {
  A: "A · award", M: "M · exercise", P: "P · purchase", S: "S · sale",
  F: "F · tax withheld", D: "D · to issuer", G: "G · gift",
};

const PEOPLE = [
  { name: "Chief Executive Officer", role: "officer & director" },
  { name: "Chief Financial Officer", role: "officer" },
  { name: "EVP, Operations", role: "officer" },
  { name: "SVP, Worldwide Sales", role: "officer" },
  { name: "General Counsel", role: "officer" },
  { name: "Chief Accounting Officer", role: "officer" },
  { name: "Director (audit chair)", role: "director" },
  { name: "Director", role: "director" },
];

export interface F144Notice {
  person: string;
  size: number;
  date: string;
  plan: boolean;
  adopted: string | null;
  broker: string;
}

/**
 * Form 144 notices of proposed sale.
 *
 * A notice is permission, not a transaction. Where it references a Rule 10b5-1 plan the plan
 * must PRE-DATE the notice, which is why `adopted` is generated backwards from the notice date
 * rather than independently — a plan adopted after the notice that cites it is impossible.
 */
export function f144Ledger(T: string): F144Notice[] {
  const ri = (s: string, lo: number, hi: number) => Math.round(lo + seedN(`${T}ia${s}`) * (hi - lo));
  const ROLES = [
    "Chief Executive Officer", "Chief Financial Officer", "EVP, Operations",
    "SVP, Worldwide Sales", "General Counsel", "Director",
  ];
  const out: F144Notice[] = [];
  for (let i = 0; i < 12; i++) {
    const plan = seedN(`${T}ia4pl${i}`) > 0.35;
    const date = iso(NOW - ri(`ia4d${i}`, 5, 170) * DAY);
    const adopted = plan ? iso(Date.parse(`${date}T00:00:00Z`) - ri(`ia4ad${i}`, 95, 320) * DAY) : null;
    out.push({
      person: ROLES[Math.floor(seedN(`${T}ia4p${i}`) * ROLES.length)],
      size: (2 + Math.floor(seedN(`${T}ia4s${i}`) * 40)) * 1000,
      date,
      plan,
      adopted,
      broker: plan ? `under a Rule 10b5-1 plan adopted ${adopted}` : "no plan referenced",
    });
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : -1));
}

export interface LedgerRow {
  person: string;
  role: string;
  code: string;
  codeLabel: string;
  codeShort: string;
  shares: number;
  sharesLabel: string;
  side: Side;
  plan: boolean;
  planLabel: string;
  tDate: string;
  fDate: string;
  bd: number;
  late: boolean;
  lagLabel: string;
  lagLate: boolean;
}

export interface InsiderData {
  window: string;
  tiles: { k: string; v: string; sub: string }[];
  rows: LedgerRow[];
  ledgerCount: number;
  acqCount: number;
  dispCount: number;
  sharesSplit: { label: string; sh: number; pct: number; color: string; shLabel: string; pctLabel: string }[];
  splitNote: string;
  codeMix: { code: string; label: string; what: string; n: number; shLabel: string; w: string; dim: string; note: string }[];
  people: { name: string; role: string; n: string; codes: string; net: number; netLabel: string; arrow: string }[];
  peopleNote: string;
  lagBins: { label: string; n: number; median?: boolean }[];
  medBd: number;
  lagNote: string;
  ratioDist: {
    vals: { ticker: string; val: number }[];
    min: number; max: number; q1: number; med: number; q3: number; focalVal: number;
  };
  ratioNote: string;
  f144Cal: F144Notice[];
  f144Note: string;
  notices: { person: string; shares: string; date: string; broker: string }[];
  links: { forms4: string; f144: string; proxy: string };
  forms: { k: string; when: string; what: string }[];
  limits: string[];
  insiderOwn: string;
}

export function insiderData(T: string): InsiderData {
  const rnd = (s: string, lo: number, hi: number) => lo + seedN(`${T}ia${s}`) * (hi - lo);
  const ri = (s: string, lo: number, hi: number) => Math.round(rnd(s, lo, hi));

  // ---------------------------------------------------------------- the one ledger
  const deck = ["A", "M", "F", "S", "S", "F", "A", "M", "S", "F", "D", "G", "P", "S", "A", "F"];
  const ledger: LedgerRow[] = [];
  for (let i = 0; i < 19; i++) {
    const p = PEOPLE[Math.floor(seedN(`${T}iap${i}`) * PEOPLE.length)];
    const code = deck[Math.floor(seedN(`${T}iac${i}`) * deck.length)];
    const tMs = NOW - ri(`iad${i}`, 2, 178) * DAY;
    const bd = ri(`ial${i}`, 1, 4);
    // Business days, so a filing that spans a weekend lands two calendar days later.
    const fMs = tMs + (bd + (bd > 2 ? 2 : 0)) * DAY;
    const shares = (1 + Math.floor(seedN(`${T}ias${i}`) * 58)) * 1000;
    const plan = code === "S" ? seedN(`${T}iapl${i}`) > 0.4 : false;
    const late = bd > 2;
    ledger.push({
      person: p.name, role: p.role, code,
      codeLabel: CODES[code].label, codeShort: SHORT[code],
      shares, sharesLabel: `${shares.toLocaleString()} sh`,
      side: CODES[code].side,
      plan,
      planLabel: plan ? "under a 10b5-1 plan" : code === "S" ? "no plan referenced" : "no plan required",
      tDate: iso(tMs), fDate: iso(fMs), bd, late,
      lagLabel: `${bd} bd${late ? " · late" : ""}`,
      lagLate: late,
    });
  }
  ledger.sort((a, b) => (a.fDate < b.fDate ? 1 : -1));

  const sum = (f: (r: LedgerRow) => boolean) => ledger.filter(f).reduce((a, r) => a + r.shares, 0);
  const acqCount = ledger.filter((r) => r.side === "in").length;
  const dispCount = ledger.filter((r) => r.side === "out").length;
  const inSh = sum((r) => r.side === "in");
  const outSh = sum((r) => r.side === "out");
  const saleSh = sum((r) => r.code === "S");
  const taxSh = sum((r) => r.code === "F");
  const buySh = sum((r) => r.code === "P");
  const planSh = sum((r) => r.plan);
  const discSh = saleSh - planSh;
  const outTot = outSh || 1;

  const sharesSplit = [
    { label: "Open-market sales, under a plan", sh: planSh, color: "var(--accent)" },
    { label: "Open-market sales, no plan referenced", sh: discSh, color: "var(--accent-wash)" },
    { label: "Withheld for tax at vesting", sh: taxSh, color: "var(--border-strong)" },
    { label: "Gifts and dispositions to the issuer", sh: outSh - saleSh - taxSh, color: "#8B8579" },
  ]
    .filter((s) => s.sh > 0)
    .map((s) => ({
      ...s,
      pct: Math.max(0, Math.round((s.sh / outTot) * 100)),
      shLabel: `${s.sh.toLocaleString()} sh`,
      pctLabel: `${Math.max(0, Math.round((s.sh / outTot) * 100))}%`,
    }));

  // ---------------------------------------------------------------- code mix
  // Every code is listed, including the ones with no filings — an absent code is a fact about
  // the period, and dropping the row would hide it.
  const codeMix = Object.keys(CODES).map((k) => {
    const set = ledger.filter((r) => r.code === k);
    const sh = set.reduce((a, r) => a + r.shares, 0);
    return {
      code: k,
      label: CODES[k].label,
      what: CODES[k].what,
      n: set.length,
      shLabel: set.length ? `${sh.toLocaleString()} sh` : "—",
      w: `${Math.round((sh / Math.max(inSh, outSh)) * 100)}%`,
      dim: set.length ? "1" : "0.45",
      note: set.length ? "" : "no transaction with this code on file for the period",
    };
  });

  // ---------------------------------------------------------------- per person
  const people = Array.from(new Set(ledger.map((r) => r.person)))
    .map((name) => {
      const set = ledger.filter((r) => r.person === name);
      const net = set.reduce((a, r) => a + (r.side === "in" ? r.shares : -r.shares), 0);
      return {
        name,
        role: set[0].role,
        n: `${set.length} ${set.length === 1 ? "filing" : "filings"}`,
        codes: Array.from(new Set(set.map((r) => r.code))).sort().join(" "),
        net,
        netLabel: `${net >= 0 ? "+" : "−"}${Math.abs(net).toLocaleString()} sh`,
        arrow: net > 0 ? "↑" : net < 0 ? "↓" : "→",
      };
    })
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net));

  // ---------------------------------------------------------------- latency vs the 2-day rule
  const bdSorted = ledger.map((r) => r.bd).sort((a, b) => a - b);
  const medBd = bdSorted[Math.floor(bdSorted.length / 2)];
  const lagBins = [1, 2, 3, 4, 5].map((d) => ({
    label: String(d),
    n: ledger.filter((r) => r.bd === d).length,
    median: d === medBd,
  }));
  const lateN = ledger.filter((r) => r.late).length;
  const lagNote =
    "Section 16(a) requires a Form 4 within two business days of the transaction. " +
    (lateN
      ? `${lateN} of ${ledger.length} filings in this window landed later than that; a pattern of late filings is disclosed by the company itself under Item 405 of the proxy.`
      : "Every filing in this window met the deadline. Item 405 of the proxy reports no delinquency.");

  // ---------------------------------------------------------------- Form 144
  const f144Cal = f144Ledger(T);
  const noticeSh = f144Cal.reduce((a, n) => a + n.size, 0);
  const followRate = Math.round((saleSh / Math.max(1, noticeSh)) * 100);

  // ---------------------------------------------------------------- peer position
  const focalRatio = inSh / Math.max(1, outSh);
  const vals = PEER_TICKERS.map((tk) => ({
    ticker: tk,
    val: tk === T ? focalRatio : 0.15 + seedN(`${tk}iar1`) * 2.4,
  }));
  const nums = vals.map((v) => v.val).sort((a, b) => a - b);
  const qq = (t: number) => nums[Math.min(nums.length - 1, Math.floor(t * nums.length))];

  const insiderOwn = `${(0.2 + seedN(`${T}io`) * 7.2).toFixed(1)}%`;
  const e = (type: string) =>
    `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${encodeURIComponent(T)}&type=${encodeURIComponent(type)}`;

  return {
    window: "trailing 180 days · as filed, newest first",
    tiles: [
      { k: "Section 16 filings", v: String(ledger.length), sub: "Forms 3/4/5 · trailing 180 days" },
      { k: "Acquisition vs disposition filings", v: `${acqCount} / ${dispCount}`, sub: "count of filings, not shares" },
      {
        k: "Net shares moved",
        v: `${inSh - outSh >= 0 ? "+" : "−"}${Math.abs(inSh - outSh).toLocaleString()}`,
        sub: "acquired less disposed, all codes",
      },
      { k: "Open-market purchases", v: buySh ? `${buySh.toLocaleString()} sh` : "none", sub: "code P — cash out of pocket" },
      { k: "Insider ownership", v: insiderOwn, sub: "DEF 14A beneficial ownership table" },
      { k: "Median filing latency", v: `${medBd} bd`, sub: "rule is two business days" },
    ],
    rows: ledger.slice(0, 9),
    ledgerCount: ledger.length,
    acqCount,
    dispCount,
    sharesSplit,
    splitNote:
      "Shares disposed, split by what the transaction code says the disposition was. The tax-withholding slice is not selling.",
    codeMix,
    people,
    peopleNote:
      "Net shares per person across every code. A large negative figure is usually vesting and withholding, not a sale of a stake.",
    lagBins,
    medBd,
    lagNote,
    ratioDist: {
      vals, min: nums[0], max: nums[nums.length - 1],
      q1: qq(0.25), med: qq(0.5), q3: qq(0.75), focalVal: focalRatio,
    },
    ratioNote:
      "Shares acquired divided by shares disposed, all codes, over the same 180-day window for every filer in the peer set. Ratio, not conviction — a filer with heavy vesting will sit low whatever its insiders think.",
    f144Cal,
    f144Note:
      "One dot per Form 144 notice, placed by filing date and sized by shares proposed. Filled dots reference a Rule 10b5-1 plan. A notice is permission to sell — only a Form 4 records that a sale happened.",
    notices: f144Cal.slice(0, 4).map((n) => ({
      person: n.person,
      shares: `${n.size.toLocaleString()} sh`,
      date: n.date,
      broker: n.broker,
    })),
    links: { forms4: e("4"), f144: e("144"), proxy: e("DEF 14A") },
    forms: [
      { k: "Form 3", when: "within 10 days of becoming an insider", what: "The opening balance — holdings at the moment Section 16 starts to apply." },
      { k: "Form 4", when: "within 2 business days of the transaction", what: "Every change in beneficial ownership, with a transaction code." },
      { k: "Form 5", when: "within 45 days of fiscal year end", what: "Small or exempt transactions not reported during the year." },
      { k: "Form 144", when: "at or before the sale", what: "Notice of proposed sale of restricted or control securities." },
      { k: "DEF 14A", when: "annually, ahead of the meeting", what: "Beneficial ownership table and Item 405 delinquency disclosure." },
    ],
    limits: [
      "A Form 4 records a transaction, not a view. Awards (A), exercises (M) and tax withholding (F) are mechanical — reading them as buying or selling conviction is a category error.",
      "Only code P is a purchase with the filer’s own money, and only code S is a decision to sell. Those two are separated out above for that reason.",
      "A sale under a Rule 10b5-1 plan was scheduled months earlier. Its date says nothing about what the insider knew that week.",
      `Form 144 is a notice of intent, not a sale. The ${followRate}% figure compares shares actually sold on Form 4 to shares noticed — it is our ratio, not a filed one.`,
      "These are shares, never dollars. Transaction prices appear on Form 4 but converting to value, or comparing to market capitalisation, would be market data.",
      "Ownership percentages come from the DEF 14A beneficial ownership table, which is dated as of the record date — months older than the newest Form 4 here.",
    ],
    insiderOwn,
  };
}
