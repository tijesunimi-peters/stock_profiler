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

// The card holds TWO tri-row lists — the changes, then the roster after the "Current officers
// and directors" rule. They are split on that divider so each is asserted against its own half
// of the payload rather than a combined count.
const pick = async () => p.$$eval(".p-card", (els)=>{
  const hit = els.find(e=>/Officer & director changes/i.test(e.querySelector(".hub-label")?.textContent||""));
  const read = (r)=>({
    text:(r.innerText||"").replace(/\s+/g," ").trim(),
    who:(r.querySelector(".hub-cell")?.textContent||"").trim(),
    mid:(r.querySelector(".hub-cell-mono.is-soft")?.textContent||"").trim(),
    last:(r.querySelector(".ta-r")?.textContent||"").trim(),
    title:r.querySelector(".hub-cell")?.getAttribute("title")||"",
  });
  const rows=[], roster=[]; let afterRule=false;
  for (const el of hit?.children||[]) {
    if (el.classList.contains("hub-foot-rule")) { afterRule=true; continue; }
    if (el.classList.contains("hub-tri-row")) rows.push(read(el));
    else if (afterRule && el.classList.contains("hub-kv-row")) roster.push(read(el));
  }
  return { text:(hit?.innerText||"").replace(/\s+/g," ").trim(), rows, roster };
});
const { text: card, rows, roster } = await pick();
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

  /* ---- role-box transitions -------------------------------------------------------------- */
  const promotions = api.changes.filter(c=>c.kind==="role_change");
  if (promotions.length) {
    ck("a role change shows both sides of the transition",
       rows.some(r=>r.mid.includes("→")), rows.map(r=>r.mid).join(" | ").slice(0,160));
    ck("the role change names the person",
       rows.some(r=>r.who===promotions[0].person), promotions[0].person);
    // A box turning OFF is indistinguishable from a filer omitting it, so it is never reported.
    ck("no reported transition removes a box",
       promotions.every(c => {
         const had = (s)=>({d:/(^|, )director/.test(s||""), o:/(^|, )officer/.test(s||"")});
         const a = had(c.previous_role), b = had(c.role);
         return !((a.d && !b.d) || (a.o && !b.o));
       }), JSON.stringify(promotions[0]));
  }

  /* ---- the roster ------------------------------------------------------------------------ */
  ck("the roster renders what the API returned",
     roster.length === api.roster.length, `card=${roster.length} api=${api.roster.length}`);
  if (api.roster.length) {
    ck("every roster row names a person and a role",
       roster.every(r=>r.who.length>1 && r.mid.length>1), JSON.stringify(roster[0]));
    // The seat is already in the filer's own relationship string, so no extra column restates
    // it -- but every roster row must still say which box the person sits in.
    ck("each roster row names the box the person sits in",
       roster.every(r=>/officer|director/.test(r.mid)), roster[0]?.mid);
    ck("the roster states the window it rests on",
       /ownership filings? held for this company/.test(card), card.slice(-320));
    // The roster is who has FILED, not a board list. An officer who has not traded is absent,
    // and absence must never read as a departure.
    ck("the roster says nobody is shown as having left",
       /nobody here is shown as having left/i.test(card), card.slice(-320));
    ck("no roster row is a 10% owner",
       !roster.some(r=>/10% owner/.test(r.mid)), roster.find(r=>/10%/.test(r.mid))?.mid);
    if (api.roster_total > api.roster.length) {
      ck("a truncated roster says how many more there are",
         new RegExp(`\\+${api.roster_total - api.roster.length} more`).test(card), card.slice(-360));
    }
  }

  /* ---- coverage and the exclusion -------------------------------------------------------- */
  ck("the coverage line names the indexed window",
     /covering \d{4}/.test(card), card.slice(-400));
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
