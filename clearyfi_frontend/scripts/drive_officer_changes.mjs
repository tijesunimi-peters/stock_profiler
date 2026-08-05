/*
 * §05.1 officer & director changes — driven against the real API.
 *
 * The card is built from two half-answers, and almost everything asserted here is about not
 * letting them read as a whole one:
 *
 *   - no action verb anywhere, because EDGAR's item code has no sub-item letter,
 *   - a Form 3 and an Item 5.02 filed the same day stay two rows (AAPL, 2026-01-02),
 *   - "arrivals" must not read as "changes" — nothing is filed on departure,
 *   - a 10% owner crossing a threshold is excluded, and the count says so (KO drops 3),
 *   - an unindexed company is a different absence from an indexed one with nothing in it.
 *
 *   TICKERS=AAPL,NVDA,KO,DSGX node scripts/drive_officer_changes.mjs --dist app-dist
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import puppeteer from "puppeteer";
const DIST=resolve(process.argv[process.argv.indexOf("--dist")+1]), PORT=5193, API="http://127.0.0.1:8000";
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
const api = await (await fetch(`${API}/v1/companies/${TK}/officer-changes`)).json();

await p.goto(`http://localhost:${PORT}/company/${TK}/overview?focal=${TK}`,{waitUntil:"networkidle0"});
await p.waitForFunction((tk)=>{
  const r=document.querySelector(".alt-content");
  if(!r||!r.childElementCount||r.querySelector(".state-loading")) return false;
  if(!document.body.innerText.includes(tk)) return false;
  return [...document.querySelectorAll(".p-card")].some(e=>/Officer & director changes/i.test(e.textContent||""));
}, {timeout:60000}, TK);
await new Promise(r=>setTimeout(r,600));

const pick = async () => p.$$eval(".p-card", (els)=>{
  const hit = els.find(e=>/Officer & director changes/i.test(e.querySelector(".hub-label")?.textContent||""));
  return {
    text: (hit?.innerText||"").replace(/\s+/g," ").trim(),
    rows: [...(hit?.querySelectorAll(".hub-tri-row")||[])].map(r=>({
      text:(r.innerText||"").replace(/\s+/g," ").trim(),
      who:(r.querySelector(".hub-cell")?.textContent||"").trim(),
      title:r.querySelector(".hub-cell")?.getAttribute("title")||"",
    })),
  };
});
const { text: card, rows } = await pick();
console.log("   card:", card.slice(0, 300));

/* ---- the card is no longer fabricated ---------------------------------------------------- */
ck("the card is not marked synthetic", !/synthetic/i.test(card), card.slice(0,80));

/* ---- no action verb, from any source ----------------------------------------------------- */
// EDGAR serves "5.02" with no sub-item letter, so departure vs appointment is unknowable from
// the index. Any verb on a row would be invention.
ck("no row claims an action verb",
   !rows.some(r=>/\b(appointed|resigned|retired|elected|transitioned|departed)\b/i.test(r.text)),
   rows.find(r=>/appointed|resigned|retired/i.test(r.text))?.text);
ck("the note says the item code does not identify the change",
   /does not say which/i.test(card), card.slice(-260));

/* ---- arrivals are not changes ------------------------------------------------------------ */
ck("the card says nothing is filed on departure", /nothing is filed on departure/i.test(card));
ck("the fixture's invented roles are gone",
   !/transitioned to advisor|elected to board/i.test(card));

if (api.status === "ok") {
  /* ---- rows match what the API returned -------------------------------------------------- */
  ck("row count matches the API", rows.length === api.changes.length,
     `card=${rows.length} api=${api.changes.length}`);
  const firstArrival = api.changes.find(c=>c.kind==="arrival");
  if (firstArrival) {
    ck("an arrival names the person", rows.some(r=>r.who===firstArrival.person),
       `${firstArrival.person} vs ${rows.map(r=>r.who).join("|")}`);
    ck("an arrival names Form 3 as its source",
       rows.some(r=>r.text.includes("Form 3")), rows[0]?.text);
  }
  if (api.changes.some(c=>c.kind==="event")) {
    ck("an event names Item 5.02", /8-K Item 5\.02/.test(card));
    ck("an event carries no invented person",
       rows.filter(r=>/Item 5\.02/.test(r.text)).every(r=>r.who==="—"),
       rows.find(r=>/Item 5\.02/.test(r.text))?.who);
    ck("the em-dash explains itself on hover",
       rows.filter(r=>r.who==="—").every(r=>/8-K's text|8-K.s text/i.test(r.title)),
       rows.find(r=>r.who==="—")?.title);
  }

  /* ---- same-day rows are not merged ------------------------------------------------------ */
  const byDate = {};
  for (const c of api.changes) (byDate[c.date] ||= []).push(c.kind);
  const collision = Object.entries(byDate).find(([, k]) => k.length > 1);
  if (collision) {
    const [date] = collision;
    ck(`a Form 3 and an Item 5.02 on ${date} stay two rows`,
       rows.filter(r=>r.text.includes(date)).length === collision[1].length,
       `${rows.filter(r=>r.text.includes(date)).length} of ${collision[1].length}`);
  }

  /* ---- coverage and the exclusion -------------------------------------------------------- */
  ck("the coverage line names the indexed window",
     /covering \d{4}/.test(card), card.slice(-300));
  if (api.arrivals_excluded) {
    ck("excluded Form 3 filers are named, not silently dropped",
       /10% owner|“other” filer|"other" filer/i.test(card), card.slice(-300));
    ck("the excluded count matches the API",
       new RegExp(`${api.arrivals_excluded} further Form 3 filer`).test(card),
       `api=${api.arrivals_excluded}`);
  }
} else {
  /* ---- the two absences must not read alike ---------------------------------------------- */
  ck("an empty card explains itself", card.length > 60, card.slice(0,140));
  ck(api.index_built
       ? "an indexed company with nothing reports a finding"
       : "an unindexed company says the event half was not looked at",
     api.index_built
       ? /among the filings read/i.test(card)
       : /has not been built|not been looked at/i.test(card),
     card.slice(0,220));
}

ck("no page error", errs.length===0, errs[0]);
ck("no 429", http429===0);
}
console.log(`\n${pass} passed, ${fail} failed`);
await b.close(); s.close();
process.exit(fail?1:0);
