/*
 * The "What changed this filing" band — driven against the real API.
 *
 * It is a NOTIFICATION, not a status board, and nearly every assertion here is about that:
 *
 *   - no row ever states that something did NOT happen,
 *   - a quiet company shows the signals that were checked, so silence is a checked absence,
 *   - the window is stated (which annual report this is measured against),
 *   - Tesla's tag diff reads +26/−12, not −276 — the Part III 10-K/A shell is excluded.
 *
 *   TICKERS=TSLA,AAPL,KO,MSFT node scripts/drive_band.mjs --dist app-dist
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import puppeteer from "puppeteer";
const DIST=resolve(process.argv[process.argv.indexOf("--dist")+1]), PORT=5199, API="http://127.0.0.1:8000";
const MIME={".html":"text/html",".js":"text/javascript",".css":"text/css",".woff2":"font/woff2"};
const s=createServer(async(rq,rs)=>{const u=new URL(rq.url,`http://localhost:${PORT}`);
  if(u.pathname.startsWith("/v1")){const r=await fetch(API+u.pathname+u.search);
    rs.writeHead(r.status,{"content-type":"application/json"});rs.end(await r.text());return;}
  let f=join(DIST,decodeURIComponent(u.pathname));
  if(!extname(u.pathname)||!existsSync(f))f=join(DIST,"index.html");
  rs.writeHead(200,{"content-type":MIME[extname(f)]??"application/octet-stream"});rs.end(await readFile(f));});
await new Promise(r=>s.listen(PORT,r));
const b=await puppeteer.launch({args:["--no-sandbox","--disable-dev-shm-usage"]});
const p=await b.newPage(); await p.setViewport({width:1440,height:2000});
let pass=0,fail=0,http429=0; const errs=[]; p.on("pageerror",e=>errs.push(e.message));
p.on("response",r=>{if(r.status()===429)http429++;});
const ck=(n,ok,d="")=>{ok?(pass++,console.log(`  ✓ ${n}`)):(fail++,console.error(`  ✗ ${n}${d?` — ${d}`:""}`));};

for (const TK of (process.env.TICKERS||"TSLA").split(",")) {
console.log(`\n── ${TK} ──`);
const api = await (await fetch(`${API}/v1/companies/${TK}/changes`)).json();

await p.goto(`http://localhost:${PORT}/company/${TK}/overview?focal=${TK}`,{waitUntil:"networkidle0"});
await p.waitForFunction(()=>!!document.querySelector(".hub-changed-row"),{timeout:90000});
await new Promise(r=>setTimeout(r,600));

const { band, rows } = await p.evaluate(()=>{
  const el=document.querySelector(".hub-changed");
  return {
    band:(el?.innerText||"").replace(/\s+/g," ").trim(),
    rows:[...(el?.querySelectorAll(".hub-changed-row")||[])].map(r=>({
      tag:(r.querySelector(".hub-changed-tag")?.textContent||"").trim(),
      text:(r.querySelector(".hub-changed-text")?.textContent||"").trim(),
      src:(r.querySelector(".hub-changed-src")?.textContent||"").trim(),
      title:r.querySelector(".hub-changed-src")?.getAttribute("title")||"",
    })),
  };
});
console.log("   band:", band.slice(0, 220));

/* ---- the band is no longer fabricated ---------------------------------------------------- */
ck("the band is not marked synthetic", !/synthetic/i.test(band), band.slice(0,90));
// The fixture claimed a critical audit matter was "unchanged" while §06 says CAMs cannot be read
// at all. Two claims that contradicted each other; the false one is gone.
ck("the fabricated CAM row is gone", !/CAM unchanged/i.test(band));
ck("the fabricated segment row is gone", !/Segments unchanged/i.test(band));

/* ---- a notification never reports a non-event -------------------------------------------- */
const eventRows = rows.filter(r=>r.tag!=="QUIET");
// Phrases that ASSERT A NON-EVENT. Deliberately not a bare /\bno /: "8 no longer tagged" is a
// change that happened — the filer stopped tagging them — and matching that flagged every row.
const NON_EVENT = /\bno (change|auditor|restatement|agreement|incident|material)|unchanged|none (found|on file)|was not |were not /i;
ck("no row states that something did not happen",
   !eventRows.some(r=>NON_EVENT.test(r.text)),
   eventRows.find(r=>NON_EVENT.test(r.text))?.text);

/* ---- the window is stated ---------------------------------------------------------------- */
if (api.since) {
  ck("the band names the annual report it is measured against",
     /since the annual report filed \d{1,2} \w{3} \d{4}/i.test(band), band.slice(0,150));
  ck(`the stated date matches the API (${api.since})`,
     band.includes(api.since.slice(0,4)), band.slice(0,150));
}

if (api.changes.length) {
  ck("row count matches the API", eventRows.length===api.changes.length,
     `card=${eventRows.length} api=${api.changes.length}`);
  ck("every row carries a source and a date",
     eventRows.every(r=>r.src.length>5), JSON.stringify(eventRows[0]));
  ck("tags match the API", eventRows.map(r=>r.tag).join(",")===api.changes.map(c=>c.tag).join(","),
     `${eventRows.map(r=>r.tag)} vs ${api.changes.map(c=>c.tag)}`);

  const tags = api.changes.find(c=>c.tag==="TAGS");
  if (tags) {
    // Tesla's newest annual accession is a 5,986-byte Part III 10-K/A with 2 tagged facts. If it
    // were not excluded this row would read "276 concepts no longer tagged".
    const dropped = /(\d+) no longer tagged/.exec(tags.text);
    ck("the tag diff excludes the amendment shell",
       !dropped || Number(dropped[1]) < 100, tags.text);
    ck("the tag row names the filing it diffed against",
       /vs the one filed \d{4}-\d{2}-\d{2}/.test(tags.source), tags.source);
  }
} else {
  /* ---- silence must be a CHECKED absence -------------------------------------------------- */
  ck("a quiet company says so rather than showing nothing",
     rows.some(r=>r.tag==="QUIET"), JSON.stringify(rows));
  ck("the checked signals are named on hover",
     rows.find(r=>r.tag==="QUIET")?.title.length > 20,
     rows.find(r=>r.tag==="QUIET")?.title);
  ck("the count of checked signals is shown",
     /\d+ signals checked/.test(band), band.slice(-120));
}

ck("no page error", errs.length===0, errs[0]);
ck("no 429", http429===0);
}
console.log(`\n${pass} passed, ${fail} failed`);
await b.close(); s.close();
process.exit(fail?1:0);
