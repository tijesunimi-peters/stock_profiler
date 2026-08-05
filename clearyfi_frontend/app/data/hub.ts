/**
 * The Company Hub's data, ported from the prototype's `hubData(st, seedN)`.
 *
 * Same seed function, same salts, same ranges, same pick-lists — so a given ticker renders the
 * figures the design was drawn against rather than a differently-random set. Still synthetic:
 * none of it may be carried into production or used as a fixture.
 */
import { seedN } from "../lib/seed";
import { GEO_COLORS } from "./prototype";

const $B = (v: number) => `$${Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2)}B`;
const $M = (v: number) => `$${Math.round(v)}M`;
const pctS = (v: number) => `${v.toFixed(1)}%`;

/** The prototype's per-ticker helpers, closed over the focal ticker. */
function seeded(T: string) {
  const rnd = (s: string, lo: number, hi: number) => lo + seedN(T + s) * (hi - lo);
  const ri = (s: string, lo: number, hi: number) => Math.round(rnd(s, lo, hi));
  const pick = <A>(a: A[], s: string): A => a[Math.floor(seedN(T + s) * a.length)];
  const gt = (s: string, x: number) => seedN(T + s) > x;
  return { rnd, ri, pick, gt };
}

export interface StatementRowData {
  label: string;
  strongRule: boolean;
  bold: boolean;
  derived: boolean;
  vals: string[];
}

export interface HubData {
  years: string[];
  changes: { tag: string; text: string; src: string }[];
  structure: {
    subCount: number;
    offshore: string;
    subs: { name: string; jur: string; own: string }[];
    note: string;
  };
  statements: {
    income: StatementRowData[];
    balance: StatementRowData[];
    cash: StatementRowData[];
  };
  segments: {
    name: string;
    rev: string;
    revW: string;
    op: string;
    margin: string;
    marginW: string;
    assets: string;
    yoy: string;
    color: string;
  }[];
  segNote: string;
  geoAssets: { name: string; amt: string; w: string; color: string }[];
  custConc: { label: string; pct: string; kind: string }[];
  capital: {
    roll: { k: string; v: string }[];
    buyback: { auth: string; remaining: string; qtr: string; src: string };
    overhang: { opts: string; rsu: string; pct: string };
    classes: { c: string; sh: string; v: string }[];
    shelf: string;
    convert: string;
    holders: { name: string; pct: string; form: string }[];
    insiderOwn: string;
  };
  /**
   * @deprecated §05 is entirely on real filings as of 2026-08-04 — §05.1 `/officer-changes`,
   * §05.2 `/audit`'s Rule 10D-1 flags + the DEF 14A `ecd` governance flags, §05.3
   * `/pay-versus-performance`, §05.4 `/insider-summary`. No field of this block is read by the
   * company hub any more. Kept because other surfaces still reference `HubData`.
   */
  governance: {
    turnover: { role: string; action: string; date: string }[];
    boardSize: number;
    indep: string;
    tenure: string;
    ceoTenure: string;
    comp: { k: string; pct: string; w: string }[];
    ceoPay: string;
    ratio: string;
    sayOnPay: string;
    related: string;
    clawback: string;
    /**
     * How many insiders are trading under a pre-adopted plan — context for the Form 4 counts.
     *
     * @deprecated §05.4 reads the real `rule_10b5_1` tally from `/insider-summary` as of
     * 2026-08-04, with the denominator the fixture never had. No longer read by the hub.
     */
    plans: string;
  };
  audit: {
    firm: string;
    tenure: string;
    change: string;
    fees: string;
    nonAudit: string;
    cams: { name: string; why: string }[];
    icfr: string;
    restate: string;
    late: string;
    nonGaap: { count: number; recur: string; items: string };
    estimates: string[];
  };
  obligations: {
    legal: { matter: string; stage: string; accrual: string; since: string }[];
    rangeNote: string;
    commitments: { y: string; amt: string; w: string }[];
    purchase: string;
    purchaseNote: string;
    restructuring:
      | { active: true; charge: string; accrual: string; paid: string; heads: string }
      | { active: false };
    guarantees: string;
    environmental: string;
    offBS: string;
  };
  footnotes: {
    rpo: { tot: string; within12: string };
    disagg: { label: string; amt: string; pct: string; w: string }[];
    inv: { label: string; amt: string; yoy: string }[];
    debtLadder: { y: string; amt: string; w: string; rate: string }[];
    tax: { rows: { k: string; v: string }[]; eff: string; va: string; utb: string };
    gwUnits: { name: string; gw: string; head: string }[];
    sbc: { tot: string; lines: { label: string; amt: string; w: string }[] };
    leases: { tot: string; wa: string; disc: string };
    capR: { cap: string; exp: string };
    allow: { open: string; prov: string; wo: string; close: string };
    defrev: { open: string; billed: string; rec: string; close: string };
  };
  timeline: { date: string; form: string; desc: string; item: string; accent: boolean }[];
  narrative: {
    rfCount: number;
    rfDelta: string;
    rfWords: string;
    rfDiff: { kind: string; text: string }[];
    mdna: string[];
    cyber: { gov: string; incident: string; framework: string };
    agreements: { t: string; date: string }[];
    humanCapital: { heads: string; turnover: string; note: string };
    guidance: string;
  };
  covenant: string;
}

export function hubData(T: string): HubData {
  const { rnd, ri, pick, gt } = seeded(T);
  const years = ["FY23", "FY24", "FY25", "FY26 TTM"];
  const rev0 = rnd("hrev", 6, 34);
  const rev = rev0 * (0.78 + 0.09 * 3 + rnd("rv3", -0.03, 0.03));

  // ---------------------------------------------------------------- 1 · identity & structure
  const jur = ["Delaware", "Ireland", "Singapore", "Cayman Islands", "Netherlands", "Israel", "Japan", "Germany", "China", "Bermuda"];
  const subs = [0, 1, 2, 3, 4, 5].map((i) => ({
    name: `${T} ${pick(["International", "Technology", "Holdings", "Semiconductor", "Trading", "Research"], `sn${i}`)} ${pick(["Ltd.", "B.V.", "Pte. Ltd.", "GmbH", "K.K.", "LLC"], `se${i}`)}`,
    jur: pick(jur, `sj${i}`),
    own: `${ri(`so${i}`, 90, 100)}%`,
  }));
  const structure = {
    subCount: ri("sc", 14, 86),
    offshore: `${ri("offs", 38, 72)}%`,
    subs,
    note: "EX-21 lists every consolidated subsidiary and its jurisdiction of organization. Concentration abroad is descriptive of structure, not of tax outcome.",
  };

  // ---------------------------------------------------------------- 2 · financial detail
  type Spec = { k: string; base: number; f: (v: number) => string; rule?: boolean; bold?: boolean; derived?: boolean };
  const isRows: Spec[] = [
    { k: "Revenue", base: rev, f: $B },
    { k: "Cost of revenue", base: -rev * 0.55, f: $B },
    { k: "Gross profit", base: rev * 0.45, f: $B, rule: true },
    { k: "Research & development", base: -rev * 0.19, f: $B },
    { k: "Selling, general & admin.", base: -rev * 0.11, f: $B },
    { k: "Operating income", base: rev * 0.15, f: $B, rule: true },
    { k: "Interest & other, net", base: -rev * 0.012, f: $B },
    { k: "Income tax provision", base: -rev * 0.026, f: $B },
    { k: "Net income", base: rev * 0.112, f: $B, rule: true, bold: true },
    { k: "Diluted EPS", base: rnd("eps", 1.2, 7.4), f: (v) => `$${v.toFixed(2)}` },
  ];
  const bsRows: Spec[] = [
    { k: "Cash & short-term investments", base: rnd("bs1", 1.5, 12), f: $B },
    { k: "Accounts receivable, net", base: rev * 0.14, f: $B },
    { k: "Inventories", base: rev * 0.16, f: $B },
    { k: "Property & equipment, net", base: rev * 0.28, f: $B },
    { k: "Goodwill & intangibles", base: rnd("bs5", 0.8, 18), f: $B },
    { k: "Total assets", base: rev * 1.9, f: $B, rule: true },
    { k: "Total debt", base: rnd("bs7", 0.3, 9), f: $B },
    { k: "Deferred revenue", base: rev * 0.05, f: $B },
    { k: "Total stockholders' equity", base: rev * 0.95, f: $B, rule: true, bold: true },
  ];
  const cfRows: Spec[] = [
    { k: "Cash from operations", base: rev * 0.24, f: $B },
    { k: "Capital expenditures", base: -rev * 0.08, f: $B },
    { k: "Free cash flow (derived)", base: rev * 0.16, f: $B, rule: true, derived: true },
    { k: "Acquisitions, net", base: -rnd("cf4", 0, 1.9), f: $B },
    { k: "Share repurchases", base: -rnd("cf5", 0.1, 4.2), f: $B },
    { k: "Dividends paid", base: -rnd("cf6", 0, 1.6), f: $B },
    { k: "Debt issued (repaid), net", base: rnd("cf7", -1.2, 1.6), f: $B },
  ];
  const mkStmt = (rows: Spec[], salt: string): StatementRowData[] =>
    rows.map((r) => ({
      label: r.k,
      strongRule: !!r.rule,
      bold: !!r.bold,
      derived: !!r.derived,
      vals: years.map((_y, i) => r.f(r.base * (0.76 + 0.08 * i) * (1 + rnd(salt + r.k + i, -0.02, 0.02)))),
    }));

  const covenant = pick(
    [
      "Net leverage ≤ 3.5x · interest coverage ≥ 3.0x",
      "No financial maintenance covenants (investment-grade notes)",
      "Total leverage ≤ 4.0x, stepping to 3.5x in FY27",
    ],
    "cov",
  );

  // ---------------------------------------------------------------- 3 · segments & geography
  const segNames = [
    pick(["Compute & graphics", "Data center", "Core products"], "g1"),
    pick(["Client & embedded", "Connectivity", "Wireless"], "g2"),
    pick(["Automotive & industrial", "Analog", "Foundry services"], "g3"),
  ];
  const sw = [rnd("sw0", 0.3, 0.55), rnd("sw1", 0.2, 0.4), 0];
  sw[2] = Math.max(0.08, 1 - sw[0] - sw[1]);
  const segments = segNames.map((n, i) => {
    const r = rev * sw[i];
    const m = rnd(`sm${i}`, -4, 42);
    const y = rnd(`sy${i}`, -18, 38);
    return {
      name: n,
      rev: $B(r),
      revW: `${(sw[i] * 100).toFixed(0)}%`,
      op: $B((r * m) / 100),
      margin: pctS(m),
      marginW: `${Math.max(2, Math.min(100, m * 2))}%`,
      assets: $B(r * rnd(`sa${i}`, 0.7, 1.8)),
      yoy: `${y > 0 ? "↑ +" : "↓ −"}${Math.abs(y).toFixed(0)}%`,
      color: GEO_COLORS[i],
    };
  });
  const geoAssets = ["United States", "Taiwan", "China", "Singapore", "Rest of world"].map((n, i) => {
    const w = [0.42, 0.19, 0.14, 0.13, 0.12][i] * (1 + rnd(`ga${i}`, -0.25, 0.25));
    return {
      name: n,
      amt: $B(rev * 0.28 * w),
      w: `${Math.round(w * 100)}%`,
      color: GEO_COLORS[i % GEO_COLORS.length],
    };
  });
  const custConc = [0, 1].map((i) => ({
    label: `Customer ${String.fromCharCode(65 + i)}`,
    pct: `${ri(`cc${i}`, 10, 26)}%`,
    kind: pick(["distributor", "OEM", "contract manufacturer"], `ck${i}`),
  }));
  const segNote = gt("reseg", 0.68)
    ? "Reportable segments were redefined in the most recent 10-K; prior periods recast."
    : "Segment definitions unchanged for three fiscal years.";

  // ---------------------------------------------------------------- 4 · capital & ownership
  const shOpen = rnd("sh", 260, 1650);
  const issued = rnd("sh2", 3, 26);
  const repurchased = -rnd("sh3", 2, 44);
  const shRoll: [string, number][] = [
    ["Shares outstanding, beginning", shOpen],
    ["Issued under equity plans", issued],
    ["Repurchased and retired", repurchased],
    ["Shares outstanding, ending", shOpen + issued + repurchased],
  ];
  const capital = {
    roll: shRoll.map(([k, v]) => ({ k, v: `${v >= 0 ? "" : "−"}${Math.abs(v).toFixed(1)}M` })),
    buyback: {
      auth: $B(rnd("ba", 1, 25)),
      remaining: $B(rnd("br", 0.2, 14)),
      qtr: $B(rnd("bq", 0.05, 1.9)),
      src: "CFF · 10-Q Item 5",
    },
    overhang: {
      opts: `${rnd("ov1", 1, 14).toFixed(1)}M`,
      rsu: `${rnd("ov2", 3, 32).toFixed(1)}M`,
      pct: `${rnd("ov3", 1.2, 6.4).toFixed(1)}%`,
    },
    classes: gt("cls", 0.72)
      ? [
          { c: "Class A common", sh: `${(shOpen * 0.72).toFixed(0)}M`, v: "1 vote" },
          { c: "Class B common", sh: `${(shOpen * 0.28).toFixed(0)}M`, v: "10 votes" },
        ]
      : [{ c: "Common stock", sh: `${shOpen.toFixed(0)}M`, v: "1 vote" }],
    shelf: pick(
      ["S-3 automatic shelf · unallocated", "No active shelf on file", "S-3 shelf · $2.0B unused capacity"],
      "shf",
    ),
    convert: gt("cv", 0.6)
      ? `Convertible notes due FY${ri("cvy", 27, 31)} · ${$B(rnd("cvv", 0.3, 2.5))} principal`
      : "No convertible instruments outstanding",
    holders: [0, 1, 2, 3].map((i) => ({
      name: pick(
        ["Institutional holder A", "Institutional holder B", "Index manager C", "Index manager D", "Founder trust", "Strategic partner"],
        `hd${i}`,
      ),
      pct: `${rnd(`hp${i}`, 3.5, 13).toFixed(1)}%`,
      form: pick(["13G", "13G", "13D", "13G/A"], `hf${i}`),
    })),
    insiderOwn: `${(0.2 + seedN(`${T}io`) * 7.2).toFixed(1)}%`,
  };

  // ---------------------------------------------------------------- 5 · governance & people
  const govRoles = [
    "Chief Executive Officer",
    "Chief Financial Officer",
    "Chief Operating Officer",
    "General Counsel",
    "Chief Accounting Officer",
    "Director",
    "Chief Technology Officer",
  ];
  const governance = {
    turnover: [0, 1, 2, 3].map((i) => ({
      role: pick(govRoles, `tr${i}`),
      action: pick(["appointed", "resigned", "retired", "transitioned to advisor", "elected to board"], `ta${i}`),
      date: `20${ri(`td${i}`, 24, 26)}-${String(ri(`tm${i}`, 1, 12)).padStart(2, "0")}-${String(ri(`tdd${i}`, 1, 28)).padStart(2, "0")}`,
    })),
    boardSize: ri("bd", 7, 13),
    indep: `${ri("bi", 70, 92)}%`,
    tenure: `${rnd("bt", 3.2, 11.4).toFixed(1)} yrs median`,
    ceoTenure: `${rnd("ct", 0.8, 22).toFixed(1)} yrs`,
    comp: (
      [
        ["Salary", rnd("c1", 4, 14)],
        ["Annual cash incentive", rnd("c2", 8, 22)],
        ["Stock awards", rnd("c3", 44, 72)],
        ["Option awards", rnd("c4", 0, 18)],
        ["All other", rnd("c5", 1, 5)],
      ] as [string, number][]
    ).map(([k, v]) => ({ k, pct: `${v.toFixed(0)}%`, w: `${v.toFixed(0)}%` })),
    ceoPay: $M(rnd("cp", 6, 48)),
    ratio: `${ri("cr2", 48, 780)}:1`,
    sayOnPay: `${rnd("sop", 62, 98).toFixed(1)}%`,
    related: gt("rp", 0.7)
      ? `${ri("rpn", 1, 4)} related-party transactions disclosed (DEF 14A)`
      : "No related-party transactions above threshold",
    clawback: gt("cb", 0.85)
      ? "Clawback applied · recovery of incentive comp disclosed"
      : "Clawback policy adopted; no recovery events",
    plans: `${ri("p10", 1, 6)} officers with 10b5-1 plans adopted in the trailing year`,
  };

  // ---------------------------------------------------------------- 6 · accounting & audit
  const audit = {
    firm: pick(["Big Four A", "Big Four B", "Big Four C", "Big Four D"], "aud"),
    tenure: `since FY${ri("at", 1988, 2019)}`,
    change: gt("ac", 0.86) ? "Auditor changed · 8-K Item 4.01 filed" : "No auditor change on file",
    fees: $M(rnd("af", 3, 42)),
    nonAudit: `${rnd("an", 2, 22).toFixed(0)}% non-audit`,
    cams: [0, 1].map((i) => ({
      name: pick(
        [
          "Revenue recognition — distributor sell-through",
          "Inventory valuation and excess reserves",
          "Goodwill impairment assessment",
          "Income taxes — uncertain positions",
          "Business combination — intangible valuation",
        ],
        `cm${i}`,
      ),
      why: "Involves significant management judgment and subjective estimation.",
    })),
    icfr: gt("ic", 0.9) ? "Material weakness disclosed in ICFR" : "ICFR effective · unqualified auditor opinion",
    restate: gt("rs", 0.88) ? "Non-reliance restatement · 8-K Item 4.02" : "No non-reliance events on file",
    late: gt("lt", 0.85)
      ? `${ri("ltn", 1, 2)} Form 12b-25 filed in trailing 3 years`
      : "No late filings in trailing 3 years",
    nonGaap: {
      count: ri("ng", 3, 9),
      recur: `${ri("ngr", 2, 5)} of last 8 quarters`,
      items: "stock comp, amortization of acquired intangibles, restructuring",
    },
    estimates: [
      "Inventory excess and obsolescence",
      "Revenue — variable consideration",
      "Income taxes",
      "Goodwill and long-lived assets",
    ],
  };

  // ---------------------------------------------------------------- 7 · obligations
  const obligations: HubData["obligations"] = {
    legal: [0, 1, 2].map((i) => ({
      matter: pick(
        [
          "Patent infringement — competitor",
          "Securities class action",
          "Antitrust / trade regulation inquiry",
          "Contract dispute — supplier",
          "Employment class action",
          "Export controls inquiry",
        ],
        `lg${i}`,
      ),
      stage: pick(["discovery", "motion to dismiss pending", "on appeal", "settled — payment pending", "early stage"], `ls${i}`),
      // "not estimable" is a disclosure, not a zero — the filer named a matter it cannot size.
      accrual: gt(`la${i}`, 0.5) ? $M(rnd(`lv${i}`, 2, 340)) : "not estimable",
      since: `FY${ri(`ly${i}`, 21, 26)}`,
    })),
    rangeNote: "Where a loss is reasonably possible but not estimable, no accrual is recorded (ASC 450).",
    commitments: ["FY26", "FY27", "FY28", "Thereafter"].map((y, i) => ({
      y,
      amt: $B(rnd(`cm2${i}`, 0.2, 4.5)),
      w: `${Math.round((rnd(`cm2${i}`, 0.2, 4.5) / 4.5) * 100)}%`,
    })),
    purchase: $B(rnd("pu", 0.4, 9)),
    purchaseNote: "unconditional wafer and capacity purchase obligations",
    restructuring: gt("rst", 0.45)
      ? {
          active: true,
          charge: $M(rnd("rc", 20, 620)),
          accrual: $M(rnd("ra", 5, 240)),
          paid: $M(rnd("rp2", 10, 400)),
          heads: `${ri("rh", 120, 4200).toLocaleString()} positions`,
        }
      : { active: false },
    guarantees: $M(rnd("gt", 0, 180)),
    environmental: $M(rnd("ev", 0, 120)),
    offBS: gt("ob", 0.75) ? "Unconsolidated joint venture — capacity arrangement" : "None disclosed",
  };

  // ---------------------------------------------------------------- 8 · disclosure change
  const rfDiff = [
    {
      kind: "added",
      text: pick(
        [
          "Export control restrictions on advanced computing items",
          "Concentration of advanced packaging capacity",
          "AI-related demand volatility",
          "Cybersecurity incident response obligations",
        ],
        "rf1",
      ),
    },
    {
      kind: "added",
      text: pick(
        ["Single-source foundry dependence", "Tariff and trade policy exposure", "Water and power availability at fabs"],
        "rf2",
      ),
    },
    {
      kind: "reworded",
      text: pick(
        [
          "Supply chain constraints — expanded to name specific nodes",
          "Customer concentration — quantified for the first time",
          "Intellectual property litigation — updated for pending matter",
        ],
        "rf3",
      ),
    },
    {
      kind: "removed",
      text: pick(["COVID-19 operational disruption", "LIBOR transition", "Pending merger completion risk"], "rf4"),
    },
  ];
  const rfd = ri("rfd", -4, 7);
  const narrative = {
    rfCount: ri("rfc", 22, 48),
    rfDelta: `${rfd >= 0 ? "+" : "−"}${Math.abs(rfd)}`,
    rfWords: `${ri("rfw", 9, 26)}k words`,
    rfDiff,
    mdna: [
      pick(
        [
          "Revenue growth attributed primarily to data center product mix",
          "Revenue decline attributed to inventory correction at distributors",
          "Growth attributed to pricing and content per unit",
        ],
        "md1",
      ),
      pick(
        [
          "Gross margin change driven by product mix and yield improvement",
          "Margin pressure from underutilization charges",
          "Margin benefit from lower wafer costs",
        ],
        "md2",
      ),
      pick(
        [
          "Operating expense growth reflects engineering headcount additions",
          "Opex reduction reflects the restructuring announced in Q2",
        ],
        "md3",
      ),
    ],
    cyber: {
      gov: pick(
        [
          "Audit Committee oversight; CISO reports quarterly",
          "Full-board oversight; CISO reports to CTO",
          "Risk Committee oversight; quarterly reporting",
        ],
        "cy",
      ),
      incident: gt("ci", 0.87)
        ? "8-K Item 1.05 filed — material incident disclosed"
        : "No Item 1.05 incident reported",
      framework: pick(["NIST CSF aligned", "ISO 27001 certified", "NIST CSF + third-party assessment"], "cf"),
    },
    agreements: [0, 1].map((i) => ({
      t: pick(
        [
          "Amended credit agreement",
          "Long-term capacity supply agreement",
          "Patent cross-license",
          "Definitive acquisition agreement",
          "Joint development agreement",
        ],
        `ag${i}`,
      ),
      date: `20${ri(`agy${i}`, 25, 26)}-${String(ri(`agm${i}`, 1, 12)).padStart(2, "0")}-${String(ri(`agd${i}`, 1, 28)).padStart(2, "0")}`,
    })),
    humanCapital: {
      heads: (ri("hc", 8, 60) * 1000).toLocaleString(),
      turnover: `${rnd("hct", 6, 24).toFixed(0)}%`,
      note: "voluntary turnover as disclosed in Item 1 Human Capital",
    },
    guidance: pick(
      [
        "Q2 outlook provided in 8-K 2.02 exhibit; range widened",
        "Outlook withdrawn for the current quarter",
        "Full-year framework reaffirmed in the 2.02 exhibit",
      ],
      "gd",
    ),
  };

  // ---------------------------------------------------------------- footnote detail
  const rpoTot = rev * rnd("rpo", 0.22, 0.7);
  const disagg = (
    [
      ["Product revenue", 0.72],
      ["Service & support", 0.16],
      ["Licensing & royalty", 0.12],
    ] as [string, number][]
  ).map(([l, w]) => ({
    label: l,
    amt: $B(rev * w),
    pct: `${Math.round(w * 100)}%`,
    w: `${(w * 100).toFixed(0)}%`,
  }));
  const inv = (
    [
      ["Raw materials", 0.18],
      ["Work in process", 0.42],
      ["Finished goods", 0.4],
    ] as [string, number][]
  ).map(([l, w], i) => {
    const v = rev * 0.16 * w;
    const yo = rnd(`iv${i}`, -14, 34);
    return { label: l, amt: $B(v), yoy: `${yo > 0 ? "↑ +" : "↓ −"}${Math.abs(yo).toFixed(0)}% YoY` };
  });
  const debtLadder = ["FY26", "FY27", "FY28", "FY29", "FY30", "Thereafter"].map((y, i) => {
    const v = rnd(`dl${i}`, 0.05, 1.8);
    return { y, amt: $B(v), w: `${Math.round((v / 1.8) * 100)}%`, rate: `${rnd(`dr${i}`, 2.1, 6.4).toFixed(2)}%` };
  });
  const taxRec: [string, number][] = [
    ["U.S. federal statutory rate", 21.0],
    ["Foreign rate differential", -rnd("tx1", 1, 9)],
    ["R&D and other credits", -rnd("tx2", 0.5, 5)],
    ["Stock compensation", rnd("tx3", -2.5, 1.5)],
    ["Valuation allowance change", rnd("tx4", -1.5, 2.5)],
    ["GILTI / FDII, net", rnd("tx5", -3, 3)],
  ];
  const effR = taxRec.reduce((a, [, v]) => a + v, 0);
  const gwUnits = [0, 1, 2].map((i) => ({
    name: pick(["Compute", "Connectivity", "Analog & mixed-signal", "Embedded", "Automotive"], `gu${i}`),
    gw: $B(rnd(`gv${i}`, 0.2, 7)),
    head: `${ri(`gh${i}`, 8, 140)}%`,
  }));
  const sbcLines = (
    [
      ["Cost of revenue", 0.07],
      ["Research & development", 0.55],
      ["SG&A", 0.38],
    ] as [string, number][]
  ).map(([l, w]) => ({ label: l, amt: $M(rev * 1000 * 0.055 * w), w: `${(w * 100).toFixed(0)}%` }));

  const footnotes: HubData["footnotes"] = {
    rpo: { tot: $B(rpoTot), within12: `${ri("rpo12", 48, 82)}%` },
    disagg,
    inv,
    debtLadder,
    tax: {
      rows: taxRec.map(([k, v]) => ({ k, v: `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)} pts` })),
      eff: pctS(effR),
      va: $M(rnd("va", 40, 1400)),
      utb: $M(rnd("utb", 60, 900)),
    },
    gwUnits,
    sbc: { tot: $B(rev * 0.055), lines: sbcLines },
    leases: {
      tot: $B(rnd("ls", 0.1, 2.4)),
      wa: `${rnd("lsw", 3.1, 9.4).toFixed(1)} yrs`,
      disc: `${rnd("lsd", 2.8, 5.9).toFixed(1)}%`,
    },
    capR: { cap: $M(rnd("cr", 0, 320)), exp: $B(rev * 0.19) },
    allow: {
      open: $M(rnd("al1", 10, 90)),
      prov: $M(rnd("al2", 2, 40)),
      wo: $M(rnd("al3", 1, 30)),
      close: $M(rnd("al4", 10, 95)),
    },
    defrev: { open: $B(rev * 0.048), billed: $B(rev * 0.31), rec: $B(rev * 0.3), close: $B(rev * 0.05) },
  };

  // ---------------------------------------------------------------- filing timeline
  const evPool: [string, string, string][] = [
    ["10-K", "Annual report · FY25", "—"],
    ["8-K", "Item 2.02 · results of operations", "2.02"],
    ["10-Q", "Quarterly report · Q1 FY26", "—"],
    ["8-K", "Item 5.02 · officer transition", "5.02"],
    ["4", "Form 4 · officer disposition", "—"],
    ["8-K", "Item 1.01 · material agreement", "1.01"],
    ["DEF 14A", "Proxy statement", "—"],
    ["8-K", "Item 2.06 · impairment charge", "2.06"],
    ["S-8", "Registration · equity plan shares", "—"],
    ["8-K", "Item 4.01 · auditor change", "4.01"],
    ["10-K/A", "Amendment · Part III incorporation", "—"],
    ["SC 13G", "Passive blockholder position", "—"],
    ["8-K", "Item 1.05 · cybersecurity incident", "1.05"],
    ["3", "Form 3 · new officer initial ownership", "—"],
  ];
  const months = ["2026-06", "2026-05", "2026-04", "2026-03", "2026-02", "2026-01", "2025-12", "2025-11", "2025-10"];
  const timeline = months.map((m, i) => {
    const e = evPool[Math.floor(seedN(`${T}ev${i}`) * evPool.length)];
    return {
      date: `${m}-${String(ri(`ed${i}`, 1, 28)).padStart(2, "0")}`,
      form: e[0],
      desc: e[1],
      item: e[2] === "—" ? "" : e[2],
      accent: i === 0,
    };
  });

  // ---------------------------------------------------------------- what changed this filing
  const changes = [
    { tag: "RISK", text: `${rfDiff[0].text} — new risk factor`, src: "10-K Item 1A" },
    { tag: "SEGMENT", text: segNote, src: "ASC 280 footnote" },
    {
      tag: "AUDIT",
      text: audit.change === "No auditor change on file" ? `CAM unchanged: ${audit.cams[0].name}` : audit.change,
      src: "auditor report",
    },
    { tag: "DEBT", text: `Credit agreement amended · ${covenant}`, src: "8-K Item 1.01" },
  ];

  return {
    years,
    changes,
    structure,
    statements: { income: mkStmt(isRows, "is"), balance: mkStmt(bsRows, "bs"), cash: mkStmt(cfRows, "cf") },
    segments,
    segNote,
    geoAssets,
    custConc,
    capital,
    governance,
    audit,
    obligations,
    footnotes,
    timeline,
    narrative,
    covenant,
  };
}

/**
 * The hub's eight sections — the ordinals the rail's jump list addresses.
 *
 * Two labels are deliberately SHORTER than the section headers they point at ("Accounting
 * quality", "Obligations"): the rail is 178px wide and a jump list that wraps stops being
 * scannable. The ordinals are what actually bind rail to header, so the text may compress.
 */
export const HUB_SECTIONS = [
  { n: "01", label: "Identity & structure", href: "#s1" },
  { n: "02", label: "Financial detail", href: "#s2" },
  { n: "03", label: "Segments & geography", href: "#s3" },
  { n: "04", label: "Capital & ownership", href: "#s4" },
  { n: "05", label: "Governance & people", href: "#s5" },
  { n: "06", label: "Accounting quality", href: "#s6" },
  { n: "07", label: "Obligations", href: "#s7" },
  { n: "08", label: "Disclosure change", href: "#s8" },
];

// ============================================================ the registrant's own record

/**
 * The CIK the hub shows and links with.
 *
 * Salted `cik` so the profile card, the EDGAR links, and anything else that needs an identity
 * all derive the SAME number for a ticker — a page that linked to one filer and displayed
 * another would be worse than one that linked nowhere.
 */
export function hubCik(T: string): string {
  return String(320000 + Math.round(seedN(`${T}cik`) * 680000)).padStart(7, "0");
}

/** EDGAR browse-by-form-type for one registrant, by form. */
export function hubLinks(T: string): Record<
  "tenK" | "tenQ" | "eightK" | "proxy" | "forms4" | "ex21" | "s3" | "all",
  string
> {
  const cik = hubCik(T);
  const e = (type: string) =>
    `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=${encodeURIComponent(type)}&dateb=&owner=include&count=40`;
  // ex21 is an EXHIBIT to the 10-K, not a form type of its own — EDGAR has no browse for it,
  // so the honest destination is the annual report that carries it.
  return {
    tenK: e("10-K"), tenQ: e("10-Q"), eightK: e("8-K"), proxy: e("DEF 14A"),
    forms4: e("4"), ex21: e("10-K"), s3: e("S-3"), all: e(""),
  };
}

/**
 * What the registrant says it does — condensed from Item 1, and fixed rather than generated.
 *
 * Deliberately NOT interpolated per ticker: a business description assembled from a template
 * would read as a claim about that specific filer while being nothing of the kind.
 */
export const HUB_BIZ_TEXT =
  "Designs and markets semiconductor products across compute, connectivity, and analog end-markets, " +
  "selling primarily to OEMs and distributors worldwide through a mix of in-house and third-party " +
  "foundry capacity. Summary condensed from the most recent 10-K, Item 1 (Business).";

/** The cover-page facts, in the prototype's order. */
export function hubProfile(T: string): { k: string; v: string }[] {
  const { pick, ri } = seeded(T);
  const hqCities = ["Santa Clara, CA", "Austin, TX", "San Jose, CA", "San Diego, CA", "Phoenix, AZ", "Norwood, MA", "Chandler, AZ", "Milpitas, CA"];
  const emp = (8 + Math.round(seedN(`${T}emp`) * 52)) * 1000;
  return [
    { k: "CIK", v: hubCik(T) },
    { k: "SIC", v: "3674 · Semiconductors" },
    { k: "NAICS", v: "334413" },
    { k: "State of incorp.", v: "Delaware" },
    { k: "Headquarters", v: pick(hqCities, "hq") },
    { k: "Fiscal year-end", v: pick(["Dec 31", "Jan 28", "Sep 30", "Jun 30", "Dec 30"], "fye") },
    { k: "Independent auditor", v: pick(["Big Four A", "Big Four B", "Big Four C", "Big Four D"], "aud") },
    { k: "Employees", v: emp.toLocaleString() },
    { k: "Filer status", v: "Large accelerated filer" },
    { k: "First 10-K", v: `FY${1979 + ri("yr", 0, 26)}` },
  ];
}

/** The peer-set pill in the breadcrumb — rank within whichever set is active. */
export function hubContextPill(subActive: boolean, subCount: number): string {
  return subActive ? `NAICS 334413 · rank 4 / ${subCount}` : "SIC 3674 · rank 5 / 62";
}

/** The segment mix shown as chips on the identity card — the filer's own reportable split. */
export function hubSegmentChips(T: string): { label: string; pct: string; color: string }[] {
  const names = ["Core products", "Services & licensing", "Other"];
  const colors = ["var(--accent)", "var(--gaap-color)", "var(--border-strong)"];
  const s1 = 55 + Math.round(seedN(`${T}seg`) * 25);
  const s2 = Math.round((100 - s1) * 0.66);
  return [s1, s2, 100 - s1 - s2].map((v, i) => ({ label: names[i], pct: `${v}%`, color: colors[i] }));
}

export interface SnapshotTile {
  label: string;
  src: string;
  value: string;
  yoy: string;
  /** Why this tile has no number, when that is a fact about sourcing rather than about the filer. */
  reason?: string;
  /** Eight points, the last one equal to the headline level. */
  spark: number[];
}

/**
 * The financial snapshot tiles: eight XBRL facts, each with a trailing-8-quarter shape.
 *
 * The YoY line carries an arrow and nothing else — no colour, no up-is-good. Direction is a
 * fact about the series; whether it is welcome is a judgement we do not make (STYLE_GUIDE §5).
 */
export function hubSnapshot(T: string): SnapshotTile[] {
  const spec: { label: string; src: string; unit: "$B" | "%" | "M"; base: number; span: number }[] = [
    { label: "Revenue", src: "TTM · Income stmt", unit: "$B", base: 5, span: 32 },
    { label: "Gross margin", src: "derived · IS", unit: "%", base: 38, span: 28 },
    { label: "Operating margin", src: "derived · IS", unit: "%", base: 13, span: 26 },
    { label: "Net income", src: "TTM · IS", unit: "$B", base: 0.8, span: 8 },
    { label: "Free cash flow", src: "TTM · CFO − capex", unit: "$B", base: 0.7, span: 7 },
    { label: "Cash & ST inv.", src: "Balance sheet", unit: "$B", base: 1.5, span: 11 },
    { label: "Total debt", src: "Balance sheet", unit: "$B", base: 0.3, span: 8 },
    { label: "Diluted shares", src: "Cover · 10-Q", unit: "M", base: 250, span: 1500 },
  ];
  const fmt = (v: number, u: string) =>
    u === "%" ? `${v.toFixed(1)}%` : u === "M" ? `${Math.round(v)}M` : `$${Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(1)}B`;

  return spec.map((s) => {
    const lvl = s.base + seedN(T + s.label) * s.span;
    const g = (seedN(`${T}${s.label}g`) - 0.35) * 0.45;
    const spark: number[] = [];
    for (let i = 0; i < 8; i++) {
      const t = i / 7;
      const noise = (seedN(`${T}${s.label}${i}`) - 0.5) * lvl * 0.07;
      spark.push(Math.max(0.05, lvl * 0.82 + g * lvl * t + noise));
    }
    spark[7] = lvl;
    const yb = spark[3] || spark[0];
    const yp = ((spark[7] - yb) / Math.abs(yb)) * 100;
    const arrow = Math.abs(yp) < 1 ? "→" : yp > 0 ? "↑" : "↓";
    return {
      label: s.label,
      src: s.src,
      value: fmt(lvl, s.unit),
      yoy: `${arrow} ${yp >= 0 ? "+" : "−"}${Math.abs(yp).toFixed(1)}% YoY`,
      spark,
    };
  });
}

export interface HubInsider {
  buy: number;
  sell: number;
  net: string;
  dir: string;
  window: string;
  rows: { form: string; off: string; type: string; shares: string; date: string }[];
}

/**
 * The Section 16 summary the hub carries — a pointer to the insider view, not a replacement.
 *
 * `dir` names the direction categorically ("net acquisitions") rather than scoring it. An
 * officer selling into a 10b5-1 plan and one selling on impulse file the same form.
 *
 * @deprecated §05.4 reads `/companies/{symbol}/insider-summary` as of 2026-08-04. Kept because
 * the full insider-activity view is still on fixtures and shares this vocabulary; it should go
 * when that view is plumbed. NOT called by the company hub any more.
 */
export function hubInsider(T: string): HubInsider {
  const { pick } = seeded(T);
  const buy = 6 + Math.floor(seedN(`${T}ib`) * 10);
  const sell = 8 + Math.floor(seedN(`${T}isl`) * 14);
  const net = buy - sell;
  const officers = ["CEO", "CFO", "EVP, Operations", "SVP, Worldwide Sales", "Director", "General Counsel", "Chief Accounting Officer"];
  return {
    buy, sell,
    net: `${net >= 0 ? "+" : "−"}${Math.abs(net)}`,
    dir: net > 0 ? "net acquisitions" : net < 0 ? "net dispositions" : "balanced",
    window: "trailing 90 days · Forms 3/4/5",
    rows: [0, 1, 2].map((i) => {
      const acq = seedN(`${T}bs${i}`) > 0.5;
      const shN = (2 + Math.floor(seedN(`${T}shq${i}`) * 40)) * 1000;
      const day = 2 + Math.floor(seedN(`${T}dd${i}`) * 24);
      return {
        form: "Form 4",
        off: pick(officers, `off${i}`),
        type: acq ? "acquisition (code A)" : "disposition (code D)",
        shares: `${shN.toLocaleString()} sh`,
        date: `2026-04-${String(day).padStart(2, "0")}`,
      };
    }),
  };
}

export interface HubCalc {
  id: string;
  label: string;
  formula: string;
  inputs: [string, string][];
  note: string;
}

/**
 * The four figures on this page that no filer reports — the arithmetic, opened on demand.
 *
 * Each one exists because we computed it, so each one has to say so and show its inputs. The
 * `note` is the part that matters: it names the condition under which our number and a filer's
 * own number would legitimately differ.
 */
export const HUB_CALCS: Record<string, HubCalc> = {
  fcf: {
    id: "fcf",
    label: "Free cash flow",
    formula: "Cash from operations − capital expenditures",
    inputs: [
      ["Cash from operations", "10-K / 10-Q statement of cash flows"],
      ["Capital expenditures", "purchases of property and equipment, same statement"],
    ],
    note: "Not a filed line item. Filers define free cash flow differently in their own non-GAAP reconciliations; this is our definition, applied identically to every filer.",
  },
  gwhead: {
    id: "gwhead",
    label: "Goodwill headroom",
    formula: "(Reporting-unit fair value − carrying amount) ÷ carrying amount",
    inputs: [
      ["Carrying amount", "goodwill footnote, by reporting unit"],
      ["Fair value", "quantitative impairment test disclosure where given"],
    ],
    note: "Only computable where the filer discloses the quantitative test. Where the filer relies on a qualitative assessment, headroom is not derivable and is shown as not available.",
  },
  segmargin: {
    id: "segmargin",
    label: "Segment operating margin",
    formula: "Segment operating income ÷ segment revenue",
    inputs: [
      ["Segment operating income", "ASC 280 footnote"],
      ["Segment revenue", "ASC 280 footnote"],
    ],
    note: "Segment operating income is defined by the filer and excludes items management does not allocate. It is not comparable across filers.",
  },
  etr: {
    id: "etr",
    label: "Effective tax rate",
    formula: "Income tax provision ÷ pre-tax income",
    inputs: [
      ["Income tax provision", "income statement"],
      ["Pre-tax income", "income statement"],
    ],
    note: "The reconciliation shown is the filer's own bridge from the statutory rate. Rate components are as disclosed, not recomputed.",
  },
};

// ============================================================ metric time series

/** Annual aggregation class — a balance is not a sum, and a rate is not either. */
const AGG: Record<string, "bal" | "rate" | undefined> = {
  cash: "bal", debt: "bal", inv: "bal", defrev: "bal", rpo: "bal",
  shares: "bal", heads: "bal", rfc: "bal", legal: "bal",
  gm: "rate", opm: "rate", etr: "rate",
};

export const Q_LABELS: string[] = (() => {
  const out: string[] = [];
  for (let y = 22; y <= 26; y++) for (let q = 1; q <= 4; q++) out.push(`${q}Q${y}`);
  return out;
})();

export const A_LABELS = ["FY22", "FY23", "FY24", "FY25", "FY26"];

/** Filing events that affect comparability, at their quarter index. */
const EV_DEFS = [
  { i: 6, tag: "restated" },
  { i: 11, tag: "re-segmented" },
  { i: 16, tag: "ASC adoption" },
];

export interface MetricDef {
  id: string;
  label: string;
  unit: string;
  base: number;
  group: string;
}

export interface SeriesResult {
  vals: (number | null)[];
  labels: string[];
  events: { i: number; tag: string }[];
  unit: string;
  label: string;
  annual: boolean;
}

/** The metric catalog, with each metric's source statement — same order as the prototype. */
export function metricDefs(T: string): MetricDef[] {
  const { rnd, ri } = seeded(T);
  const rev0 = rnd("hrev", 6, 34);
  const rev = rev0 * (0.78 + 0.09 * 3 + rnd("rv3", -0.03, 0.03));
  const rpoTot = rev * rnd("rpo", 0.22, 0.7);
  const taxRec: number[] = [
    21.0, -rnd("tx1", 1, 9), -rnd("tx2", 0.5, 5), rnd("tx3", -2.5, 1.5),
    rnd("tx4", -1.5, 2.5), rnd("tx5", -3, 3),
  ];
  const effR = taxRec.reduce((a, v) => a + v, 0);
  const d: [string, string, string, number, string][] = [
    ["rev", "Revenue", "$B", rev, "Income statement"],
    ["gm", "Gross margin", "%", 45, "Income statement"],
    ["opm", "Operating margin", "%", 15, "Income statement"],
    ["rd", "R&D expense", "$B", rev * 0.19, "Income statement"],
    ["sga", "SG&A expense", "$B", rev * 0.11, "Income statement"],
    ["cogs", "Cost of revenue", "$B", -rev * 0.55, "Income statement"],
    ["gp", "Gross profit", "$B", rev * 0.45, "Income statement"],
    ["oi", "Operating income", "$B", rev * 0.15, "Income statement"],
    ["ni", "Net income", "$B", rev * 0.112, "Income statement"],
    ["eps", "Diluted EPS", "$", rnd("eps", 1.2, 7.4), "Income statement"],
    ["cfo", "Cash from operations", "$B", rev * 0.24, "Cash flow"],
    ["capex", "Capital expenditures", "$B", -rev * 0.08, "Cash flow"],
    ["fcf", "Free cash flow (derived)", "$B", rev * 0.16, "Cash flow"],
    ["buyback", "Share repurchases", "$B", -rnd("bq", 0.05, 1.9), "Cash flow"],
    ["inv", "Inventories", "$B", rev * 0.16, "Balance sheet"],
    ["cash", "Cash & short-term inv.", "$B", rnd("bs1", 1.5, 12), "Balance sheet"],
    ["debt", "Total debt", "$B", rnd("bs7", 0.3, 9), "Balance sheet"],
    ["defrev", "Deferred revenue", "$B", rev * 0.05, "Balance sheet"],
    ["rpo", "Remaining perf. obligations", "$B", rpoTot, "Footnote"],
    ["sbc", "Stock compensation", "$B", rev * 0.055, "Footnote"],
    ["etr", "Effective tax rate", "%", effR, "Footnote"],
    ["shares", "Diluted shares", "M", rnd("sh", 260, 1650), "Cover page"],
    ["heads", "Employees", "k", rnd("hc", 8, 60), "Item 1"],
    ["rfc", "Risk factor count", "#", ri("rfc2", 22, 48), "Item 1A"],
    ["legal", "Legal accruals", "$M", rnd("lgA", 5, 340), "Item 3"],
  ];
  return d.map(([id, label, unit, base, group]) => ({ id, label, unit, base, group }));
}

function mkSeries(T: string, id: string, base: number, unit: string, restated: boolean) {
  const { rnd } = seeded(T);
  const seasonal = [0.94, 0.99, 1.02, 1.05];
  const q: (number | null)[] = Q_LABELS.map((_l, i) => {
    const drift = 1 + (i - 19) * rnd(`dr${id}`, -0.004, 0.028);
    const noise = 1 + (seedN(`${T}${id}q${i}`) - 0.5) * 0.07;
    let v = base * drift * seasonal[i % 4] * noise;
    if (unit === "%") v = base + (seedN(`${T}${id}p${i}`) - 0.5) * 7 + (i - 19) * rnd(`pd${id}`, -0.2, 0.35);
    if (unit === "#" || unit === "k" || unit === "r")
      v = base * (0.86 + i * 0.008) * (1 + (seedN(`${T}${id}n${i}`) - 0.5) * 0.03);
    // The one figure a restatement moves — as-filed and as-restated differ only where it did.
    if (!restated && id !== "rev" && i === 6) v = v * (1 + rnd(`rst${id}`, -0.05, 0.05));
    return v;
  });
  // Real coverage floors, not noise: RPO detail predates ASC 606, and a legal accrual is only
  // recorded when a loss is estimable. Both come back null and BREAK the line.
  if (id === "rpo") for (let i = 0; i < 5; i++) q[i] = null;
  if (id === "legal") for (let i = 8; i < 11; i++) q[i] = null;

  const a = A_LABELS.map((_l, i) => {
    const s = q.slice(i * 4, i * 4 + 4).filter((v): v is number => v !== null);
    if (!s.length) return null;
    const k = AGG[id];
    if (k === "bal") return s[s.length - 1];
    if (k === "rate") return s.reduce((x, y) => x + y, 0) / s.length;
    return s.reduce((x, y) => x + y, 0);
  });
  return { q, a };
}

export function seriesFor(
  T: string,
  id: string,
  range: "8q" | "20q" | "5y",
  basis: "filed" | "restated",
): SeriesResult | null {
  const m = metricDefs(T).find((x) => x.id === id);
  if (!m) return null;
  const s = mkSeries(T, id, m.base, m.unit, basis === "restated");
  if (range === "5y")
    return { vals: s.a, labels: A_LABELS, events: [], unit: m.unit, label: m.label, annual: true };
  const cut = range === "8q" ? 12 : 0;
  return {
    vals: s.q.slice(cut),
    labels: Q_LABELS.slice(cut),
    unit: m.unit,
    label: m.label,
    annual: false,
    events: EV_DEFS.filter((e) => e.i >= cut).map((e) => ({ i: e.i - cut, tag: e.tag })),
  };
}

/** Statement-row label → metric id. A row without one has no series to open. */
export const LABEL_TO_ID: Record<string, string> = {
  Revenue: "rev", "Gross margin": "gm", "Operating margin": "opm", "Net income": "ni",
  "Free cash flow": "fcf", "Cash & ST inv.": "cash", "Total debt": "debt",
  "Diluted shares": "shares", "Cost of revenue": "cogs", "Gross profit": "gp",
  "Research & development": "rd", "Selling, general & admin.": "sga",
  "Operating income": "oi", "Diluted EPS": "eps", "Cash from operations": "cfo",
  "Capital expenditures": "capex", "Free cash flow (derived)": "fcf",
  "Share repurchases": "buyback", Inventories: "inv",
  "Cash & short-term investments": "cash", "Deferred revenue": "defrev",
};

/** One precision per chart, taken from the series magnitude. */
export function unitFmt(unit: string, mag?: number): (v: number) => string {
  if (unit === "%") return (v) => `${v.toFixed(0)}%`;
  if (unit === "M") return (v) => `${Math.round(v)}M`;
  if (unit === "k") return (v) => `${Math.round(v)}k`;
  if (unit === "#") return (v) => `${Math.round(v)}`;
  if (unit === "$M") return (v) => `$${Math.round(v)}M`;
  if (unit === "$") return (v) => `$${v.toFixed(2)}`;
  const dp = mag !== undefined && Math.abs(mag) >= 10 ? 0 : 1;
  return (v) => `$${v.toFixed(dp)}B`;
}

// ============================================================ institutional register

/** The seven sections of Company Hub → Institutional, in the prototype's order. */
export const INST_SECTIONS = [
  { n: "01", label: "Register snapshot", href: "#i1" },
  { n: "02", label: "Over time & holders", href: "#i2" },
  { n: "03", label: "Flows & concentration", href: "#i3" },
  { n: "04", label: "Ownership & stewardship", href: "#i4" },
  { n: "05", label: "Holder behavior", href: "#i5" },
  { n: "06", label: "Register limits & supply", href: "#i6" },
  { n: "07", label: "Reference", href: "#i7" },
];

/** Each section's heading and the source line that sits inline with it. */
export const INST_HEADS: { id: string; n: string; title: string; src: string }[] = [
  { id: "i1", n: "01", title: "Register snapshot", src: "13F-HR register, freshness and what has been filed since" },
  { id: "i2", n: "02", title: "Register over time & holders", src: "how the register has moved, and who is in it" },
  { id: "i3", n: "03", title: "Flows & concentration", src: "position changes, how the register is distributed, how concentrated it is" },
  { id: "i4", n: "04", title: "Ownership & stewardship", src: "5% filings, voting behavior and the activism trail" },
  { id: "i5", n: "05", title: "Holder behavior", src: "how long managers stay in the register, and at what level they hold" },
  { id: "i6", n: "06", title: "Register limits & supply", src: "what the register cannot tell you, and what supply is dated ahead" },
  { id: "i7", n: "07", title: "Reference", src: "forms and rules used on this page" },
];

export interface InstFreshness {
  asOfQtr: string;
  filedOn: string;
  age: string;
  nextClose: string;
  daysToNext: string;
  deltaCount: string;
  confirmed: string;
  confirmedNote: string;
  lag: string;
  scope: string;
}

/**
 * The freshness strip that opens the register.
 *
 * It leads with HOW OLD the snapshot is, not with what it contains — a 13F is a quarter-end
 * photograph filed up to 45 days later, so every figure below it inherits that age. Faster
 * forms (13D/G, Forms 3/4/5) arrive in between and are counted separately rather than folded
 * in, because mixing them would date-stamp the register with something it does not contain.
 */
export function instFreshness(T: string): InstFreshness {
  const { rnd, ri } = seeded(T);
  const age = ri("iage", 34, 96);
  const days = ri("inext", 3, 58);
  const delta = ri("idelta", 0, 14);
  // A re-confirmation IS one of the filings since the snapshot, so it can never exceed them.
  const conf = Math.min(delta, ri("iconf", 0, 9));
  return {
    asOfQtr: "31 Mar 2026",
    filedOn: "14 May 2026",
    age: `${age} days old`,
    nextClose: "14 Aug 2026",
    daysToNext: `${days} days`,
    deltaCount: String(delta),
    confirmed: String(conf),
    confirmedNote: conf
      ? `${conf} manager${conf > 1 ? "s" : ""} re-confirmed a position on a faster form`
      : "no manager has re-confirmed a position since",
    lag: `Median acceptance lag ${ri("ilag", 28, 44)} days after quarter end`,
    scope: `Long 13(f) positions only · ${rnd("iscope", 62, 88).toFixed(0)}% of shares outstanding reported`,
  };
}

// ---------------------------------------------------------------- i2 · register over time

export const MIX_KINDS = ["Index", "Active equity", "Hedge fund", "Bank & wealth", "Other"] as const;

/** Categorical identity only — these are manager TYPES, not a ranking. */
export const MIX_COLORS = ["var(--accent)", "var(--gaap-color)", "#A88C5F", "var(--border-strong)", "var(--bg-badge)"];

export interface InstRegister {
  quarters: string[];
  holderCounts: number[];
  sharesM: number[];
  netHolders: string;
  mix: { periods: string[]; bands: { key: string; label: string; values: number[] }[] };
  mixLegend: { k: string; pct: string; pctN: number; prior: string; priorN: number; color: string }[];
  top10: string;
  top10Note: string;
  holders: {
    name: string;
    kind: string;
    form: string;
    filed: string;
    shares: string;
    pct: string;
    delta: string;
    spark: (number | null)[];
  }[];
}

const MGR_NAMES = [
  "Vanguard Group Inc", "BlackRock Inc", "State Street Corp", "FMR LLC",
  "Capital Research Global", "Geode Capital Management", "Northern Trust Corp",
  "Norges Bank", "T. Rowe Price Associates", "Wellington Management",
];

export function instRegister(T: string): InstRegister {
  const { rnd, ri, pick } = seeded(T);
  const quarters = ["1Q25", "2Q25", "3Q25", "4Q25", "1Q26"];
  const nine = ["1Q24", "2Q24", "3Q24", "4Q24", "1Q25", "2Q25", "3Q25", "4Q25", "1Q26"];

  const h0 = ri("ih0", 780, 2400);
  const holderCounts = quarters.map((_q, i) => Math.round(h0 * (0.94 + i * 0.02) * (1 + (seedN(`${T}ih${i}`) - 0.5) * 0.04)));
  const s0 = rnd("is0", 900, 4200);
  const sharesM = quarters.map((_q, i) => Math.round(s0 * (0.96 + i * 0.015) * (1 + (seedN(`${T}is${i}`) - 0.5) * 0.05)));
  const net = holderCounts[4] - holderCounts[3];

  // Manager mix, nine quarters. Shares of one whole, so the bands are normalized per column.
  const mixBase = MIX_KINDS.map((_k, i) => rnd(`imx${i}`, 6, 34));
  const bands = MIX_KINDS.map((k, i) => ({
    key: k,
    label: k,
    values: nine.map((_q, j) => mixBase[i] * (1 + (seedN(`${T}mx${i}q${j}`) - 0.5) * 0.16)),
  }));
  const lastTotal = bands.reduce((a, b) => a + b.values[8], 0);
  const priorTotal = bands.reduce((a, b) => a + b.values[7], 0);
  const mixLegend = bands.map((b, i) => {
    const pctN = (b.values[8] / lastTotal) * 100;
    const priorN = (b.values[7] / priorTotal) * 100;
    return {
      k: b.label,
      pct: `${pctN.toFixed(1)}%`,
      pctN,
      prior: `${priorN.toFixed(1)}%`,
      priorN,
      color: MIX_COLORS[i],
    };
  });

  const holders = MGR_NAMES.map((name, i) => {
    const pct = rnd(`ihp${i}`, 0.4, 8.6) / (1 + i * 0.28);
    const sh = (pct / 100) * rnd("iso", 2.2e9, 9.4e9);
    const dq = rnd(`ihd${i}`, -14, 18);
    return {
      name,
      kind: pick(["Index", "Active equity", "Hedge fund", "Bank & wealth"], `ihk${i}`),
      form: pick(["13F-HR", "13F-HR", "13F-HR/A"], `ihf${i}`),
      filed: `${ri(`ihfd${i}`, 1, 14)} May 2026`,
      shares: compactShares(sh),
      pct: `${pct.toFixed(2)}%`,
      delta: `${dq >= 0 ? "+" : "−"}${Math.abs(dq).toFixed(1)}%`,
      spark: nine.map((_q, j) => sh * (0.82 + j * 0.028) * (1 + (seedN(`${T}ihs${i}q${j}`) - 0.5) * 0.06)),
    };
  });

  const top10 = `${rnd("itop10", 38, 74).toFixed(1)}%`;
  return {
    quarters,
    holderCounts,
    sharesM,
    netHolders: `${net >= 0 ? "+" : "−"}${Math.abs(net)} managers`,
    mix: { periods: nine, bands },
    mixLegend,
    top10,
    top10Note: "of reported shares, held by ten managers",
    holders,
  };
}

function compactShares(v: number): string {
  return v >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : `${Math.round(v / 1e3)}K`;
}

// ---------------------------------------------------------------- i1 · the rest of the snapshot

export interface Calc {
  formula: string;
  inputs: { k: string; v: string }[];
  note: string;
}

export interface InstSnapshot {
  adjusted: {
    base: string;
    baseLabel: string;
    net: string;
    value: string;
    pct: string;
    appliedCount: number;
    deltaCount: number;
    note: string;
  };
  deltaForms: {
    form: string;
    who: string;
    what: string;
    lagRule: string;
    applied: string;
    shares: string;
    accepted: string;
  }[];
  cadence: { form: string; rule: string; role: string }[];
  moved: { key: string; label: string; prior: number; current: number }[];
  figs: {
    id: string;
    label: string;
    value: string;
    sub: string;
    calc: Calc;
  }[];
  adjustedCalc: Calc;
  instPctCalc: Calc;
}

export function instSnapshot(T: string): InstSnapshot {
  const { rnd, ri, pick } = seeded(T);
  const shOut = rnd("iso2", 2.2, 9.4); // billions
  const baseB = shOut * (rnd("ibase", 0.58, 0.86));
  const netM = rnd("inet", -42, 68); // millions
  const adjB = baseB + netM / 1000;
  const delta = ri("idelta", 0, 14);
  const applied = Math.min(delta, ri("iapplied", 0, 9));
  const filers = ri("ifilers", 780, 2400);

  const forms: [string, string, string][] = [
    ["SC 13G/A", "amended passive stake", "45 days after year end, or 5 business days after crossing 10%"],
    ["SC 13D", "new activist position", "5 business days after crossing 5%"],
    ["4", "officer disposition", "2 business days after the transaction"],
    ["13F-HR/A", "restated holdings table", "no fixed deadline — filed when the manager amends"],
    ["3", "new insider initial ownership", "10 days after becoming an insider"],
    ["SC 13G", "new passive stake", "45 days after quarter end"],
  ];

  const deltaForms = Array.from({ length: Math.max(1, applied || 3) }, (_x, i) => {
    const [form, what, lagRule] = forms[i % forms.length];
    return {
      form,
      who: pick(MGR_NAMES, `idw${i}`),
      what,
      lagRule,
      applied: i < applied ? "applied to the adjusted register" : "not applied — no share count on the form",
      shares: `${rnd(`ids${i}`, -18, 42).toFixed(1)}M`,
      accepted: `${ri(`ida${i}`, 15, 31)} May 2026`,
    };
  });

  const cadence = [
    { form: "13F-HR", rule: "45 days after quarter end", role: "the register itself — a quarter-end snapshot" },
    { form: "SC 13D", rule: "5 business days after crossing 5%", role: "fastest signal, activist intent stated" },
    { form: "SC 13G", rule: "45 days after quarter end", role: "passive crossings, slower and less specific" },
    { form: "Form 4", rule: "2 business days after the transaction", role: "insiders only — not managers" },
    { form: "N-PX", rule: "annually, for the year ended 30 June", role: "how a manager voted, up to 14 months later" },
  ];

  const moved = MGR_NAMES.slice(0, 8).map((name, i) => {
    const cur = rnd(`imv${i}`, 20, 220);
    return { key: name, label: name, prior: cur * rnd(`imvp${i}`, 0.72, 1.3), current: cur };
  });

  const instPct = (baseB / shOut) * 100;
  const insiderOwn = rnd("iiown", 0.2, 7.4);

  const figs: InstSnapshot["figs"] = [
    {
      id: "filers",
      label: "Reporting managers",
      value: filers.toLocaleString(),
      sub: "13F-HR filers reporting a position",
      calc: {
        formula: "Count of distinct 13F-HR filers listing this issuer in the information table",
        inputs: [
          { k: "Source", v: "13F-HR information table, one row per issuer per manager" },
          { k: "Scope", v: "long 13(f) positions only — shorts and derivatives are not reportable" },
        ],
        note: "Affiliated entities that file separately are counted separately; the cover page is the identity, not the parent.",
      },
    },
    {
      id: "ishares",
      label: "Shares reported",
      value: `${baseB.toFixed(2)}B`,
      sub: `of ${shOut.toFixed(2)}B shares outstanding`,
      calc: {
        formula: "Sum of shares across every 13F-HR information-table row for this issuer",
        inputs: [
          { k: "Numerator", v: "reported share counts, quarter end" },
          { k: "Denominator", v: "shares outstanding from the latest periodic report cover page" },
        ],
        note: "Dollar columns are ignored on purpose — they are market-priced, and this product carries no market data.",
      },
    },
    {
      id: "ipct",
      label: "Institutional share",
      value: `${instPct.toFixed(1)}%`,
      sub: "of shares outstanding, reported",
      calc: {
        formula: "Shares reported on 13F-HR ÷ shares outstanding",
        inputs: [
          { k: "Shares reported", v: `${baseB.toFixed(2)}B, quarter end` },
          { k: "Shares outstanding", v: `${shOut.toFixed(2)}B, latest cover page` },
        ],
        note: "A floor, not a total: managers below the $100M 13F threshold do not file, so the true institutional share is higher by an unknown amount.",
      },
    },
    {
      id: "insiderown",
      label: "Insider ownership",
      value: `${insiderOwn.toFixed(1)}%`,
      sub: "DEF 14A beneficial ownership table",
      calc: {
        formula: "Beneficial ownership of directors and executive officers as a group ÷ shares outstanding",
        inputs: [
          { k: "Source", v: "DEF 14A beneficial ownership table, as of the record date" },
          { k: "Basis", v: "includes shares issuable within 60 days" },
        ],
        note: "A proxy-statement snapshot at the record date, not a live figure, and not the same thing as Section 16 trading activity.",
      },
    },
  ];

  return {
    adjusted: {
      base: `${baseB.toFixed(2)}B`,
      baseLabel: "13F-HR, as of quarter end",
      net: `${netM >= 0 ? "+" : "−"}${Math.abs(netM).toFixed(1)}M`,
      value: `${adjB.toFixed(2)}B`,
      pct: `${((adjB / shOut) * 100).toFixed(1)}%`,
      appliedCount: applied,
      deltaCount: delta,
      note: "Only a form that states a share count can move the register. A 13D that names a stake in percent, or a Form 4 for an insider who is not a 13F filer, is listed and left unapplied.",
    },
    deltaForms,
    cadence,
    moved,
    figs,
    adjustedCalc: {
      formula: "Base 13F register + share counts from faster forms accepted since the quarter end",
      inputs: [
        { k: "Base", v: `${baseB.toFixed(2)}B from 13F-HR at quarter end` },
        { k: "Applied", v: `${applied} of ${delta} filings carried a usable share count` },
      ],
      note: "The adjusted figure is DERIVED and shown separately from the base for that reason — it mixes a quarter-end snapshot with later point-in-time filings, which is useful and is not what any single form says.",
    },
    instPctCalc: figs[2].calc,
  };
}

// ---------------------------------------------------------------- i2 · the missing affordances

/** EDGAR browse-by-form-type, the same destination the prototype's links point at. */
export function edgarLink(cik: number, type: string): string {
  return `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${String(cik).padStart(10, "0")}&type=${encodeURIComponent(type)}&dateb=&owner=include&count=40`;
}

export interface InstRegisterExtras {
  /** Nine-quarter history of the top-ten share, for the figure's own drawer. */
  top10Series: { period: string; value: number }[];
  top10Latest: string;
  top10Change: string;
  top10DrawerNote: string;
  classificationCalc: Calc;
  top10Calc: Calc;
}

export function instRegisterExtras(T: string): InstRegisterExtras {
  const { rnd } = seeded(T);
  const nine = ["1Q24", "2Q24", "3Q24", "4Q24", "1Q25", "2Q25", "3Q25", "4Q25", "1Q26"];
  const base = rnd("itop10", 38, 74);
  const series = nine.map((period, i) => ({
    period,
    value: base * (0.94 + i * 0.012) * (1 + (seedN(`${T}t10${i}`) - 0.5) * 0.05),
  }));
  const change = series[8].value - series[0].value;
  return {
    top10Series: series,
    top10Latest: `${series[8].value.toFixed(1)}%`,
    top10Change: `${change >= 0 ? "↑ +" : "↓ −"}${Math.abs(change).toFixed(1)}pp over nine quarters`,
    top10DrawerNote:
      "Concentration is DERIVED by ranking the reported register each quarter — the ten largest managers are not necessarily the same ten from quarter to quarter, so a rising line can mean the same managers grew or that different ones did.",
    classificationCalc: {
      formula: "Manager type assigned by ClearyFi from the filer's own filings, not from a vendor label",
      inputs: [
        { k: "Inputs", v: "13F-HR cover page, N-PX participation, position count and turnover" },
        { k: "Classes", v: "Index · Active equity · Hedge fund · Bank & wealth · Other" },
      ],
      note: "This is our judgment, not a filed fact. A manager that runs both index and active mandates from one filing entity gets one label, and the label is the coarser for it.",
    },
    top10Calc: {
      formula: "Shares held by the ten largest reporting managers ÷ total shares reported on 13F-HR",
      inputs: [
        { k: "Numerator", v: "ten largest information-table rows for this issuer, this quarter" },
        { k: "Denominator", v: "all reported shares — not shares outstanding" },
      ],
      note: "The denominator is the REPORTED register, so this measures concentration among filers rather than of the company. Against shares outstanding the figure would be lower.",
    },
  };
}

// ---------------------------------------------------------------- i3 · flows & concentration

export interface InstFlows {
  flow: { key: string; label: string; value: number }[];
  quarterTable: { q: string; added: string; reduced: string; addedSh: string; reducedSh: string }[];
  pareto: { key: string; label: string; value: number; prior?: number }[];
  treemap: { id: string; label: string; value: number; note?: string }[];
  lorenz: number[];
  effective: string;
  hhi: string;
  gini: string;
  halfCount: string;
  domicile: { key: string; label: string; share: number }[];
  upsetSets: { key: string; label: string }[];
  upset: { members: string[]; size: number; note: string }[];
  overlap: { name: string; peers: number; of: number }[];
  matrix: { rows: string[]; cols: string[]; cells: { row: string; col: string; value: number | null }[] };
  residual: { key: string; label: string; share: number }[];
  residualSeries: { period: string; value: number }[];
  stable: string;
  tenureWeighted: string;
  firstQuarter: string;
  cohorts: { cohort: string; share: string; weight: string }[];
  calcs: { eff: Calc; hhi: Calc; gini: Calc; residual: Calc; stable: Calc };
}

export function instFlows(T: string): InstFlows {
  const { rnd, ri } = seeded(T);
  const nine = ["1Q24", "2Q24", "3Q24", "4Q24", "1Q25", "2Q25", "3Q25", "4Q25", "1Q26"];
  const quarters = ["2Q25", "3Q25", "4Q25", "1Q26"];

  const flow = nine.map((q, i) => ({ key: q, label: q, value: rnd(`ifl${i}`, -140, 190) }));

  const quarterTable = quarters.map((q, i) => ({
    q,
    added: String(ri(`iqa${i}`, 120, 640)),
    reduced: String(ri(`iqr${i}`, 110, 610)),
    addedSh: `+${rnd(`iqas${i}`, 12, 180).toFixed(0)}M`,
    reducedSh: `−${rnd(`iqrs${i}`, 10, 160).toFixed(0)}M`,
  }));

  const shares = MGR_NAMES.map((n, i) => ({ n, v: rnd(`ipar${i}`, 30, 260) / (1 + i * 0.22) }));
  const total = shares.reduce((a, s) => a + s.v, 0);
  const pareto = shares.map((s, i) => ({
    key: s.n,
    label: s.n.split(" ")[0],
    value: s.v,
    prior: s.v * rnd(`iparp${i}`, 0.78, 1.24),
  }));
  const treemap = shares.map((s) => ({
    id: s.n,
    label: s.n.split(" ")[0],
    value: s.v,
    note: `${((s.v / total) * 100).toFixed(1)}% of the reported register`,
  }));

  // HHI over the reported register, then effective holders as its reciprocal.
  const hhiN = shares.reduce((a, s) => a + ((s.v / total) * 100) ** 2, 0);
  const eff = 10000 / hhiN;
  let acc = 0;
  let half = 0;
  for (const s of [...shares].sort((a, b) => b.v - a.v)) {
    acc += s.v;
    half += 1;
    if (acc / total >= 0.5) break;
  }

  const domNames = ["United States", "United Kingdom", "Canada", "Norway", "Switzerland", "Other"];
  const domicile = domNames.map((label, i) => ({ key: label, label, share: rnd(`idom${i}`, 3, 46) }));

  // Set membership, not a prose label — the UpSet matrix is what makes a five-way
  // intersection readable, and "A + B + C" stops scanning at three.
  const upsetSets = [
    { key: "van", label: "Vanguard" },
    { key: "blk", label: "BlackRock" },
    { key: "sst", label: "State Street" },
  ];
  const upset = [
    { members: ["van", "blk", "sst"], size: ri("iu1", 40, 210), note: `${rnd("ius1", 18, 44).toFixed(1)}% of reported shares` },
    { members: ["van", "blk"], size: ri("iu2", 30, 180), note: `${rnd("ius2", 9, 26).toFixed(1)}% of reported shares` },
    { members: ["blk"], size: ri("iu3", 10, 90), note: `${rnd("ius3", 3, 14).toFixed(1)}% of reported shares` },
    { members: ["van"], size: ri("iu4", 10, 90), note: `${rnd("ius4", 3, 14).toFixed(1)}% of reported shares` },
    { members: [], size: ri("iu5", 20, 160), note: `${rnd("ius5", 4, 18).toFixed(1)}% of reported shares` },
  ];

  const overlap = MGR_NAMES.slice(0, 8).map((name, i) => ({ name, peers: ri(`iov${i}`, 3, 27), of: 28 }));

  // Manager × peer-issuer adjacency. A manager that files nothing for an issuer is null, not 0.
  const matrixRows = MGR_NAMES.slice(0, 8);
  const matrixCols = ["NVDA", "AMD", "INTC", "AVGO", "QCOM", "TXN", "MU", "ADI", "MRVL", "NXPI"];
  const matrix = {
    rows: matrixRows,
    cols: matrixCols,
    cells: matrixRows.flatMap((row) =>
      matrixCols.map((col) => ({
        row,
        col,
        value: seedN(`${T}mx${row}${col}`) > 0.82 ? null : rnd(`imx${row}${col}`, 0.1, 9.4),
      })),
    ),
  };

  const reportedPct = rnd("ires", 58, 84);
  const insiderPct = rnd("iresi", 0.3, 7);
  const residual = [
    { key: "reported", label: "Reported on 13F-HR", share: reportedPct },
    { key: "insider", label: "Insider & affiliate (DEF 14A)", share: insiderPct },
    { key: "unattributed", label: "Not attributed to any filing", share: Math.max(2, 100 - reportedPct - insiderPct) },
  ];

  const stablePct = rnd("istab", 34, 72);
  return {
    flow,
    quarterTable,
    pareto,
    treemap,
    lorenz: shares.map((s) => s.v),
    effective: eff.toFixed(1),
    hhi: hhiN.toFixed(0),
    gini: rnd("igini", 0.42, 0.86).toFixed(2),
    halfCount: String(half),
    domicile,
    upsetSets,
    upset,
    overlap,
    matrix,
    residual,
    residualSeries: nine.map((period, i) => ({
      period,
      value: residual[2].share * (1 + (seedN(`${T}irs${i}`) - 0.5) * 0.22),
    })),
    stable: `${stablePct.toFixed(1)}%`,
    tenureWeighted: `${(stablePct * rnd("itw", 0.82, 1.12)).toFixed(1)}%`,
    firstQuarter: `${rnd("ifq", 2, 16).toFixed(1)}%`,
    cohorts: ["8+ quarters", "4–7 quarters", "2–3 quarters", "First quarter"].map((cohort, i) => ({
      cohort,
      share: `${rnd(`ic${i}`, 4, 42).toFixed(1)}%`,
      weight: `${(1 - i * 0.25).toFixed(2)}×`,
    })),
    calcs: {
      eff: {
        formula: "Effective holders = 10,000 ÷ HHI",
        inputs: [
          { k: "HHI", v: "sum of squared percentage shares across the reported register" },
          { k: "Reading", v: "the number of equal-sized holders that would produce the same concentration" },
        ],
        note: "A count of equivalents, not of managers. The register can hold two thousand filers and still have an effective count in single digits.",
      },
      hhi: {
        formula: "HHI = Σ (manager share of reported shares, in percent)²",
        inputs: [
          { k: "Universe", v: "the 13F-reported register only" },
          { k: "Range", v: "near 0 for a flat register, 10,000 if one manager held it all" },
        ],
        note: "Computed over reported shares, not shares outstanding — the unreported float is excluded, so this overstates concentration of the company itself.",
      },
      gini: {
        formula: "Gini = area between the Lorenz curve and the diagonal ÷ area under the diagonal",
        inputs: [
          { k: "Curve", v: "cumulative share of reported shares against cumulative share of holders" },
          { k: "Range", v: "0 = every holder equal · 1 = one holder has everything" },
        ],
        note: "Inequality among filers who report. A manager below the 13F threshold is invisible here, and there are many of them.",
      },
      residual: {
        formula: "Shares outstanding − 13F-reported shares − insider beneficial ownership",
        inputs: [
          { k: "Shares outstanding", v: "latest periodic report cover page" },
          { k: "Attributed", v: "13F-HR information table + DEF 14A ownership table" },
        ],
        note: "The residual is NOT retail ownership. It is everything no filing accounts for — sub-threshold managers, foreign holders with no US filing obligation, and shares held in ways that never appear on a form.",
      },
      stable: {
        formula: "Share of reported shares held by managers reporting the position for 8+ consecutive quarters",
        inputs: [
          { k: "Tenure", v: "consecutive quarters this manager has reported this issuer" },
          { k: "Weighting", v: "tenure-weighted variant applies a decaying weight by cohort" },
        ],
        note: "Tenure is measured from the filings we hold, so a position held before our coverage floor reads as newer than it is.",
      },
    },
  };
}

// ---------------------------------------------------------------- i4 · ownership & stewardship

export interface InstSteward {
  blocks: { name: string; purpose: string; amended: string; form: string; pct: string }[];
  blockLanes: { id: string; label: string; events: { id: string; date: string; kind: string; title: string }[] }[];
  blockStripNote: string;
  voting: { sayOnPay: string; withhold: string; turnout: string; proposals: string };
  sopSeries: { period: string; value: number }[];
  withholdSeries: { period: string; value: number }[];
  dissentSeries: { period: string; value: number }[];
  voteWeighted: { rows: { k: string; pct: string; pctN: number }[]; dissentShares: string; note: string };
  activism: {
    active: boolean;
    holder: string;
    stake: string;
    seats: number;
    standstill: string;
    steps: { date: string; value: number }[];
    trail: { form: string; date: string; what: string }[];
  };
}

export function instSteward(T: string): InstSteward {
  const { rnd, ri, pick, gt } = seeded(T);
  const years = ["FY22", "FY23", "FY24", "FY25", "FY26"];
  const holders = ["Vanguard Group Inc", "BlackRock Inc", "Elliott Investment Management"];

  const blocks = holders.map((name, i) => ({
    name,
    // Purpose language is Item 4, quoted in condensed form — never paraphrased into a verdict.
    purpose: i === 2
      ? "shares acquired to engage with the board on capital allocation"
      : "shares acquired in the ordinary course of business, not to influence control",
    amended: `last amended ${ri(`ibam${i}`, 1, 28)} ${pick(["Jan", "Feb", "Mar", "Apr", "May"], `ibm${i}`)} 2026`,
    form: i === 2 ? "SC 13D/A" : "SC 13G/A",
    pct: `${rnd(`ibp${i}`, 5.1, 13.4).toFixed(2)}%`,
  }));

  const blockLanes = holders.map((name, i) => ({
    id: name,
    label: name.split(" ")[0],
    events: Array.from({ length: ri(`ible${i}`, 2, 5) }, (_x, j) => ({
      id: `${i}-${j}`,
      date: `202${4 + Math.floor(j / 2)}-${String(ri(`ibd${i}${j}`, 1, 12)).padStart(2, "0")}-${String(ri(`ibdd${i}${j}`, 1, 28)).padStart(2, "0")}`,
      kind: j === 0 ? "filing" : "amendment",
      title: j === 0 ? `${blocks[i].form.replace("/A", "")} — initial` : `${blocks[i].form} — amendment ${j}`,
    })),
  }));

  const sop = rnd("isop", 58, 97);
  const wh = rnd("iwh", 1.4, 22);
  const diss = rnd("idis", 2, 26);

  return {
    blocks,
    blockLanes,
    blockStripNote:
      "Each mark is a filing, not a trade. A stake moves on the date it was reported, and a holder below 5% has no obligation to file at all — so a gap is an absence of obligation, not of ownership.",
    voting: {
      sayOnPay: `${sop.toFixed(1)}%`,
      withhold: `${wh.toFixed(1)}%`,
      turnout: `${rnd("itn", 71, 95).toFixed(1)}%`,
      proposals: String(ri("ibal", 4, 14)),
    },
    sopSeries: years.map((period, i) => ({ period, value: sop * (0.94 + i * 0.012) * (1 + (seedN(`${T}sop${i}`) - 0.5) * 0.06) })),
    withholdSeries: years.map((period, i) => ({ period, value: wh * (1.1 - i * 0.02) * (1 + (seedN(`${T}wh${i}`) - 0.5) * 0.2) })),
    dissentSeries: years.map((period, i) => ({ period, value: diss * (0.9 + i * 0.03) * (1 + (seedN(`${T}ds${i}`) - 0.5) * 0.14) })),
    voteWeighted: {
      rows: [
        ["Voted with management", rnd("ivw1", 62, 92)],
        ["Voted against management", rnd("ivw2", 3, 24)],
        ["Abstained or withheld", rnd("ivw3", 1, 12)],
        ["No N-PX record matched", rnd("ivw4", 2, 18)],
      ].map(([k, v]) => ({ k: k as string, pct: `${(v as number).toFixed(1)}%`, pctN: v as number })),
      dissentShares: `${rnd("idsh", 40, 620).toFixed(0)}M`,
      note: "Weighted by each manager's reported 13F position, matched to its own N-PX record. A manager with no matched record is counted separately rather than assumed to have voted with management.",
    },
    activism: gt("iact", 0.35)
      ? {
          active: true,
          holder: "Elliott Investment Management",
          stake: `${rnd("iast", 5.2, 11.8).toFixed(1)}%`,
          seats: ri("iseat", 0, 3),
          standstill: gt("istand", 0.5) ? "in effect to the 2027 annual meeting" : "none disclosed",
          steps: years.map((_y, i) => ({
            date: `202${2 + i}-06-30`,
            value: rnd(`iastp${i}`, 4.4, 12.2),
          })),
          trail: [
            { form: "SC 13D", date: "2025-02-14", what: "initial position disclosed, purpose stated as engagement" },
            { form: "SC 13D/A", date: "2025-06-03", what: "stake increased; nominees named for the annual meeting" },
            { form: "8-K 1.01", date: "2025-09-19", what: "cooperation agreement filed as an exhibit" },
            { form: "SC 13D/A", date: "2026-01-27", what: "stake reduced following the agreement" },
          ],
        }
      : {
          active: false,
          holder: "",
          stake: "",
          seats: 0,
          standstill: "",
          steps: [],
          trail: [],
        },
  };
}

// ---------------------------------------------------------------- i5 · holder behavior

export interface InstBehavior {
  turnover: string;
  medianHold: string;
  turnoverSeries: { period: string; value: number }[];
  cohortHeat: { rows: string[]; cols: string[]; cells: { row: string; col: string; value: number | null }[] };
  cohortNote: string;
  cohorts: { k: string; pct: string; pctN: number }[];
  note: string;
  funds: { name: string; family: string; asOf: string; pctFund: string; pctFundN: number; shares: string; change: string }[];
  fundNote: string;
  calcs: { turnover: Calc; persist: Calc };
}

export function instBehavior(T: string): InstBehavior {
  const { rnd, ri, pick } = seeded(T);
  const quarters = ["1Q24", "2Q24", "3Q24", "4Q24", "1Q25", "2Q25", "3Q25", "4Q25", "1Q26"];
  const turn = rnd("ibt", 8, 34);

  // Tenure buckets are the SAME idea section 03's stable-capital share is built on, so the
  // 8+ bucket here is that figure: one tenure model, two readings of it.
  const stablePct = rnd("istab", 34, 72);
  const rest = 100 - stablePct;
  const cohorts = [
    { k: "8+ quarters", pctN: stablePct },
    { k: "4–7 quarters", pctN: rest * 0.44 },
    { k: "2–3 quarters", pctN: rest * 0.34 },
    { k: "First quarter", pctN: rest * 0.22 },
  ].map((c) => ({ ...c, pct: `${c.pctN.toFixed(1)}%` }));

  const cohortRows = ["2024 entrants", "2025 H1 entrants", "2025 H2 entrants", "2026 entrants"];
  const cohortCols = quarters.slice(-6);
  return {
    turnover: `${turn.toFixed(1)}%`,
    medianHold: `${rnd("ibm", 3.2, 14.6).toFixed(1)} quarters`,
    turnoverSeries: quarters.map((period, i) => ({
      period,
      value: turn * (1.06 - i * 0.008) * (1 + (seedN(`${T}ibts${i}`) - 0.5) * 0.16),
    })),
    cohortHeat: {
      rows: cohortRows,
      cols: cohortCols,
      cells: cohortRows.flatMap((row, ri2) =>
        cohortCols.map((col, ci) => ({
          row,
          col,
          // A cohort cannot be retained before it existed — that is a structural null, and the
          // heatmap hatches it rather than drawing a zero.
          value: ci < ri2 ? null : Math.max(4, 100 - (ci - ri2) * rnd(`ibc${ri2}`, 6, 19)),
        })),
      ),
    },
    cohortNote:
      "Read across a row: the share of that entry cohort still reporting a position in each later quarter. A hatched cell is a quarter before the cohort existed, not a zero.",
    cohorts,
    note: "Tenure is counted from the earliest 13F-HR we hold for that manager and issuer. A position opened before our coverage floor reads as newer than it is, which biases this table toward shorter tenures.",
    funds: [
      ["Growth Index Fund", "Vanguard"],
      ["Total Stock Market Index", "Vanguard"],
      ["500 Index Fund", "Fidelity"],
      ["Technology Select Sector SPDR", "State Street"],
    ].map(([name, family], i) => {
      const pf = rnd(`ifp${i}`, 0.4, 9.2);
      const ch = rnd(`ifc${i}`, -18, 22);
      return {
        name,
        family,
        asOf: `${ri(`ifa${i}`, 1, 28)} ${pick(["Feb", "Mar", "Apr"], `ifm${i}`)} 2026`,
        pctFund: `${pf.toFixed(2)}%`,
        pctFundN: pf,
        shares: `${rnd(`ifs${i}`, 1.2, 88).toFixed(1)}M`,
        change: `${ch >= 0 ? "+" : "−"}${Math.abs(ch).toFixed(1)}%`,
      };
    }),
    fundNote:
      "N-PORT is filed by the FUND, not by the 13F manager — a fund family's positions do not sum to its manager's 13F, and the two are filed on different calendars. The bar is the position as a share of that fund, not of the issuer.",
    calcs: {
      turnover: {
        formula: "Managers reporting last quarter but not this one ÷ managers reporting last quarter",
        inputs: [
          { k: "Matching", v: "by CIK across consecutive 13F-HR filings" },
          { k: "Excluded", v: "managers who fell below the $100M filing threshold entirely" },
        ],
        note: "A manager that stops filing looks identical to one that sold. The 13F says nothing about which happened, and this figure cannot separate them.",
      },
      persist: {
        formula: "Consecutive quarters a manager has reported this issuer, taken at the median across the register",
        inputs: [
          { k: "Counted from", v: "the earliest 13F-HR on file for that manager and issuer" },
          { k: "Break", v: "one missing quarter ends the run; a later re-entry starts a new one" },
        ],
        note: "Bounded below by our coverage, not by the position's real age — the true median is at least this long and possibly much longer.",
      },
    },
  };
}

// ---------------------------------------------------------------- i6 · limits & supply

export interface InstLimits {
  selling: { active: boolean; form: string; holders: string; shares: string };
  checks: { k: string; state: string; forms: string; on: boolean }[];
  asOf: string;
  gantt: { key: string; label: string; start: string; end: string; kind?: "window" | "expiry" }[];
  ganttNote: string;
  supplyNote: string;
  insiderFilings: { plans: string; delinquent: string };
  mechanics: { confidential: string; amendments: string; indexEvent: string; lag: string; note: string };
  lagValues: number[];
  lagMedian: number;
  lagNote: string;
  amendRate: { key: string; label: string; value: number }[];
  amendNote: string;
}

export function instLimits(T: string): InstLimits {
  const { rnd, ri, pick, gt } = seeded(T);
  const active = gt("isell", 0.45);
  const checks: [string, boolean, string][] = [
    ["Resale registration on file", active, "S-1 / S-3"],
    ["Tender or exchange offer open", gt("ito", 0.85), "SC TO-I / SC TO-T"],
    ["Restricted-stock sale notices", gt("i144", 0.4), "Form 144"],
    ["Deregistration or delisting", gt("idr", 0.92), "Form 25 / Form 15"],
  ];
  return {
    selling: {
      active,
      form: pick(["S-3 resale shelf", "S-1 resale registration"], "isf"),
      holders: `${ri("ish", 2, 34)} selling holders`,
      shares: `${rnd("isx", 1.2, 74).toFixed(1)}M shares`,
    },
    checks: checks.map(([k, on, forms]) => ({
      k,
      on,
      // A check that is off says "nothing on file in the window", never "this cannot happen".
      state: on ? "on file" : "none in the window",
      forms,
    })),
    asOf: "Checked against the filing index for the trailing four quarters.",
    gantt: [
      { key: "lockup", label: "Lock-up expiry", start: "2026-08-01", end: "2026-09-15", kind: "expiry" },
      { key: "shelf", label: "Shelf effective period", start: "2026-06-01", end: "2027-06-01" },
      { key: "blackout", label: "Blackout window", start: "2026-07-01", end: "2026-08-14" },
      { key: "next13f", label: "Next 13F window", start: "2026-07-01", end: "2026-08-14" },
    ],
    ganttNote:
      "Dates come from the filings themselves where stated. A lock-up LENGTH is an exhibit term — prose, not a tagged fact — so a window shown here exists because a filing dated it, and an absent window may still exist unstated.",
    supplyNote:
      "Supply-side events change how many shares can reach the market, not who holds them. None of this appears in the 13F register.",
    insiderFilings: {
      plans: `${ri("ip10", 1, 7)} officers with Rule 10b5-1 plans adopted in the trailing year`,
      delinquent: gt("idq", 0.8)
        ? `${ri("idqn", 1, 3)} late Section 16 filings named in the proxy (Item 405)`
        : "No late Section 16 filings named in the proxy (Item 405)",
    },
    mechanics: {
      confidential: gt("iconf2", 0.7)
        ? "Confidential treatment requested by at least one manager — positions omitted from the public table"
        : "No confidential-treatment requests identified this quarter",
      amendments: `${rnd("iamd", 1.4, 12).toFixed(1)} amendments per 100 filings`,
      indexEvent: gt("iidx", 0.75)
        ? "Index reconstitution fell inside the quarter — passive holdings moved for mechanical reasons"
        : "No index reconstitution inside the quarter",
      lag: `Median acceptance lag ${ri("imlag", 28, 44)} days after quarter end`,
      note: "Each of these makes the register incomplete or non-comparable in a way no figure on the page reveals on its own.",
    },
    lagValues: Array.from({ length: 60 }, (_x, i) => rnd(`ilag${i}`, 12, 46)),
    lagMedian: rnd("ilagm", 28, 42),
    lagNote:
      "Filings cluster against the 45-day deadline. A manager filing on day 44 is not late, and nothing distinguishes a considered filing from a rushed one.",
    amendRate: ["1Q25", "2Q25", "3Q25", "4Q25", "1Q26"].map((label, i) => ({
      key: label,
      label,
      value: rnd(`iar${i}`, 0.8, 14),
    })),
    amendNote:
      "An amendment restates a holdings table after the fact. A high rate means the register you read at the time was wrong more often, not that the manager traded more.",
  };
}

/** The glossary — what each source is, and what it cannot tell you. Verbatim. */
export const INST_GLOSSARY: [string, string][] = [
  ["13F-HR", "Quarterly holdings report from an institutional manager with over $100M in Section 13(f) securities. Filed within 45 days of quarter end."],
  ["SC 13D / 13G", "Beneficial ownership above 5%. 13D is for holders who may seek to influence control; 13G is the passive short form."],
  ["N-PX", "Annual record of how a fund voted every proxy it held. The only public source for manager-level voting."],
  ["N-PORT", "Monthly portfolio holdings report from a registered fund, filed at the individual fund level."],
  ["Form 4", "Insider transaction report, due two business days after the trade. Code A is an acquisition, D a disposition, S an open-market sale."],
  ["Form 144", "Notice of a proposed sale of restricted or control securities, filed when the order is placed. Not every notice results in a trade."],
  ["Rule 10b5-1", "A pre-arranged trading plan. Since 2023 a 90-day cooling-off period applies between adoption and the first trade for officers and directors."],
  ["Item 405", "The proxy disclosure naming insiders who filed Section 16 reports late."],
  ["8-K Item 5.07", "Certified results of a shareholder vote, due four business days after the meeting."],
  ["Section 13(f) threshold", "The $100M in listed holdings that triggers 13F reporting. Smaller managers never appear in the register."],
];
