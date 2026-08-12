/*
 * Cross-check the §Peer-relative view against the API. Ported panel by panel, so this grows
 * with the port — today it covers "Segment & geographic mix" only.
 *
 *   TICKERS=AAPL,KO,JPM node scripts/verify_peers.mjs --dist app-dist
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import puppeteer from "puppeteer";
const DIST=resolve(process.argv[process.argv.indexOf("--dist")+1]), PORT=5242, API="http://127.0.0.1:8000";
const H={"sec-fetch-site":"same-origin"};
const MIME={".html":"text/html",".js":"text/javascript",".css":"text/css",".woff2":"font/woff2"};
const s=createServer(async(rq,rs)=>{const u=new URL(rq.url,`http://localhost:${PORT}`);
  if(u.pathname.startsWith("/v1")){const r=await fetch(API+u.pathname+u.search,{headers:H});
    rs.writeHead(r.status,{"content-type":"application/json"});rs.end(await r.text());return;}
  let f=join(DIST,decodeURIComponent(u.pathname));
  if(!extname(u.pathname)||!existsSync(f))f=join(DIST,"index.html");
  rs.writeHead(200,{"content-type":MIME[extname(f)]??"application/octet-stream"});rs.end(await readFile(f));});
await new Promise(r=>s.listen(PORT,r));
const g=(p)=>fetch(API+p,{headers:H}).then(r=>r.json());
const b=await puppeteer.launch({args:["--no-sandbox","--disable-dev-shm-usage"],protocolTimeout:420000});
const p=await b.newPage(); await p.setViewport({width:1440,height:2600});
let pass=0,fail=0;
const ck=(n,ok,d="")=>{ok?(pass++,console.log(`  ✓ ${n}`)):(fail++,console.error(`  ✗ ${n}${d?` — ${d}`:""}`));};

for (const TK of (process.env.TICKERS||"AAPL").split(",")) {
console.log(`\n── ${TK} ──`);
const seg = await g(`/v1/companies/${TK}/segments`);
await p.goto(`http://localhost:${PORT}/company/${TK}/peers?focal=${TK}`,{waitUntil:"networkidle0"});
await p.waitForFunction(()=>!!document.querySelector(".px-mix, .state"),{timeout:240000});
await new Promise(r=>setTimeout(r,1200));
const txt = await p.evaluate(()=>(document.body.innerText||"").replace(/\s+/g," "));

if (seg.status === "ok") {
  /* C1 the members drawn are the filer's OWN tagged members, not a fixed region list */
  const geoLabels = seg.geography.map(x => x.label || x.member);
  ck(geoLabels.length
       ? `C1 region bar shows the filer's tagged members (${geoLabels.join(", ")})`
       : "C1 a filer with NO tagged geography says so instead of drawing an empty bar",
     geoLabels.length
       ? geoLabels.every(l => txt.includes(l))
       : /tagged no geographic split/i.test(txt),
     `api=${JSON.stringify(geoLabels)}`);
  /* C1b the OLD hardcoded axis is gone. "Americas" is a real Apple SEGMENT, so the tell is a
     region name no filer tagged — "Rest of Asia" / "EMEA" came from the fixed list. */
  ck("C1b the fixed four-region axis is gone",
     !/Rest of Asia\b/.test(txt) && !/EMEA/.test(txt));
  /* C2 segment members are drawn (the bar was empty before: segmentChips was hardcoded []) */
  const segLabels = seg.segments.map(x => x.label || x.member);
  ck(`C2 segment bar is populated (${segLabels.length} members)`,
     segLabels.length === 0 || segLabels.every(l => txt.includes(l)),
     `api=${JSON.stringify(segLabels)}`);
  /* C3 shares match the API to one decimal */
  const first = seg.segments[0] ?? seg.geography[0];
  if (first && first.revenue_share !== null) {
    const pct = `${(first.revenue_share*100).toFixed(1)}%`;
    ck(`C3 a share on screen matches the API (${pct})`, txt.includes(pct), `api=${pct}`);
  }
  /* C4 the panel says the splits need not sum to consolidated revenue */
  ck("C4 the disclosed-splits caveat is stated", /need not sum to consolidated revenue/i.test(txt));
} else {
  ck("C1 no segment facts reads as an absence in the tagging, not one segment",
     /absence in the tagged data|no ASC 280/i.test(txt));
}

/* ---- Filing activity & flags: the FORM MIX, not a written list of recent filings ---- */
const act = await g(`/v1/companies/${TK}/filing-activity`);
const aud = await g(`/v1/companies/${TK}/audit`);
if (act.status === "ok") {
  const top = act.forms[0];
  ck(`C5 top form's count on screen (${top.form} ${top.count})`,
     txt.includes(String(top.count)), `api=${top.form}:${top.count}`);
  /* C6 the indexed window travels with the counts — a count without it compares a decade
     against a year */
  ck(`C6 the indexed filing count is stated (${act.indexed_filings})`,
     txt.includes(String(act.indexed_filings)), `api=${act.indexed_filings}`);
  /* C7 amendments are a RATE, never a quality score */
  ck("C7 amendment rate is qualified as not-a-judgement",
     /correction or a routine refiling/i.test(txt));
}

/* C8 no fabricated regulatory flag survives. "material weakness" is the Item 9A conclusion,
   which is prose we do not parse — /audit returns icfr.status "na" — so it must never appear;
   and nothing may assert "timely filer", which the old panel did for every company. */
ck("C8 no unsourceable 'material weakness' or blanket 'timely filer' claim",
   !/material weakness/i.test(txt) && !/timely filer/i.test(txt));

/* C9 flags match the filing index */
const ev = aud.audit_events ?? {};
const n402 = (ev.events ?? []).filter(e => e.item === "4.02").length;
const n401 = (ev.events ?? []).filter(e => e.item === "4.01").length;
const nLate = (ev.late_filings ?? []).length;
/* ---- Percentile vs peers: real ranks, oriented, with the unscorable ones shown ---- */
const tp = await g(`/v1/companies/${TK}/theme-percentiles?year=2026&period=Q1`);
// Scoped to the RAIL. The rest of this view is still the prototype's — the distribution table
// carries fabricated P-values and the shell's peer-set pill still reads "rank 5 / 62" from
// hub.ts — so a page-wide scan would fail on surfaces this panel does not own. Narrow the
// selector as each panel lands, never the assertion.
const rail = await p.evaluate(() =>
  (document.querySelector(".px-rail")?.innerText || "").replace(/\s+/g, " "));
if (tp.status === "ok") {
  const scored = tp.themes.filter(t => t.scored);
  const unscored = tp.themes.filter(t => !t.scored);
  /* C10 each scored theme's percentile is on screen */
  ck(`C10 scored theme percentiles on screen (${scored.map(t=>`${t.key}:P${Math.round(t.percentile)}`).join(" ")})`,
     scored.every(t => rail.includes(`P${Math.round(t.percentile)}`)),
     `api=${JSON.stringify(scored.map(t=>t.percentile))}`);
  /* C11 the two DEFERRED themes are RENDERED as unscored, not dropped. Dropping them leaves a
     rail of five that looks complete. */
  ck("C11 accounting quality & structure are shown but unscored",
     /Accounting quality/i.test(rail) && /Structure/i.test(rail) && /not scored/i.test(rail));
  /* C12 no fabricated composite rank survives — it was the literal "5 / 62" with a QoQ move */
  ck("C12 the invented composite rank and QoQ move are gone",
     !/up 3 spots QoQ/i.test(rail) && !/\b5 \/ 62\b/.test(rail));
  /* C13 coverage travels with a scored theme: P over 2 of 6 metrics is not the same claim as
     P over 6 of 6 */
  const withCov = scored[0];
  if (withCov) {
    ck(`C13 coverage is stated (${withCov.covered} of ${withCov.total} metrics)`,
       rail.includes(`${withCov.covered} of ${withCov.total} metrics`),
       `api=${withCov.covered}/${withCov.total}`);
  }
  /* C14 the old fabricated constants are gone. CO_THEME_PCT was identical for every company:
     prof 88, growth 76, health 64, cash 91, eff 58, acct 82, struct 70. */
  const fabricated = ["P88","P76","P64","P91","P58","P82","P70"];
  const realPcts = new Set(scored.map(t => `P${Math.round(t.percentile)}`));
  ck("C14 no theme shows the old hardcoded percentile unless the API really says so",
     fabricated.every(f => !rail.includes(f) || realPcts.has(f)),
     `rail-fabricated=${fabricated.filter(f=>rail.includes(f)&&!realPcts.has(f))}`);
} else {
  ck("C10 no ranks reads as 'not computed', never as a bottom placing",
     /cannot be placed against its peers|no peer ranks/i.test(txt));
}

ck(`C9 flags reflect the index (4.02=${n402} 4.01=${n401} 12b-25=${nLate})`,
   (n402 + n401 + nLate) === 0
     ? /No Item 4.02 restatement/i.test(txt)
     : (n402 ? /non-reliance 8-K/i.test(txt) : true)
       && (n401 ? /auditor change/i.test(txt) : true)
       && (nLate ? /late-filing notice/i.test(txt) : true),
   `events=${JSON.stringify((ev.events||[]).map(e=>e.item))}`);
}
console.log(`\n${pass} passed, ${fail} failed`);
await b.close(); s.close();
process.exit(fail ? 1 : 0);
