/*
 * §06 accounting quality & audit — driven against the real API.
 *
 * The assertions here are about what the section REFUSES to say as much as what it shows:
 * no invented CAM, no invented estimate, no "ICFR effective", no tenure, and no absence
 * claimed without the window it was checked over.
 *
 *   TICKERS=AAPL,NVDA,JPM,AAME node scripts/drive_audit.mjs --dist app-dist
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
const p=await b.newPage(); await p.setViewport({width:1440,height:2400});
let pass=0,fail=0,http429=0; const errs=[]; p.on("pageerror",e=>errs.push(e.message));
p.on("response",r=>{if(r.status()===429)http429++;});
const ck=(n,ok,d="")=>{ok?(pass++,console.log(`  ✓ ${n}`)):(fail++,console.error(`  ✗ ${n}${d?` — ${d}`:""}`));};

for (const TK of (process.env.TICKERS||"AAPL").split(",")) {
console.log(`\n── ${TK} ──`);
await p.goto(`http://localhost:${PORT}/company/${TK}/overview?focal=${TK}`,{waitUntil:"networkidle0"});
// Anchor on THIS ticker's §06, not on "a settled page": navigating the same tab leaves the
// previous company's DOM mounted, and a generic predicate reads it as this one's.
await p.waitForFunction((tk)=>{
  const r=document.querySelector(".alt-content");
  if(!r||!r.childElementCount||r.querySelector(".state-loading")) return false;
  if(!document.body.innerText.includes(tk)) return false;
  return [...document.querySelectorAll(".p-card")].some(e=>/Company extension tags/i.test(e.textContent||""));
}, {timeout:40000}, TK);
await new Promise(r=>setTimeout(r,600));

const card = async (re) => p.$$eval(".p-card", (els, src)=>{
  const rx = new RegExp(src, "i");
  const hit = els.find(e=>rx.test((e.querySelector(".hub-label, .hub-panel-title")?.textContent||"")));
  return hit ? (hit.textContent||"").replace(/\s+/g," ").trim() : "";
}, re);

const auditor = await card("^Auditor$");
const cams = await card("Critical audit matters");
const ext = await card("Company extension tags");
const est = await card("Critical accounting estimates");
const all = await p.evaluate(()=>document.body.innerText.replace(/\s+/g," "));
console.log("   auditor:", auditor.slice(0, 190));
console.log("   ext    :", ext.slice(0, 130));

/* ---- what it shows -------------------------------------------------------------------- */
// A real audit firm, not the fixture's "Big Four A".
ck("the auditor is a named firm, not a placeholder", /LLP|LLC|L\.L\.P\.|PLLC/.test(auditor) || /N\/A/.test(auditor),
   auditor.slice(0,80));
ck("the fixture's 'Big Four A' placeholder is gone", !/Big Four [A-D]/.test(all));
ck("the PCAOB firm id is shown as an id", /PCAOB firm \d+/.test(auditor) || /N\/A/.test(auditor));
// textContent carries no whitespace between a label and its value ("…defined37"), so the
// assertion must not depend on one.
ck("the extension census shows a distinct count and a share", /Distinct tags defined\s*\d+/.test(ext) && /Share of tagged facts\s*[\d.]+%/.test(ext), ext.slice(0,90));

/* ---- what it refuses to say ----------------------------------------------------------- */
// The single most dangerous substitution available in this section: the attestation flag is not
// the Item 9A conclusion, and no wording may imply that it is.
ck("never claims ICFR was effective", !/ICFR effective/i.test(all));
ck("never claims a material weakness was or was not found", !/material weakness/i.test(all));
ck("says the ICFR conclusion is narrative", /effectiveness conclusion is narrative|effectiveness is narrative/i.test(auditor));
// Tenure is in PCAOB Form AP, not in any SEC filing. "since FY1997" was the fixture.
ck("no auditor tenure is claimed", !/\bsince FY\d{4}/.test(all));
// Fees are not tagged in the DEF 14A. The fixture invented both a dollar figure and a percentage.
ck("audit fees read N/A, not an invented dollar figure", /Fees\s*(N\/A|—|–)/.test(auditor) || /Fees[\s\S]{0,20}N\/A/.test(auditor), auditor.slice(0,120));
ck("the non-audit share is N/A", /non-audit share N\/A/i.test(auditor));
// Both of these cards were fixtures full of plausible, entirely invented content.
ck("critical audit matters is an honest empty state", /narrative|not tagged|no structured source|Nothing about them/i.test(cams) && !/significant management judgment and subjective/i.test(cams));
ck("critical accounting estimates is an honest empty state", /narrative|not tagged|Nothing about them/i.test(est));
ck("the extension card denies being a non-GAAP count", /Not a non-GAAP adjustment count/i.test(ext));
ck("the 'Non-GAAP adjustments' title is gone", !/Non-GAAP adjustments/i.test(all));

/* ---- the window an absence was checked over -------------------------------------------- */
const absence = /No (auditor change|non-reliance restatement|Form 12b-25) in filings indexed/.test(auditor);
ck("an absence names the window it was checked over",
   !absence || /filings indexed \d{4}(–\d{4})?/.test(auditor), auditor.slice(0,140));
ck("the window note states the filing count and the rolling-window caveat",
   /rolling window, not the company's whole history/i.test(auditor));
// innerText applies `text-transform`, so the §01 row label reads "INDEPENDENT AUDITOR" on the
// page and a case-sensitive match here silently fails while the row is correctly filled.
ck("§01's auditor row is filled from the same read",
   /Independent auditor\s*([\w&.,' -]{2,50}(LLP|LLC|PLLC)|N\/A)/i.test(all), all.match(/Independent auditor[^A-Z]{0,40}./i)?.[0]);

ck("no page error", errs.length===0, errs[0]);
ck("no 429", http429===0);

// The synthetic band above the fold claims a CAM is "unchanged" while §06 reports CAMs cannot
// be read. Contradictory claims on one page: the false one must carry its marker.
ck("the fabricated 'what changed' band is marked synthetic",
   await p.$eval(".hub-changed-head", e=>/synthetic/i.test(e.textContent||"")));
}
console.log(`\n${pass} passed, ${fail} failed`);
await b.close(); s.close();
process.exit(fail?1:0);
