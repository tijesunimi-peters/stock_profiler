/**
 * Asserts the ONE derivation the adapter is allowed to make.
 *
 * Free cash flow is not a filed line. The operator's general rule is that the adapter never
 * computes — a figure worked out client-side arrives without the status the API attaches to
 * reported values — and this row is the sanctioned exception, because the design marks it derived
 * and the ƒ drawer carries the formula and its caveats.
 *
 * An exception needs a guard, and this is it: the rendered figure must equal CFO minus capex, on
 * real numbers, in the browser. Pinned to Apple's Q1 columns deliberately — an assertion that only
 * checks "a dollar sign is present" would pass on a fixture, and would pass on a sign error too.
 * Getting the sign wrong is the specific danger: filers report capex either as a positive payment
 * or a negative outflow, and a naive subtraction is wrong by twice capex for the second group
 * while still looking entirely plausible.
 *
 * Needs `--network host` and a running API (`docker compose up -d api`).
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import puppeteer from "puppeteer";
const DIST=resolve(process.argv[process.argv.indexOf("--dist")+1]), PORT=5186, API="http://127.0.0.1:8000";
const MIME={".html":"text/html",".js":"text/javascript",".css":"text/css",".woff2":"font/woff2"};
const s=createServer(async(rq,rs)=>{const u=new URL(rq.url,`http://localhost:${PORT}`);
  if(u.pathname.startsWith("/v1")){const r=await fetch(API+u.pathname+u.search);
    rs.writeHead(r.status,{"content-type":"application/json"});rs.end(await r.text());return;}
  let f=join(DIST,decodeURIComponent(u.pathname));
  if(!extname(u.pathname)||!existsSync(f))f=join(DIST,"index.html");
  rs.writeHead(200,{"content-type":MIME[extname(f)]??"application/octet-stream"});rs.end(await readFile(f));});
await new Promise(r=>s.listen(PORT,r));
const b=await puppeteer.launch({args:["--no-sandbox","--disable-dev-shm-usage"]});
const p=await b.newPage(); await p.setViewport({width:1440,height:1200});
let pass=0,fail=0;
const ck=(n,ok,d="")=>{ok?(pass++,console.log(`  ✓ ${n}`)):(fail++,console.error(`  ✗ ${n}${d?` — ${d}`:""}`));};
await p.goto(`http://localhost:${PORT}/company/AAPL/overview?focal=AAPL`,{waitUntil:"networkidle0"});
await p.waitForFunction(()=>{const r=document.querySelector(".alt-content");
  return !!r&&r.childElementCount>0&&!r.querySelector(".state-loading");},{timeout:20000});
// switch to the Cash flow tab
const tabs = await p.$$(".hub-tabs .hub-tab");
await tabs[2].click(); await new Promise(r=>setTimeout(r,400));
const rows = await p.$$eval(".hub-stmt-grid.hub-row", els=>els.map(e=>({
  label: e.querySelector(".hub-cell")?.textContent?.replace(/\+ compare|− in tray/g,"").trim(),
  derived: !!e.querySelector(".hub-derived"),
  vals: [...e.querySelectorAll(".hub-cell-mono")].map(x=>x.textContent.trim()),
})));
const fcf = rows.find(r=>/Free cash flow/.test(r.label||""));
const cfo = rows.find(r=>/Cash from operations/.test(r.label||""));
const capex = rows.find(r=>/Capital expenditures/.test(r.label||""));
console.log("  CFO   ", cfo?.vals);
console.log("  capex ", capex?.vals);
console.log("  FCF   ", fcf?.vals);
ck("FCF row is present and marked derived", !!fcf && fcf.derived);
ck("FCF is a number, not N/A", fcf?.vals?.every(v=>/\$/.test(v)), (fcf?.vals||[]).join(" "));
// arithmetic: Q1 FY26 -> 53,925 - 2,373 = 51,552 -> $51.6B
ck("FCF equals CFO minus capex for Q1 FY26", fcf?.vals?.[3] === "$51.6B", fcf?.vals?.[3]);
ck("FCF equals CFO minus capex for Q1 FY23", fcf?.vals?.[0] === "$30.2B", fcf?.vals?.[0]);
console.log(`\n${fail?"FAILED":"OK"} — ${pass} passed, ${fail} failed`);
await b.close(); s.close(); process.exit(fail?1:0);
