/**
 * Drives §02's eight snapshot tiles against the live `/v1` API.
 *
 * Two of the eight are asserted to be N/A ON PURPOSE. "Cash & ST inv." and "Total debt" each name
 * a figure no filer files as one line, and filling them would mean adding two reported numbers
 * under a label claiming somebody reported the sum. A test that only checked "eight tiles have
 * values" would have rewarded exactly that.
 *
 * It also asserts those two draw NO sparkline. A one-point or empty series renders a flat line,
 * which reads as "no change" rather than "nothing to draw".
 *
 * Needs `--network host` and a running API (`docker compose up -d api`).
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import puppeteer from "puppeteer";
const DIST=resolve(process.argv[process.argv.indexOf("--dist")+1]), PORT=5185, API="http://127.0.0.1:8000";
const MIME={".html":"text/html",".js":"text/javascript",".css":"text/css",".woff2":"font/woff2"};
const s=createServer(async(rq,rs)=>{const u=new URL(rq.url,`http://localhost:${PORT}`);
  if(u.pathname.startsWith("/v1")){const r=await fetch(API+u.pathname+u.search);
    rs.writeHead(r.status,{"content-type":"application/json"});rs.end(await r.text());return;}
  let f=join(DIST,decodeURIComponent(u.pathname));
  if(!extname(u.pathname)||!existsSync(f))f=join(DIST,"index.html");
  rs.writeHead(200,{"content-type":MIME[extname(f)]??"application/octet-stream"});rs.end(await readFile(f));});
await new Promise(r=>s.listen(PORT,r));
const b=await puppeteer.launch({args:["--no-sandbox","--disable-dev-shm-usage"]});
const p=await b.newPage(); await p.setViewport({width:1440,height:1400});
let pass=0,fail=0; const errs=[];
p.on("pageerror",e=>errs.push(e.message));
const ck=(n,ok,d="")=>{ok?(pass++,console.log(`  ✓ ${n}`)):(fail++,console.error(`  ✗ ${n}${d?` — ${d}`:""}`));};
await p.goto(`http://localhost:${PORT}/company/AAPL/overview?focal=AAPL`,{waitUntil:"networkidle0"});
await p.waitForFunction(()=>{const r=document.querySelector(".alt-content");
  return !!r&&r.childElementCount>0&&!r.querySelector(".state-loading");},{timeout:20000});
await new Promise(r=>setTimeout(r,600));
const tiles = await p.$$eval(".hub-snap", els=>els.map(e=>({
  label:e.querySelector(".hub-snap-label")?.textContent?.trim(),
  value:e.querySelector(".hub-snap-value")?.textContent?.trim(),
  yoy:e.querySelector(".hub-snap-yoy")?.textContent?.trim(),
  spark:!!e.querySelector(".hub-snap-spark svg"),
  reason:e.querySelector(".hub-snap-value")?.getAttribute("title")||null})));
tiles.forEach(t=>console.log(`   ${String(t.label).padEnd(18)} ${String(t.value).padEnd(12)} ${t.spark?"spark":"—    "}  ${t.yoy||""}`));
ck("all eight tiles render", tiles.length===8, `${tiles.length}`);
const rev = tiles.find(t=>t.label==="Revenue");
ck("Revenue is real and has a spark", /\$/.test(rev?.value||"") && rev.spark, rev?.value);
ck("Revenue carries a YoY from the API's growth metric", /YoY/.test(rev?.yoy||""), rev?.yoy);
const gm = tiles.find(t=>t.label==="Gross margin");
ck("Gross margin is a percentage", /%$/.test(gm?.value||""), gm?.value);
const fcf = tiles.find(t=>t.label==="Free cash flow");
ck("Free cash flow comes from the API, not arithmetic", /\$/.test(fcf?.value||""), fcf?.value);
for (const l of ["Cash & ST inv.","Total debt"]) {
  const t=tiles.find(x=>x.label===l);
  ck(`${l} is N/A with a stated reason`, /N\/A/.test(t?.value||"") && !!t?.reason, `${t?.value} reason=${!!t?.reason}`);
  ck(`${l} draws no misleading spark`, !t?.spark);
}
ck("no page errors", errs.length===0, errs.slice(0,2).join(" | "));
console.log(`\n${fail?"FAILED":"OK"} — ${pass} passed, ${fail} failed`);
await b.close(); s.close(); process.exit(fail?1:0);
