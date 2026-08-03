import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import puppeteer from "puppeteer";
const DIST=resolve(process.argv[process.argv.indexOf("--dist")+1]), PORT=5184, API="http://127.0.0.1:8000";
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
// Wait for THIS ticker's page, not merely for "a settled page".
//
// Navigating the same tab, the previous ticker's DOM is still mounted and satisfies any generic
// "content present, not loading" predicate — so the run reads the last company's cards and
// reports them against this one. That produced five spurious failures for MSFT in a four-ticker
// sweep while MSFT passed twice in isolation. Anchoring on the footnote divider, which only
// exists once the footnotes read resolves, ties the wait to the data under test.
await p.waitForFunction((tk)=>{
  const r=document.querySelector(".alt-content");
  if(!r||!r.childElementCount||r.querySelector(".state-loading")) return false;
  if(!document.body.innerText.includes(tk)) return false;
  return [...document.querySelectorAll(".hub-divider")].some(d=>/Footnote detail/i.test(d.textContent||""));
}, {timeout:30000}, TK);
await new Promise(r=>setTimeout(r,700));
p.on("request",r=>{const u=r.url();if(u.includes("/v1/"))console.log("   → "+u.replace(/^.*\/v1/,"/v1"));});
await p.waitForFunction(()=>{const r=document.querySelector(".alt-content");
  return !!r&&r.childElementCount>0&&!r.querySelector(".state-loading");},{timeout:25000});
await new Promise(r=>setTimeout(r,700));
const cards = await p.$$eval(".p-card", els=>els.map(e=>({
  title: (e.querySelector(".hub-label, .hub-panel-title")?.textContent||"").trim().slice(0,42),
  text: (e.textContent||"").replace(/\s+/g," ").trim().slice(0,150),
})));
cards.filter(c=>/matur|tax rate recon|Goodwill by|compensation by line/i.test(c.text)).forEach(c=>console.log(`   ${c.title.padEnd(38)} ${c.text.slice(c.title.length,105)}`));
const all = await p.evaluate(()=>document.body.innerText.replace(/\s+/g," "));
ck("footnotes resolve to the ANNUAL period, not the page's quarter", /Footnote detail[\s\S]{0,120}FY20\d\d/i.test(all));
// NOT "every filer has a ladder" — JPM genuinely does not tag one, and banks disclose long-term
// debt differently. The rule is that the card either shows maturities or explains the absence.
const ladder = /Debt maturity ladder[\s\S]{0,200}\$\d/i.test(all)
  || /Debt maturity ladder[\s\S]{0,160}did not disclose/i.test(all);
ck("debt ladder shows maturities OR explains their absence", ladder);
ck("tax reconciliation resolves", /Effective tax rate reconciliation[\s\S]{0,300}%/i.test(all));
ck("an undisclosed group explains itself with coverage", /% of filers publish it/.test(all));
ck("ASC 606 split says it is dimensional, not invented", /dimensional/i.test(all));
// Scoped to the CARD, not the page: NVDA's gross margin really is ~72%, and a bare string
// search for "72%" called that a fabricated revenue split. The claim being tested is that the
// ASC 606 card invents no product/service breakdown — so ask that card, and nothing else.
const invented = await p.$$eval(".p-card", els=>els
  .filter(e=>/revenue disaggregation/i.test(e.textContent||""))
  .flatMap(e=>[...e.querySelectorAll(".hub-comp-row")].map(r=>(r.textContent||"").trim())));
ck("the ASC 606 card invents no product split", invented.length===0, invented.join(" | ").slice(0,80));
// A "$0" is only honest when a filer REPORTED zero — Microsoft really does tag $0 maturing in
// year two, and rewriting that to N/A would hide a disclosure. Nor can a card be barred from
// showing figures merely because it CONTAINS an absence note: the ASC 606 card legitimately
// pairs "no product split (dimensional)" with a real RPO total. The rule that actually matters
// is narrower — a group the FILER did not disclose must contribute no figures of its own.
const zero = await p.$$eval(".p-card", els=>els
  .filter(e=>/did not disclose/i.test(e.textContent||""))
  .flatMap(e=>[...e.querySelectorAll(".hub-ladder-row, .hub-tri-row")]
    .flatMap(r=>[...r.querySelectorAll(".hub-cell-mono")].map(n=>n.textContent.trim())))
  .filter(t=>/^[-+]?\$?\d/.test(t)));
ck("an undisclosed card shows no figures at all", zero.length===0, zero.join(","));
// The defect this guards: with its rows empty, the goodwill card rendered ONLY its leases
// footer — a real $12.5B under a heading about goodwill. Every card must either show its own
// subject or say why it cannot.
const mislabeled = await p.$$eval(".p-card", els=>els
  .filter(e=>/goodwill by reporting unit|stock compensation by line/i.test(e.textContent||""))
  .filter(e=>!e.querySelector(".hub-tri-row, .hub-comp-row") && !e.querySelector(".hub-note, .hub-foot-rule"))
  .map(e=>(e.textContent||"").slice(0,60)));
ck("no card shows figures under a heading it cannot answer", mislabeled.length===0, mislabeled.join(" | "));
const explained = await p.$$eval(".p-card", els=>els
  .filter(e=>/goodwill by reporting unit|stock compensation by line/i.test(e.textContent||""))
  .filter(e=>!/do not ingest yet|did not disclose/i.test(e.textContent||"")).length);
ck("both dimensional cards explain their emptiness", explained===0, `${explained} silent`);
// The stale-copy defect: this sentence stopped being true when EX-21 parsing landed.
ck("no card claims we refuse to parse documents", !/rather than parsing documents/i.test(all));
ck("no page errors", errs.length===0, errs.slice(0,2).join(" | "));
ck("no request was rate-limited", !http429, `${http429} responses were 429`);
}
console.log(`\n${fail?"FAILED":"OK"} — ${pass} passed, ${fail} failed`);
await b.close(); s.close(); process.exit(fail?1:0);
