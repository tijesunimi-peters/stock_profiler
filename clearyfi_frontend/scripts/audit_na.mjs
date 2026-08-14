/*
 * Harvest EVERY "N/A" on the company overview, with the card it sits in and the reason it gives.
 *
 * A false N/A -- one where the data exists and our plumbing misses it -- looks identical on screen
 * to a true one. This dumps them so each can be checked against the store independently.
 *
 * Note an N/A renders as `<span class="chip"><span class="glyph">∅</span>N/A</span>`, so it HAS a
 * child element, and its own `title` is the design system's generic status description. Our reason
 * lives on an ANCESTOR (the `Fig` wrapper), which is what the first version of this script missed.
 *
 *   TICKERS=AAPL,MSFT,JPM node scripts/audit_na.mjs --dist app-dist
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import puppeteer from "puppeteer";
const DIST=resolve(process.argv[process.argv.indexOf("--dist")+1]), PORT=5202, API="http://127.0.0.1:8000";
const MIME={".html":"text/html",".js":"text/javascript",".css":"text/css",".woff2":"font/woff2"};
const s=createServer(async(rq,rs)=>{const u=new URL(rq.url,`http://localhost:${PORT}`);
  if(u.pathname.startsWith("/v1")){const r=await fetch(API+u.pathname+u.search);
    rs.writeHead(r.status,{"content-type":"application/json"});rs.end(await r.text());return;}
  let f=join(DIST,decodeURIComponent(u.pathname));
  if(!extname(u.pathname)||!existsSync(f))f=join(DIST,"index.html");
  rs.writeHead(200,{"content-type":MIME[extname(f)]??"application/octet-stream"});rs.end(await readFile(f));});
await new Promise(r=>s.listen(PORT,r));
const b=await puppeteer.launch({args:["--no-sandbox","--disable-dev-shm-usage"]});
const p=await b.newPage(); await p.setViewport({width:1440,height:3000});
const errs=[]; p.on("pageerror",e=>errs.push(e.message));

for (const TK of (process.env.TICKERS||"AAPL").split(",")) {
await p.goto(`http://localhost:${PORT}/company/${TK}/overview?focal=${TK}`,{waitUntil:"networkidle0"});
await p.waitForFunction(()=>!!document.querySelector("#s8"),{timeout:120000});
await new Promise(r=>setTimeout(r,1200));

const found = await p.evaluate(()=>{
  const CHIP_TITLES = new Set();
  const out=[];
  const sectionOf = (el)=>{
    const sec=el.closest(".hub-sec");
    const h=sec?.querySelector(".hub-head-title, .hub-head h2, h2");
    return (h?.textContent||sec?.querySelector(".hub-head")?.textContent||"").trim().slice(0,40);
  };
  const cardOf = (el)=>{
    const card=el.closest(".p-card, .hub-changed");
    return (card?.querySelector(".hub-label, .hub-panel-title, .hub-changed-title")?.textContent||"").trim();
  };
  // The label an N/A is the value OF: the tile's hint, the row's first cell, or a table header.
  const labelOf = (el)=>{
    const tile=el.closest(".hub-quad > div, .hub-kv-row, .hub-tri-row, .hub-seg-grid, .hub-comp-row, .hub-geo-row, .hub-firm, .hub-facts");
    if (tile) {
      const hint=tile.querySelector(".hub-hint, .hub-cell, .hub-seg-name, .hub-comp-head .hub-cell");
      const t=(hint?.textContent||"").trim();
      if (t && !/N\/A/.test(t)) return t.slice(0,60);
    }
    let n=el;
    for (let i=0;i<5 && n;i++){
      n=n.previousElementSibling;
      const t=(n?.textContent||"").trim();
      if (t && t.length<70 && !/N\/A/.test(t)) return t.split("\n")[0];
    }
    return (el.parentElement?.textContent||"").replace(/\s+/g," ").trim().slice(0,60);
  };
  // Our reason: the nearest ancestor title that is NOT the chip's own generic description.
  const reasonOf = (el)=>{
    let n=el.parentElement;
    for (let i=0;i<5 && n;i++){
      const t=n.getAttribute?.("title");
      if (t && !CHIP_TITLES.has(t)) return t;
      n=n.parentElement;
    }
    return "";
  };

  const chips=[...document.querySelectorAll(".chip")].filter(c=>/N\/A|N\/M/.test(c.textContent||""));
  for (const c of chips) { const t=c.getAttribute("title"); if (t) CHIP_TITLES.add(t); }

  for (const c of chips) {
    out.push({kind:"chip", sec:sectionOf(c), card:cardOf(c), label:labelOf(c), reason:reasonOf(c)});
  }
  // Bare-text N/A (not every one goes through the chip).
  for (const el of document.querySelectorAll("span,div,td")) {
    if (el.children.length) continue;
    if (!/^(N\/A|N\/M|shares N\/A|date N\/A)$/.test((el.textContent||"").trim())) continue;
    out.push({kind:"text", sec:sectionOf(el), card:cardOf(el), label:labelOf(el), reason:reasonOf(el)});
  }
  // Prose empty states.
  for (const el of document.querySelectorAll(".hub-note, .hub-foot-rule")) {
    const t=(el.textContent||"").replace(/\s+/g," ").trim();
    if (!/^(No |Not |None |This filer tags|Nothing )/.test(t)) continue;
    out.push({kind:"empty", sec:sectionOf(el), card:cardOf(el), label:"(empty state)", reason:t.slice(0,180)});
  }
  return out;
});

const seen=new Set();
const uniq=found.filter(f=>{const k=`${f.card}|${f.label}|${f.kind}`; if(seen.has(k))return false; seen.add(k); return true;});
console.log(`\n######## ${TK} — ${found.length} N/A values, ${uniq.length} distinct slots`);
for (const f of uniq) {
  console.log(`  [${f.kind}] ${f.card||"?"} :: ${f.label||"?"}`);
  if (f.reason) console.log(`         ${f.reason.slice(0,160)}`);
}
}
if (errs.length) console.log("\nPAGE ERRORS:", errs);
await b.close(); s.close();
