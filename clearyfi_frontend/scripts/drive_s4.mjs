/*
 * §04's two newly-plumbed cards — share classes and blockholders — driven against the real API.
 *
 * Both carry a claim they must NOT make:
 *   - share counts do not describe control (Alphabet's Class B is 6.9% at ten votes each),
 *   - a holder below 5% is not a blockholder, however specific its percentage looks.
 *
 *   TICKERS=GOOGL,AAPL,KO node scripts/drive_s4.mjs --dist app-dist
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import puppeteer from "puppeteer";
const DIST=resolve(process.argv[process.argv.indexOf("--dist")+1]), PORT=5206, API="http://127.0.0.1:8000";
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

for (const TK of (process.env.TICKERS||"GOOGL").split(",")) {
console.log(`\n── ${TK} ──`);
const enc=encodeURIComponent(TK);
const [cls, blk] = await Promise.all([
  fetch(`${API}/v1/companies/${enc}/share-classes`).then(r=>r.json()).catch(()=>null),
  fetch(`${API}/v1/companies/${enc}/beneficial-ownership?limit=20`).then(r=>r.json()).catch(()=>null),
]);

await p.goto(`http://localhost:${PORT}/company/${TK}/overview?focal=${TK}`,{waitUntil:"networkidle0"});
await p.waitForFunction(()=>!!document.querySelector("#s4"),{timeout:90000});
await new Promise(r=>setTimeout(r,800));

const cards = await p.evaluate(()=>{
  const sec=document.querySelector("#s4")?.closest(".hub-sec");
  const out={};
  for (const c of sec?.querySelectorAll(".p-card")||[]) {
    const label=(c.querySelector(".hub-label, .hub-panel-title")?.textContent||"").trim();
    out[label]={
      text:(c.innerText||"").replace(/\s+/g," ").trim(),
      rows:[...c.querySelectorAll(".hub-tri-row")].map(r=>(r.innerText||"").replace(/\s+/g," ").trim()),
      synthWhy:[...c.querySelectorAll(".hub-synth-card")].map(x=>x.getAttribute("title")||""),
    };
  }
  return out;
});
const classes = cards["Share classes"]||{text:"",rows:[]};
const holders = cards["Reported blockholders · 13D/G"]||{text:"",rows:[]};

/* ---- both cards are off the fixture ------------------------------------------------------ */
// The card still carries the INSIDER-OWNERSHIP footer, which is legitimately synthetic: the DEF
// 14A beneficial-ownership table is untagged and permanently so. What must not be synthetic is
// the class table itself, so the marker is checked by what it explains, not by its presence.
ck("the only synthetic marker on this card is the insider-ownership line",
   (classes.synthWhy||[]).every(w=>/beneficial-ownership table/i.test(w)),
   JSON.stringify(classes.synthWhy));
ck("the class rows themselves carry no synthetic marker",
   !classes.rows.some(r=>/synthetic/i.test(r)), classes.rows.find(r=>/synthetic/i.test(r)));
ck("blockholders is not marked synthetic", !/synthetic/i.test(holders.text), holders.text.slice(0,80));

/* ---- share counts must never imply control ------------------------------------------------ */
ck("no votes-per-share column is offered",
   !/votes per share|voting power/i.test(classes.text) || /cannot describe control/i.test(classes.text),
   classes.text.slice(0,140));
ck("the card says percentages are of shares, not votes",
   /of shares OUTSTANDING, not of votes/i.test(classes.text), classes.text.slice(-320));
ck("the card says the counts cannot describe control",
   /cannot describe control/i.test(classes.text), classes.text.slice(-320));
ck("authorised is named as headroom, not shares in issue",
   /issuance headroom/i.test(classes.text), classes.text.slice(-320));

if (cls?.status === "ok") {
  const dataRows = classes.rows.filter(r=>!/^CLASS /i.test(r));
  ck("every class in the payload renders", dataRows.length === cls.classes.length,
     `card=${dataRows.length} api=${cls.classes.length}`);
  ck("the fiscal year is stated", new RegExp(`FY${cls.fiscal_year}`).test(classes.text),
     classes.text.slice(0,120));
} else {
  ck("a single-class filer explains itself", /single-class registrant/i.test(classes.text),
     classes.text.slice(0,160));
}

/* ---- below 5% is not a blockholder --------------------------------------------------------- */
const cur = blk?.current;
if (cur?.status === "ok") {
  ck("holder rows match the payload",
     holders.rows.length === cur.holders.length,
     `card=${holders.rows.length} api=${cur.holders.length}`);
  // The threshold the card is named for. Alphabet's cache holds 13G/A rows down to 0.01%.
  ck("no holder is listed below 5%",
     cur.holders.every(h=>h.percent_of_class === null || h.percent_of_class >= 5),
     JSON.stringify(cur.holders.find(h=>h.percent_of_class !== null && h.percent_of_class < 5)));
  ck("the rendered percentages are all >= 5%",
     holders.rows.every(r=>{const m=/(\d+\.\d+)%/.exec(r); return !m || Number(m[1])>=5;}),
     holders.rows.find(r=>{const m=/(\d+\.\d+)%/.exec(r); return m && Number(m[1])<5;}));
} else {
  ck("an empty holder list explains why that is normal",
     /crossing 5%|below the 5% threshold/i.test(holders.text), holders.text.slice(0,180));
}
if (cur?.exited?.length) {
  ck("exits are reported beneath the list, not inside it",
     /reported dropping below the 5% threshold/i.test(holders.text), holders.text.slice(-300));
  ck("an exit carries the residual stake it reported",
     /to nil|to \d+\.\d+%/.test(holders.text), holders.text.slice(-300));
}
ck("the card refuses to read as an ownership ranking",
   /not a ranking of institutional ownership/i.test(holders.text), holders.text.slice(-260));

ck("no page error", errs.length===0, errs[0]);
ck("no 429", http429===0);
}
console.log(`\n${pass} passed, ${fail} failed`);
await b.close(); s.close();
process.exit(fail?1:0);
