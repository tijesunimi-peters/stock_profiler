/*
 * §05.1 officers & directors — driven against the real API.
 *
 * The card lists who the officers and directors ARE and marks only what changed since the
 * previous quarter. Nearly everything asserted here is about the claims the marks must NOT make:
 *
 *   - no action verb anywhere, because EDGAR's Item 5.02 code has no sub-item letter,
 *   - no departure mark, ever — nothing is filed on leaving, and dropping out of the window is
 *     not the same thing,
 *   - a mark is never truncated away by the display cap,
 *   - the comparison date is always stated, because "who changed" means nothing without it,
 *   - an Item 5.02 names nobody, so it is counted rather than pinned to a person or dropped,
 *   - a 10% owner is not an officer.
 *
 *   TICKERS=AAPL,IRIX,RMCF,KO,DSGX node scripts/drive_officer_changes.mjs --dist app-dist
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
const p=await b.newPage(); await p.setViewport({width:1440,height:2600});
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

const { text: card, roster } = await p.$$eval(".p-card", (els)=>{
  const hit = els.find(e=>/Officer & director changes/i.test(e.querySelector(".hub-label")?.textContent||""));
  const roster = [...(hit?.querySelectorAll(".hub-kv-row")||[])].map(el=>({
    who:(el.querySelector(".hub-cell")?.childNodes[0]?.textContent||"").trim(),
    role:(el.querySelector(".hub-cell-mono.is-soft")?.textContent||"").trim(),
    mark:(el.querySelector(".hub-changed-mark")?.textContent||"").trim(),
    markTitle:el.querySelector(".hub-changed-mark")?.getAttribute("title")||"",
  }));
  return { text:(hit?.innerText||"").replace(/\s+/g," ").trim(), roster };
});
console.log("   card:", card.slice(0, 300));

/* ---- the card is no longer fabricated ---------------------------------------------------- */
ck("the card is not marked synthetic", !/synthetic/i.test(card), card.slice(0,80));
ck("the fixture's invented roles are gone",
   !/transitioned to advisor|elected to board/i.test(card));

/* ---- the claims no source supports -------------------------------------------------------- */
// Item 5.02 covers departure, election, appointment AND compensatory arrangement, and EDGAR's
// code says which nowhere. Any verb would be invention.
ck("no roster row claims an action verb",
   !roster.some(r=>/\b(appointed|resigned|retired|elected|promoted|departed)\b/i.test(r.who+r.role+r.mark)),
   roster.find(r=>/appointed|resigned|retired|promoted/i.test(r.who+r.role+r.mark))?.who);
ck("nobody is marked as having left",
   !roster.some(r=>/left|departed|resigned|former|outgoing/i.test(r.mark)),
   roster.find(r=>r.mark)?.mark);
ck("the card states that departures are unfilable",
   /nothing is filed on departure/i.test(card), card.slice(-400));
ck("the card says dropping off the list is not a departure",
   /without being shown as having left/i.test(card), card.slice(-400));

if (api.status === "ok") {
  /* ---- the comparison date is never implied --------------------------------------------- */
  // Only meaningful where there is a roster to mark; an empty card has nothing to compare.
  ck("the comparison date is stated", /since \d{1,2} \w{3} \d{4}/.test(card), card.slice(-500));
  ck(`the stated date matches the API baseline (${api.since})`,
     new RegExp(`since [^.]*${(api.since||"").slice(0,4)}`).test(card), card.slice(-500));

  /* ---- the roster ---------------------------------------------------------------------- */
  ck("the roster renders what the API returned",
     roster.length === api.roster.length, `card=${roster.length} api=${api.roster.length}`);
  ck("every row names a person and a role",
     roster.every(r=>r.who.length>1 && r.role.length>1), JSON.stringify(roster[0]));
  ck("every row names the box the person sits in",
     roster.every(r=>/officer|director/.test(r.role)), roster.find(r=>!/officer|director/.test(r.role))?.role);
  ck("no roster row is a 10% owner alone",
     !roster.some(r=>/^10% owner$/.test(r.role)), roster.find(r=>/^10% owner$/.test(r.role))?.role);
  ck("the roster states the window it rests on",
     /ownership filings? held for this company/.test(card), card.slice(-500));

  /* ---- the marks ----------------------------------------------------------------------- */
  const changed = api.roster.filter(m=>m.change);
  ck("the mark count matches the API",
     roster.filter(r=>r.mark).length === changed.length,
     `card=${roster.filter(r=>r.mark).length} api=${changed.length}`);
  if (changed.length) {
    // A mark hidden by the display cap is worse than a shorter list, so changed people sort first.
    ck("every changed person is visible, not truncated away",
       changed.every(m=>roster.some(r=>r.who===m.person && r.mark)),
       changed.map(m=>m.person).join("|"));
    ck("a mark says which kind of change it was",
       roster.filter(r=>r.mark).every(r=>/^(new|role changed)$/.test(r.mark)),
       roster.find(r=>r.mark)?.mark);
    ck("a mark explains its evidence on hover",
       roster.filter(r=>r.mark).every(r=>/Form 3|role boxes/i.test(r.markTitle)),
       roster.find(r=>r.mark)?.markTitle);
    ck("the change count is stated", new RegExp(`${changed.length} change`).test(card), card.slice(-500));
  } else {
    ck("a company with no change says so rather than showing a bare list",
       /No officer or director change since/i.test(card), card.slice(-500));
  }

  /* ---- Item 5.02 is counted, not attributed and not dropped ----------------------------- */
  if (api.events_since) {
    ck("unattributable Item 5.02 filings are counted",
       new RegExp(`${api.events_since} 8-K Item 5\\.02 filing`).test(card), card.slice(-500));
    ck("they are named as unattributable",
       /cannot attribute to a person/i.test(card), card.slice(-500));
  }
  if (api.roster_total > api.roster.length) {
    ck("a truncated roster says how many more there are",
       new RegExp(`\\+${api.roster_total - api.roster.length} more`).test(card), card.slice(-500));
  }
} else {
  ck("an empty card explains itself instead of showing a bare list",
     roster.length === 0 && card.length > 80, card.slice(0,160));
  ck(api.index_built
       ? "an indexed company with nothing reports a finding"
       : "an unindexed company says the event half was not looked at",
     api.index_built ? /among the filings read/i.test(card) : /has not been built/i.test(card),
     card.slice(0,240));
}

ck("no page error", errs.length===0, errs[0]);
ck("no 429", http429===0);
}
console.log(`\n${pass} passed, ${fail} failed`);
await b.close(); s.close();
process.exit(fail?1:0);
