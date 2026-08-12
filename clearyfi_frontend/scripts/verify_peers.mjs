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
const b=await puppeteer.launch({args:["--no-sandbox","--disable-dev-shm-usage"]});
const p=await b.newPage(); await p.setViewport({width:1440,height:2600});
let pass=0,fail=0;
const ck=(n,ok,d="")=>{ok?(pass++,console.log(`  ✓ ${n}`)):(fail++,console.error(`  ✗ ${n}${d?` — ${d}`:""}`));};

for (const TK of (process.env.TICKERS||"AAPL").split(",")) {
console.log(`\n── ${TK} ──`);
const seg = await g(`/v1/companies/${TK}/segments`);
await p.goto(`http://localhost:${PORT}/company/${TK}/peers?focal=${TK}`,{waitUntil:"networkidle0"});
await p.waitForFunction(()=>!!document.querySelector(".px-mix, .ds-state"),{timeout:90000});
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
}
console.log(`\n${pass} passed, ${fail} failed`);
await b.close(); s.close();
process.exit(fail ? 1 : 0);
