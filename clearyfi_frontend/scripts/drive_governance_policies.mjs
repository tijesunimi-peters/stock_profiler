/*
 * §05.2 governance policies — driven against the real API.
 *
 * The card was repointed from board composition, whose four fields are tagged nowhere, to four
 * check marks that are. What is asserted here is mostly about the difference between a box the
 * filer left unticked and one they never answered:
 *
 *   - an untagged flag is N/A, never "no",
 *   - "no error correction" is a real answer, not an absence,
 *   - the clawback tile never claims a clawback POLICY exists, which is proxy prose,
 *   - the board fields the design asked for are named as absent rather than quietly dropped.
 *
 *   TICKERS=AAPL,KO,NVDA,MSFT,GOOGL node scripts/drive_governance_policies.mjs --dist app-dist
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import puppeteer from "puppeteer";
const DIST=resolve(process.argv[process.argv.indexOf("--dist")+1]), PORT=5194, API="http://127.0.0.1:8000";
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
const enc = encodeURIComponent(TK);
const [pvp, audit] = await Promise.all([
  fetch(`${API}/v1/companies/${enc}/pay-versus-performance`).then(r=>r.json()).catch(()=>null),
  fetch(`${API}/v1/companies/${enc}/audit`).then(r=>r.json()).catch(()=>null),
]);

await p.goto(`http://localhost:${PORT}/company/${TK}/overview?focal=${TK}`,{waitUntil:"networkidle0"});
await p.waitForFunction((tk)=>{
  const r=document.querySelector(".alt-content");
  if(!r||!r.childElementCount||r.querySelector(".state-loading")) return false;
  if(!document.body.innerText.includes(tk)) return false;
  return [...document.querySelectorAll(".p-card")].some(e=>/Governance policies/i.test(e.textContent||""));
}, {timeout:60000}, TK);
await new Promise(r=>setTimeout(r,600));

const { card, tiles } = await p.$$eval(".p-card", (els)=>{
  const hit = els.find(e=>/Governance policies/i.test(e.querySelector(".hub-label")?.textContent||""));
  const tiles = [...(hit?.querySelectorAll(".hub-quad > div")||[])].map(el=>({
    label:(el.querySelector(".hub-hint")?.textContent||"").trim(),
    // `Fig` renders an N/A as a status chip whose text carries a leading glyph, so normalise
    // it back to the bare token before comparing against the payload.
    value:(el.querySelector(".hub-mid")?.textContent||"").trim().replace(/^∅\s*/,""),
    why:el.querySelector(".hub-mid")?.getAttribute("title")||"",
    na: !!el.querySelector(".status-chip, [class*='chip']"),
  }));
  return { card:(hit?.innerText||"").replace(/\s+/g," ").trim(), tiles };
});
console.log("   card:", card.slice(0, 280));

/* ---- the repoint ------------------------------------------------------------------------- */
ck("the card is not marked synthetic", !/synthetic/i.test(card), card.slice(0,80));
ck("four tiles render", tiles.length===4, `${tiles.length}`);
// Scoped to the TILE LABELS. The footer legitimately names those four fields when saying they
// are tagged nowhere, and matching the whole card would flag the honesty note as the fixture.
ck("the fixture's invented board numbers are gone",
   !tiles.some(t=>/Board size|^Independent$|Director tenure|CEO tenure/.test(t.label)),
   tiles.map(t=>t.label).join(" | "));
// The design's question must be answered, not silently dropped.
ck("the absent board fields are named as absent",
   /Board size, independence, director tenure and CEO tenure are tagged in no SEC source/i.test(card),
   card.slice(-320));
ck("the card points at where the directors DO appear",
   /listed above/i.test(card), card.slice(-200));

/* ---- values are the filer's, and match the payload --------------------------------------- */
const g = pvp?.governance || {};
const expect = (v, yes, no) => v===true?yes : v===false?no : "N/A";
ck("insider trading policy matches the ecd flag",
   tiles[0]?.value === expect(g.insider_trading_policy_adopted,"Adopted","Not adopted"),
   `card=${tiles[0]?.value} api=${g.insider_trading_policy_adopted}`);
ck("award timing vs MNPI matches the ecd flag",
   tiles[1]?.value === expect(g.award_timing_considers_mnpi,"Considered","Not considered"),
   `card=${tiles[1]?.value} api=${g.award_timing_considers_mnpi}`);
ck("award timing predetermined matches the ecd flag",
   tiles[2]?.value === expect(g.award_timing_predetermined,"Predetermined","Not predetermined"),
   `card=${tiles[2]?.value} api=${g.award_timing_predetermined}`);

/* ---- an untagged box is not a "no" -------------------------------------------------------- */
// This is the whole risk of rendering booleans: null and false look alike on screen and mean
// opposite things — "the filer said no" versus "the filer never answered".
for (const [i, key] of [[1,"award_timing_considers_mnpi"],[2,"award_timing_predetermined"]]) {
  if (g[key] === null || g[key] === undefined) {
    ck(`an untagged ${key} renders N/A, not a negative`,
       tiles[i]?.value === "N/A" && !/Not /.test(tiles[i]?.value||""), tiles[i]?.value);
    ck(`the untagged ${key} says an untagged box is not a no`,
       /not a 'no'|not a “no”/i.test(tiles[i]?.why||""), tiles[i]?.why?.slice(0,120));
  } else {
    ck(`${key} is a real value, not N/A`, tiles[i]?.value !== "N/A", tiles[i]?.value);
  }
}

/* ---- the clawback tile --------------------------------------------------------------------- */
const c = audit?.clawback || {};
if (c.error_correction === false) {
  // A reported "no" is an answer, not an absence — the mirror of the rule above.
  ck("no error correction renders as a stated none, not N/A",
     /^None in FY\d{4}$/.test(tiles[3]?.value||""), tiles[3]?.value);
  ck("it explains that the recovery question does not arise",
     /does not arise/i.test(tiles[3]?.why||""), tiles[3]?.why?.slice(0,140));
} else if (c.error_correction === true) {
  ck("an error correction is stated with its year", /^Yes, FY\d{4}$/.test(tiles[3]?.value||""), tiles[3]?.value);
} else {
  ck("an unread cover renders N/A", tiles[3]?.value === "N/A", tiles[3]?.value);
}
// Whether a clawback POLICY exists is a listing-standard disclosure in proxy prose. The two cover
// check marks say something narrower, and the card must not stretch them.
ck("the card never claims a clawback policy exists",
   !/clawback policy (adopted|in place)/i.test(card), card.slice(-320));
ck("no tile claims a judgment about governance quality",
   /not a judgment/i.test(card), card.slice(-320));

ck("no page error", errs.length===0, errs[0]);
ck("no 429", http429===0);
}
console.log(`\n${pass} passed, ${fail} failed`);
await b.close(); s.close();
process.exit(fail?1:0);
