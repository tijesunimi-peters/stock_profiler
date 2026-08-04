/*
 * §07 obligations & contingencies — driven against the real API.
 *
 * §07 is the thinnest section on the page (20–26% of filers tag anything), so most of what is
 * asserted here is about how it behaves when EMPTY, and about the two distinctions that would be
 * easy to lose: a reported zero is not an absence, and a letter of credit is not a guarantee.
 *
 *   TICKERS=AMD,HWM,AAPL,WMT,NVDA node scripts/drive_obligations.mjs --dist app-dist
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import puppeteer from "puppeteer";
const DIST=resolve(process.argv[process.argv.indexOf("--dist")+1]), PORT=5189, API="http://127.0.0.1:8000";
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

for (const TK of (process.env.TICKERS||"AMD").split(",")) {
console.log(`\n── ${TK} ──`);
await p.goto(`http://localhost:${PORT}/company/${TK}/overview?focal=${TK}`,{waitUntil:"networkidle0"});
await p.waitForFunction((tk)=>{
  const r=document.querySelector(".alt-content");
  if(!r||!r.childElementCount||r.querySelector(".state-loading")) return false;
  if(!document.body.innerText.includes(tk)) return false;
  return [...document.querySelectorAll(".p-card")].some(e=>/Purchase & capacity commitments/i.test(e.textContent||""));
}, {timeout:40000}, TK);
await new Promise(r=>setTimeout(r,600));

const card = async (src) => p.$$eval(".p-card", (els, re)=>{
  const rx = new RegExp(re, "i");
  const hit = els.find(e=>rx.test((e.querySelector(".hub-label, .hub-panel-title")?.textContent||"")));
  return hit ? (hit.textContent||"").replace(/\s+/g," ").trim() : "";
}, src);

const legal  = await card("Legal proceedings");
const commit = await card("Purchase & capacity commitments");
const restr  = await card("Restructuring & other obligations");
const all = await p.evaluate(()=>document.body.innerText.replace(/\s+/g," "));
console.log("   commit:", commit.slice(0, 150));
console.log("   restr :", restr.slice(0, 150));

/* ---- the ruling: 07.1 is marked, not rebuilt ------------------------------------------- */
ck("the legal table is marked synthetic", /synthetic/i.test(legal));
ck("the marker explains that Item 3 is narrative",
   await p.$$eval(".p-card", els=>{
     const c = els.find(e=>/Legal proceedings/i.test(e.querySelector(".hub-panel-title")?.textContent||""));
     return /narrative/i.test(c?.querySelector(".hub-synth-card")?.getAttribute("title")||"");
   }));
ck("nothing claims an absent accrual means zero exposure", !/exposure is zero\./i.test(all) || /never means the exposure is zero|not that the exposure is zero/i.test(all));

/* ---- reported zero vs absence ----------------------------------------------------------- */
// AMD tags PurchaseObligationDueAfterFifthYear and RestructuringCharges as exactly 0. Those are
// disclosures. Rendering them as N/A would discard a filing's answer; the inverse rule (never
// show a missing value as 0) is the one this product is built on, and both directions matter.
if (TK === "AMD") {
  ck("a reported zero renders as $0, not N/A", /Thereafter\s*\$?0/.test(commit.replace(/\s+/g,"")) || /\$0/.test(commit), commit.slice(0,140));
  ck("the ladder is shown and reconciles to the total", /sum to the total/i.test(commit), commit.slice(-90));
}

/* ---- the instrument distinction --------------------------------------------------------- */
ck("letters of credit are named, not folded into guarantees", /Letters of credit outstanding/i.test(restr));
ck("the off-balance-sheet slot no longer says 'Off-balance-sheet:'", !/Off-balance-sheet:/i.test(all));

/* ---- empty states ----------------------------------------------------------------------- */
const commitEmpty = /Total\s*∅?\s*N\/A/.test(commit) || /Total N\/A/.test(commit);
ck("an empty commitments card explains itself with coverage",
   !commitEmpty || /tag(ged)?|untagged, not uncommitted|filers/i.test(commit), commit.slice(0,140));
ck("an empty restructuring card says absence here can mean no restructuring",
   /Charge to date/i.test(restr) || /not restructuring/i.test(restr), restr.slice(0,140));
// The fixture's four invented quad tiles must not survive on a filer with no restructuring.
ck("no invented restructuring quad on a filer with none",
   /Charge to date/i.test(restr) === /Accrual remaining/i.test(restr));

ck("no page error", errs.length===0, errs[0]);
ck("no 429", http429===0);
}
console.log(`\n${pass} passed, ${fail} failed`);
await b.close(); s.close();
process.exit(fail?1:0);
