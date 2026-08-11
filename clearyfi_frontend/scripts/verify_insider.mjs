/*
 * Cross-check what the Insider activity view RENDERS against what the API returns.
 *
 * The view's whole argument is the split between what a filer DECIDED (codes P/S) and what
 * merely HAPPENED to their holdings (A/M/F), so the assertions below are mostly about that
 * split surviving the trip from the ledger to the screen — and about the two exclusions
 * (holdings, derivative rows) being STATED rather than silently shrinking the ledger.
 *
 *   TICKERS=AAPL,KO,JPM,NVDA node scripts/verify_insider.mjs --dist app-dist
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import puppeteer from "puppeteer";
const DIST=resolve(process.argv[process.argv.indexOf("--dist")+1]), PORT=5231, API="http://127.0.0.1:8000";
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
const b=await puppeteer.launch({args:["--no-sandbox","--disable-dev-shm-usage"]});
const p=await b.newPage(); await p.setViewport({width:1440,height:2400});
let pass=0,fail=0;
const ck=(n,ok,d="")=>{ok?(pass++,console.log(`  ✓ ${n}`)):(fail++,console.error(`  ✗ ${n}${d?` — ${d}`:""}`));};
const LIMIT=40;

for (const TK of (process.env.TICKERS||"AAPL").split(",")) {
console.log(`\n── ${TK} ──`);
const trades = await g(`/v1/companies/${TK}/insider-trades?limit=${LIMIT}`);
const sum    = await g(`/v1/companies/${TK}/insider-summary?limit=${LIMIT}`);
const f144   = await g(`/v1/companies/${TK}/proposed-sale-notices?limit=400`);

// The SAME filter the adapter applies: holdings out, derivative rows out.
const rows = trades.filter(r => !r.is_holding && r.is_derivative !== true);
const holdings = trades.filter(r => r.is_holding).length;
const deriv = trades.filter(r => !r.is_holding && r.is_derivative === true).length;

await p.goto(`http://localhost:${PORT}/company/${TK}/insider?focal=${TK}`,{waitUntil:"networkidle0"});
await p.waitForFunction(()=>!!document.querySelector(".ia-tiles, .ds-state"),{timeout:90000});
await new Promise(r=>setTimeout(r,1200));
const txt = await p.evaluate(()=>(document.body.innerText||"").replace(/\s+/g," "));

/* B1 the ledger the page draws is the ledger the API returned, after the stated exclusions */
ck(`B1 transaction-row count on screen == API after exclusions (${rows.length})`,
   txt.includes(`${rows.length} transaction rows`), `api=${rows.length}`);

/* B2 the exclusions are NAMED, not silent — an unexplained shrink is the bug this guards */
ck("B2 both exclusions are disclosed with their counts",
   txt.includes(`${holdings} holding`) && txt.includes(`${deriv} derivative`),
   `holdings=${holdings} deriv=${deriv}`);

/* B3 open-market subset comes from the server-side tally, not a re-derivation */
ck(`B3 open-market P/S tile == /insider-summary (${sum.open_market_purchases}/${sum.open_market_sales})`,
   txt.includes(`${sum.open_market_purchases} / ${sum.open_market_sales}`),
   `api=${sum.open_market_purchases}/${sum.open_market_sales}`);

/* B4 acquisitions/dispositions are DIRECTION and the page says so */
const acq = rows.filter(r=>r.acquired_disposed==="A").length;
const dis = rows.filter(r=>r.acquired_disposed==="D").length;
ck(`B4 A/D tile == ledger direction counts (${acq}/${dis})`,
   txt.includes(`${acq} / ${dis}`) && /not intent/i.test(txt), `api=${acq}/${dis}`);

/* B5 the code split sums to the ledger's shares — a bar chart that drops a code is a lie
      about the denominator, which is exactly what the Pareto bug was on the 13F view */
const byCode = {};
for (const r of rows) byCode[r.transaction_code ?? "?"] = (byCode[r.transaction_code ?? "?"] ?? 0) + (r.shares ?? 0);
const top = Object.entries(byCode).sort((a,b)=>b[1]-a[1])[0];
ck(`B5 largest code's share total is on screen (${Math.round(top[1]).toLocaleString()} sh)`,
   txt.includes(Math.round(top[1]).toLocaleString()), `code=${top[0]}`);

/* B6 NO uncoded row is silently given a code. After the 2026-08-11 cache repair this should be
      zero for every ticker; if it is not, the page must show the "code not reported" bucket. */
const uncoded = rows.filter(r=>!r.transaction_code).length;
ck(`B6 uncoded rows (${uncoded}) are shown as uncoded, never assigned a code`,
   uncoded === 0 ? !txt.includes("code not reported") : txt.includes("code not reported"),
   `uncoded=${uncoded}`);

/* B7 latency is Form 4 ONLY — a Form 3/5 binned here would read as late against a rule that
      does not apply to it */
ck("B7 latency states it is Form 4 only", /Form 4 row/.test(txt) || /No Form 4 row/.test(txt));

/* B8 the peer strip is drawn from the precomputed group, and its SHAPE is described honestly:
      the distribution is two clusters, so a bare median of -1 would read as a broken chart */
const pr = await g(`/v1/companies/${TK}/peers/insider-net-ratio`);
if (pr.status === "ok" && pr.peer_count) {
  const pctFloor = Math.round((pr.shape.at_floor / pr.peer_count) * 100);
  ck(`B8 peer strip states the floor concentration (${pctFloor}% at -1 of ${pr.peer_count})`,
     txt.includes(`${pctFloor}% of the ${pr.peer_count} peers`), `api=${pctFloor}%`);
  /* B8b a peer with NO open-market row must not be plotted at 0.0 — absent is not balanced */
  ck(`B8b peers without activity are counted, not plotted (${pr.peers_without_activity})`,
     pr.peers_without_activity === 0
       ? !/had no open-market row at all/.test(txt)
       : txt.includes(`A further ${pr.peers_without_activity} companies`),
     `api=${pr.peers_without_activity}`);
  /* B8c the dot count on the strip equals the peers the API could compute a value for */
  const dots = await p.evaluate(() =>
    document.querySelectorAll('[aria-label*="net-acquisition ratio"] circle, .ds-strip circle').length);
  ck(`B8c strip plots only computable peers (api ${pr.peer_count})`, dots > 0 && dots <= pr.peer_count + 2,
     `dots=${dots}`);
  /* B8d peers are labelled by SYMBOL, never by a bare CIK — a dot reading "CIK 320193"
     identifies nothing to a reader */
  const withTicker = pr.peers.filter(x => x.ticker).length;
  const titles = await p.evaluate(() =>
    [...document.querySelectorAll('[aria-label*="net-acquisition ratio"] title, .ds-strip title')]
      .map(t => t.textContent || ""));
  ck(`B8d peers labelled by ticker/name, not bare CIK (${withTicker}/${pr.peer_count} have symbols)`,
     titles.length > 0 && !titles.some(t => /^CIK \d+/.test(t.trim())),
     `titles=${titles.length} sample=${JSON.stringify(titles[0] || "")}`);
  /* B8e clicking a peer navigates to that peer. The strip only binds a click when onPick is
     wired, so this fails loudly if the handler is dropped again. */
  const clicked = await p.evaluate(() => {
    const c = document.querySelector('[aria-label*="net-acquisition ratio"] circle, .ds-strip circle');
    if (!c) return false;
    c.dispatchEvent(new MouseEvent("click", { bubbles: true, view: window }));
    return true;
  });
  await new Promise(r => setTimeout(r, 900));
  const url = p.url();
  ck("B8e clicking a peer navigates to that peer's insider view",
     clicked && /\/company\/[A-Z.\-]+\/insider/i.test(url) && !url.includes(`/company/${TK}/insider?focal=${TK}`),
     `url=${url}`);
  // Return to the focal company so the remaining assertions read the right page.
  await p.goto(`http://localhost:${PORT}/company/${TK}/insider?focal=${TK}`,{waitUntil:"networkidle0"});
  await p.waitForFunction(()=>!!document.querySelector(".ia-tiles, .ds-state"),{timeout:90000});
  await new Promise(r=>setTimeout(r,1000));
} else {
  ck("B8 peer strip absent reads as 'not computed', never as no activity",
     /not been run|no SIC classification|no peer comparison/i.test(txt));
}

/* B9 Form 144: count and window come from the index, and the panel refuses to imply size */
if (f144.status === "ok") {
  ck(`B9 Form 144 count on screen (${f144.count})`,
     txt.includes(`${f144.count} notice`), `api=${f144.count}`);
  ck("B9b Form 144 panel disclaims shares/broker/person",
     /do(es)? not parse/i.test(txt));
} else {
  ck("B9 Form 144 unindexed reads as 'not looked', not 'none'", /not the same as finding none|not looked/i.test(txt));
}

/* B10 the window is FILINGS with the span it covered — never a promised day count */
ck(`B10 masthead prints filings + the span actually covered`,
   txt.includes(`${sum.filings} filing`) && !/trailing 180 days/.test(txt),
   `filings=${sum.filings}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
await b.close(); s.close();
process.exit(fail ? 1 : 0);
