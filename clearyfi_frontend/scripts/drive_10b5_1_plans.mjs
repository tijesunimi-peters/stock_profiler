/*
 * §05.5 Rule 10b5-1 plans — driven against the real API.
 *
 * This card exists because D-10b5-1 turned out to be wrong: Item 408(a) names the person and the
 * adoption date, which Form 4's aff10b5One box never could. What is asserted here is mostly the
 * boundaries of that new claim:
 *
 *   - the window is one fiscal QUARTER, and the card says which — "no plans adopted" over a
 *     quarter and over a year are very different statements,
 *   - a termination is not an adoption (Amazon's CFO terminated in the same quarter six
 *     colleagues adopted),
 *   - a filer that answered "nobody" is a finding, not an empty card,
 *   - amounts are as filed, including Microsoft's 48.7 billion shares.
 *
 *   TICKERS=JPM,NVDA,AMZN,AAPL,MSFT node scripts/drive_10b5_1_plans.mjs --dist app-dist
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import puppeteer from "puppeteer";
const DIST=resolve(process.argv[process.argv.indexOf("--dist")+1]), PORT=5195, API="http://127.0.0.1:8000";
const MIME={".html":"text/html",".js":"text/javascript",".css":"text/css",".woff2":"font/woff2"};
const s=createServer(async(rq,rs)=>{const u=new URL(rq.url,`http://localhost:${PORT}`);
  if(u.pathname.startsWith("/v1")){const r=await fetch(API+u.pathname+u.search);
    rs.writeHead(r.status,{"content-type":"application/json"});rs.end(await r.text());return;}
  let f=join(DIST,decodeURIComponent(u.pathname));
  if(!extname(u.pathname)||!existsSync(f))f=join(DIST,"index.html");
  rs.writeHead(200,{"content-type":MIME[extname(f)]??"application/octet-stream"});rs.end(await readFile(f));});
await new Promise(r=>s.listen(PORT,r));
const b=await puppeteer.launch({args:["--no-sandbox","--disable-dev-shm-usage"]});
const p=await b.newPage(); await p.setViewport({width:1440,height:2800});
let pass=0,fail=0,http429=0; const errs=[]; p.on("pageerror",e=>errs.push(e.message));
p.on("response",r=>{if(r.status()===429)http429++;});
const ck=(n,ok,d="")=>{ok?(pass++,console.log(`  ✓ ${n}`)):(fail++,console.error(`  ✗ ${n}${d?` — ${d}`:""}`));};

for (const TK of (process.env.TICKERS||"JPM").split(",")) {
console.log(`\n── ${TK} ──`);
const api = await (await fetch(`${API}/v1/companies/${TK}/trading-arrangements`)).json();

await p.goto(`http://localhost:${PORT}/company/${TK}/overview?focal=${TK}`,{waitUntil:"networkidle0"});
await p.waitForFunction((tk)=>{
  const r=document.querySelector(".alt-content");
  if(!r||!r.childElementCount||r.querySelector(".state-loading")) return false;
  if(!document.body.innerText.includes(tk)) return false;
  return [...document.querySelectorAll(".p-card")].some(e=>/Rule 10b5-1 plans/i.test(e.textContent||""));
}, {timeout:90000}, TK);
await new Promise(r=>setTimeout(r,600));

const { card, rows } = await p.$$eval(".p-card", (els)=>{
  const hit = els.find(e=>/Rule 10b5-1 plans/i.test(e.querySelector(".hub-label")?.textContent||""));
  const rows=[...(hit?.querySelectorAll(".hub-tri-row")||[])].map(el=>({
    who:(el.querySelector(".hub-cell")?.childNodes[0]?.textContent||"").trim(),
    mark:(el.querySelector(".hub-changed-mark")?.textContent||"").trim(),
    mid:(el.querySelector(".hub-cell-mono.is-soft")?.textContent||"").trim(),
    date:(el.querySelector(".ta-r")?.textContent||"").trim(),
    title:el.querySelector(".hub-cell")?.getAttribute("title")||"",
  }));
  return { card:(hit?.innerText||"").replace(/\s+/g," ").trim(), rows };
});
console.log("   card:", card.slice(0, 260));

/* ---- the window is a quarter, and it is named ------------------------------------------- */
// The whole risk of this card: "no plans adopted" reads as a year unless the quarter is stated.
ck("the quarter is stated", /quarter ended \d{1,2} \w{3} \d{4}/i.test(card), card.slice(0,200));
ck("the note says the disclosure is per fiscal quarter",
   /per fiscal QUARTER/i.test(card) || /not the trailing year/i.test(card), card.slice(-260));
ck("nothing claims a trailing year", !/adopted in the trailing year/i.test(card));
if (api.filing?.period_end) {
  ck(`the stated quarter matches the filing (${api.filing.period_end})`,
     card.includes(api.filing.period_end.slice(0,4)), card.slice(0,200));
}

if (api.status === "ok" && api.arrangements.length) {
  /* ---- rows match the payload ---------------------------------------------------------- */
  ck("row count matches the API", rows.length === api.arrangements.length,
     `card=${rows.length} api=${api.arrangements.length}`);
  ck("every row names a person", rows.every(r=>r.who.length>2), JSON.stringify(rows[0]));
  ck("every row carries a date", rows.every(r=>r.date.length>3), JSON.stringify(rows[0]));
  ck("the person's title is on the row for hover",
     rows.some(r=>r.title.length>3), rows[0]?.title);

  /* ---- adoption vs termination ---------------------------------------------------------- */
  const terminated = api.arrangements.filter(a=>a.rule_10b5_1_terminated);
  ck("terminations are marked, adoptions are not",
     rows.filter(r=>r.mark==="terminated").length === terminated.length,
     `card=${rows.filter(r=>r.mark).length} api=${terminated.length}`);
  if (terminated.length) {
    ck("a terminated plan is not presented as an adoption",
       rows.some(r=>r.mark==="terminated" && r.who===terminated[0].person),
       terminated[0].person);
  }

  /* ---- amounts are the filer's ---------------------------------------------------------- */
  const withAmount = api.arrangements.find(a=>a.securities_amount);
  if (withAmount) {
    const shown = withAmount.securities_amount.toLocaleString("en-US");
    ck("a securities amount renders as filed, with its unit",
       rows.some(r=>r.mid.includes(shown)) && /shares/.test(card),
       `${shown} vs ${rows.map(r=>r.mid).join(" | ").slice(0,120)}`);
  }
  ck("the note says amounts are as filed", /as filed/i.test(card), card.slice(-260));
} else if (api.status === "ok") {
  /* ---- a filer that answered "nobody" ---------------------------------------------------- */
  // Apple tags the flags false. That is a finding about the quarter, not an empty card.
  ck("a filer with no plans states it as a finding",
     /No director or officer adopted or terminated/i.test(card), card.slice(0,200));
  ck("no rows render", rows.length===0, `${rows.length}`);
} else {
  ck("an unreadable filer explains itself", card.length>60, card.slice(0,160));
}

ck("no page error", errs.length===0, errs[0]);
ck("no 429", http429===0);
}
console.log(`\n${pass} passed, ${fail} failed`);
await b.close(); s.close();
process.exit(fail?1:0);
