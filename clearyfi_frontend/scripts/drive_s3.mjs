/*
 * §03 segments & geography — driven against the real API.
 *
 * This is the one section that needed a new source, and the assertions are about the three claims
 * it must not make:
 *
 *   - a margin where the filer tagged no operating income (only 35% of them do),
 *   - a share of consolidated revenue, when the splits need not sum to it,
 *   - "no data" where the truth is "a different fiscal year" or "measures we do not read".
 *
 *   TICKERS=AAPL,AMZN,KO,JPM,TSLA node scripts/drive_s3.mjs --dist app-dist
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import puppeteer from "puppeteer";
const DIST=resolve(process.argv[process.argv.indexOf("--dist")+1]), PORT=5201, API="http://127.0.0.1:8000";
const MIME={".html":"text/html",".js":"text/javascript",".css":"text/css",".woff2":"font/woff2"};
const s=createServer(async(rq,rs)=>{const u=new URL(rq.url,`http://localhost:${PORT}`);
  if(u.pathname.startsWith("/v1")){const r=await fetch(API+u.pathname+u.search);
    rs.writeHead(r.status,{"content-type":"application/json"});rs.end(await r.text());return;}
  let f=join(DIST,decodeURIComponent(u.pathname));
  if(!extname(u.pathname)||!existsSync(f))f=join(DIST,"index.html");
  rs.writeHead(200,{"content-type":MIME[extname(f)]??"application/octet-stream"});rs.end(await readFile(f));});
await new Promise(r=>s.listen(PORT,r));
const b=await puppeteer.launch({args:["--no-sandbox","--disable-dev-shm-usage"]});
const p=await b.newPage(); await p.setViewport({width:1440,height:2400});
let pass=0,fail=0,http429=0; const errs=[]; p.on("pageerror",e=>errs.push(e.message));
p.on("response",r=>{if(r.status()===429)http429++;});
const ck=(n,ok,d="")=>{ok?(pass++,console.log(`  ✓ ${n}`)):(fail++,console.error(`  ✗ ${n}${d?` — ${d}`:""}`));};

for (const TK of (process.env.TICKERS||"AAPL").split(",")) {
console.log(`\n── ${TK} ──`);
const api = await (await fetch(`${API}/v1/companies/${TK}/segments`)).json();

await p.goto(`http://localhost:${PORT}/company/${TK}/overview?focal=${TK}`,{waitUntil:"networkidle0"});
await p.waitForFunction(()=>!!document.querySelector("#s3"),{timeout:90000});
await new Promise(r=>setTimeout(r,700));

const { section, rows, hasBarWithoutMargin } = await p.evaluate(()=>{
  const sec=document.querySelector("#s3")?.closest(".hub-sec");
  const rows=[...(sec?.querySelectorAll(".hub-seg-grid.hub-row")||[])].map(r=>({
    name:(r.querySelector(".hub-seg-name")?.textContent||"").trim(),
    cells:[...r.querySelectorAll(".hub-cell-mono")].map(c=>c.textContent.trim()),
    margin:(r.querySelector(".hub-seg-margin .hub-cell-mono")?.textContent||"").trim(),
    hasTrack: !!r.querySelector(".hub-seg-track"),
  }));
  // The rule this whole page rests on: never render a missing value as a quantity.
  const hasBarWithoutMargin = rows.some(r=>r.hasTrack && /N\/A/.test(r.margin));
  return { section:(sec?.innerText||"").replace(/\s+/g," ").trim(), rows, hasBarWithoutMargin };
});
console.log("   §03:", section.slice(0, 190));

ck("the section is not marked synthetic", !/synthetic/i.test(section), section.slice(0,90));
ck("the source names the real one", /DERA financial statement data sets/i.test(section));
ck("customer concentration is absent, not faked", !/Customer A|customer concentration/i.test(section));

if (api.status === "ok" && api.segments.length) {
  ck("row count matches the API", rows.length===api.segments.length,
     `card=${rows.length} api=${api.segments.length}`);
  ck("the fiscal year is stated", new RegExp(`FY${api.fiscal_year}`).test(section),
     section.slice(0,160));
  ck("segment names match the API",
     rows.map(r=>r.name).join("|")===api.segments.map(s=>s.label).join("|"),
     `${rows.map(r=>r.name)} vs ${api.segments.map(s=>s.label)}`);

  // A margin bar beside "N/A" would read as a real zero.
  ck("no margin bar is drawn without a margin", !hasBarWithoutMargin,
     JSON.stringify(rows.find(r=>r.hasTrack && /N\/A/.test(r.margin))));
  const noMargin = api.segments.filter(s=>s.margin===null).length;
  ck("segments without operating income render N/A",
     rows.filter(r=>/N\/A/.test(r.margin)).length===noMargin,
     `card=${rows.filter(r=>/N\/A/.test(r.margin)).length} api=${noMargin}`);
  if (noMargin) {
    ck("the note explains the missing margins",
       /tag no operating income/i.test(section), section.slice(-320));
  }

  ck("the note says segments are the filer's own and not comparable",
     /not comparable across companies/i.test(section), section.slice(-320));
  ck("the note says shares are of the disclosed splits",
     /need not sum to consolidated revenue/i.test(section), section.slice(-320));
} else {
  ck("an empty section explains BOTH causes",
     /not be published yet/i.test(section) && /does not read/i.test(section),
     section.slice(0,300));
  ck("no fabricated segment rows", rows.length===0, `${rows.length}`);
}

// Long-lived assets and revenue by country are separate ASC 280 disclosures; many filers give
// only the first, and that has to read as the filer's choice rather than our gap.
const geoAssets = (api.geography||[]).filter(g=>g.long_lived_assets!==null).length;
if (api.status === "ok" && !geoAssets && api.geography.length) {
  ck("a missing PP&E-by-country split is explained as the filer's choice",
     /separate ASC 280 disclosures/i.test(section), section.slice(-400));
}

ck("no page error", errs.length===0, errs[0]);
ck("no 429", http429===0);
}
console.log(`\n${pass} passed, ${fail} failed`);
await b.close(); s.close();
process.exit(fail?1:0);
