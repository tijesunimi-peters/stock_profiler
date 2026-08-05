/*
 * §05.4 insider transactions — driven against the real API.
 *
 * What is asserted here is mostly the ways a Section 16 tally reads wrong, because each of them
 * looks perfectly plausible on screen:
 *
 *   - "trailing 90 days" over a window that ended in 2022 (AAME),
 *   - "6 acquisitions" that were all option exercises, with no purchase among them (AAPL),
 *   - a 10b5-1 count with no denominator on a filer whose filings predate the box (AAME),
 *   - zeros standing in for a company that has no Section 16 filings at all (XOM, whose ticker
 *     SEC moved to a new holdco registrant).
 *
 *   TICKERS=AAPL,NVDA,AAME,XOM node scripts/drive_insider.mjs --dist app-dist
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import puppeteer from "puppeteer";
const DIST=resolve(process.argv[process.argv.indexOf("--dist")+1]), PORT=5191, API="http://127.0.0.1:8000";
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
// The API answer, so the card can be checked against what it was actually given rather than
// against a second opinion computed here.
const api = await (await fetch(`${API}/v1/companies/${TK}/insider-summary?limit=10`)).json();

await p.goto(`http://localhost:${PORT}/company/${TK}/overview?focal=${TK}`,{waitUntil:"networkidle0"});
await p.waitForFunction((tk)=>{
  const r=document.querySelector(".alt-content");
  if(!r||!r.childElementCount||r.querySelector(".state-loading")) return false;
  if(!document.body.innerText.includes(tk)) return false;
  return [...document.querySelectorAll(".p-card")].some(e=>/Insider transactions/i.test(e.textContent||""));
}, {timeout:60000}, TK);
await new Promise(r=>setTimeout(r,600));

const card = await p.$$eval(".p-card", (els)=>{
  const hit = els.find(e=>/Insider transactions/i.test(e.querySelector(".hub-label")?.textContent||""));
  return hit ? (hit.innerText||"").replace(/\s+/g," ").trim() : "";
});
console.log("   card:", card.slice(0, 260));

/* ---- the card no longer claims to be synthetic ------------------------------------------ */
ck("the card is not marked synthetic", !/synthetic/i.test(card), card.slice(0,80));

/* ---- the window ruling: state the filings read, never a trailing period ------------------ */
ck("the hint counts filings, not days", /\d+ filings?/i.test(card), card.slice(0,90));
ck("nothing claims a trailing 90-day window", !/trailing 90 days/i.test(card));
if (api.status === "ok" && api.window_start) {
  const yr = api.window_start.slice(0,4);
  ck(`the window names the year it actually covers (${yr})`, card.includes(yr), card.slice(0,120));
}

if (api.status === "ok" && api.transactions) {
  /* ---- the counts are the ones the API computed, not a second tally -------------------- */
  ck("acquisitions match the API", new RegExp(`${api.acquisitions} acquisitions`).test(card),
     `api=${api.acquisitions} card=${card.slice(0,90)}`);
  ck("dispositions match the API", new RegExp(`${api.dispositions} dispositions`).test(card),
     `api=${api.dispositions}`);
  ck("the direction is named categorically, not scored",
     new RegExp(api.direction.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).test(card), api.direction);

  /* ---- the open-market subset is stated even when it is zero -------------------------- */
  // Apple's six acquisitions are ALL option exercises. A card that stopped at "6 acquisitions"
  // would read as buying; the footer is what stops it, so a zero here must be printed.
  ck("the open-market subset is stated", /open-market \(codes P\/S\)/i.test(card), card.slice(-220));
  ck("the open-market purchase count matches the API",
     new RegExp(`${api.open_market_purchases} purchases?`).test(card),
     `api=${api.open_market_purchases}`);
  ck("the note names what the rest of the codes are",
     /vesting|option exercises|tax withholding/i.test(card));

  /* ---- the 10b5-1 flag carries its denominator ---------------------------------------- */
  if (api.plan_known) {
    ck("the plan count carries its denominator",
       new RegExp(`${api.plan_flagged} of ${api.plan_known}`).test(card), card.slice(-200));
    // D-10b5-1: the box says a trade was pre-arranged, never when the plan was adopted, so no
    // cooling-off window can be drawn from it. The line has to say so where it reports a count.
    ck("the plan line states the boundary it cannot cross",
       /never when the plan was adopted/i.test(card), card.slice(-200));
  } else {
    ck("a filer predating the Form 4 box says so, rather than reporting 0 plans",
       /added to Form 4 in 2022/i.test(card), card.slice(-200));
  }
  ck("nothing claims a plan was adopted in a period", !/adopted in the (trailing|last)/i.test(card));

  /* ---- the rows ------------------------------------------------------------------------ */
  const rows = await p.$$eval(".p-card", (els)=>{
    const hit = els.find(e=>/Insider transactions/i.test(e.querySelector(".hub-label")?.textContent||""));
    return [...(hit?.querySelectorAll(".hub-tri-row")||[])].map(r=>({
      text:(r.innerText||"").replace(/\s+/g," ").trim(),
      title:r.querySelector(".hub-cell-mono.is-soft")?.getAttribute("title")||"",
    }));
  });
  ck("three transaction rows render", rows.length===3, `${rows.length}`);
  ck("each row names its SEC code letter", rows.every(r=>/\([A-Z]\)/.test(r.text)), rows[0]?.text);
  ck("the code's full legend meaning is on the row", rows.every(r=>r.title.length>3), rows[0]?.title);
  ck("the newest row matches the API's newest",
     rows[0]?.text.includes(api.recent[0].transaction_date), `${rows[0]?.text} vs ${api.recent[0].transaction_date}`);
} else {
  /* ---- the empty state --------------------------------------------------------------- */
  // XOM: SEC's ticker map moved it to a new holdco registrant with no Section 16 filings yet.
  // Zeros here would be a claim about insider behaviour that nothing supports.
  ck("an empty card explains itself instead of printing zeros",
     !/0 acquisitions/.test(card) && card.length > 40, card.slice(0,140));
  ck("the reason says why there is nothing", /Section 16|could not be read/i.test(card), card.slice(0,160));
  // Descartes is a Canadian foreign private issuer — exempt from Section 16, so its zero is a
  // fact about the rule, not about its insiders. The card must not let those read alike.
  ck("an absence is not presented as an absence of insider trading",
     !/no insider (trading|activity)\b(?! *,)/i.test(card) || /not the same as/i.test(card), card.slice(0,180));
}

ck("no page error", errs.length===0, errs[0]);
ck("no 429", http429===0);
}
console.log(`\n${pass} passed, ${fail} failed`);
await b.close(); s.close();
process.exit(fail?1:0);
