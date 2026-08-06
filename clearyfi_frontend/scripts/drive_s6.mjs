/*
 * §06 — accounting quality & audit, driven against the real API.
 *
 * The load-bearing claim this section must NOT make: that we know internal control was
 * EFFECTIVE. `dei:IcfrAuditorAttestationFlag` says the control is *subject to* attestation;
 * the Item 9A conclusion is prose we do not read. Nor may the PCAOB id sitting in the tenure
 * slot read as a tenure.
 *
 *   TICKERS=AAPL,JPM,KO node scripts/drive_s6.mjs --dist app-dist
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import puppeteer from "puppeteer";
const DIST=resolve(process.argv[process.argv.indexOf("--dist")+1]), PORT=5207, API="http://127.0.0.1:8000";
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
const api = await fetch(`${API}/v1/companies/${encodeURIComponent(TK)}/audit`).then(r=>r.json()).catch(()=>null);
await p.goto(`http://localhost:${PORT}/company/${TK}/overview?focal=${TK}`,{waitUntil:"networkidle0"});
await p.waitForFunction(()=>!!document.querySelector("#s6"),{timeout:90000});
await new Promise(r=>setTimeout(r,800));

const sec = await p.evaluate(()=>{
  const s=document.querySelector("#s6")?.closest(".hub-sec");
  const cards={};
  for (const c of s?.querySelectorAll(".p-card")||[]) {
    const label=(c.querySelector(".hub-label, .hub-panel-title")?.textContent||"").trim();
    const floor=[...c.querySelectorAll(".hub-cell-mono")]
      .find(x=>/Signed every annual report/i.test(x.textContent||""));
    cards[label]={ text:(c.innerText||"").replace(/\s+/g," ").trim(),
      titles:[...c.querySelectorAll("[title]")].map(x=>x.getAttribute("title")),
      floor:(floor?.textContent||"").replace(/\s+/g," ").trim(),
      floorNote:(floor?.nextElementSibling?.textContent||"").replace(/\s+/g," ").trim() };
  }
  return { text:(s?.innerText||"").replace(/\s+/g," ").trim(), cards };
});
const auditor = sec.cards["Auditor"]||{text:"",titles:[]};

/* ---- the section is off the fixture ------------------------------------------------------- */
ck("no synthetic marker anywhere in §06", !/synthetic/i.test(sec.text), sec.text.slice(0,90));
if (api?.auditor?.status === "ok") {
  ck("the auditor named is the one the filing tagged",
     auditor.text.includes(api.auditor.name), `api=${api.auditor.name}`);
  ck("the PCAOB firm id renders", auditor.text.includes(String(api.auditor.pcaob_firm_id)),
     auditor.text.slice(0,120));
}

/* ---- ICFR: the boundary, never the conclusion ---------------------------------------------- */
// The whole point of the V3 caution. "Effective" / "no material weakness" are Item 9A prose.
ck("§06 never claims ICFR was effective",
   !/ICFR effective|controls? (?:were|are) effective|no material weakness/i.test(sec.text),
   /ICFR effective|effective|material weakness/i.exec(sec.text)?.[0]);
ck("the ICFR line says the conclusion is narrative",
   /effectiveness conclusion is narrative|effectiveness is narrative/i.test(sec.text),
   sec.text.slice(0,200));
ck("the attestation flag explains what it does NOT mean",
   auditor.titles.some(t=>/SUBJECT TO attestation/i.test(t||"")),
   JSON.stringify(auditor.titles).slice(0,160));

/* ---- the tenure slot must not read as a tenure ---------------------------------------------- */
// "tenure" now appears on the card — inside the sentence that DENIES it ("A floor, not a tenure").
// So the check is that no tenure is ever asserted, not that the word is absent.
ck("no tenure is ever asserted",
   !/tenure(?:\s+(?:of|since|:))?\s*(?:\d|[a-z]+\s+years)/i.test(auditor.text),
   /.{0,50}tenure.{0,50}/i.exec(auditor.text)?.[0]);
ck("wherever tenure appears it is being ruled out",
   !/tenure/i.test(auditor.text) ||
     /not a tenure|tenure is not|no SEC filing/i.test(auditor.text + auditor.titles.join(" ")),
   /.{0,50}tenure.{0,50}/i.exec(auditor.text)?.[0]);
ck("the tenure slot's own note says no filing carries tenure",
   auditor.titles.some(t=>/tenure/i.test(t||"")), JSON.stringify(auditor.titles).slice(0,160));

/* ---- the tenure FLOOR is a floor, and says what bounds it ------------------------------------ */
const cont = api?.auditor_continuity;
if (cont?.status === "ok") {
  ck("the floor renders", auditor.text.includes("Signed every annual report"), auditor.text.slice(0,200));
  // Without this, "since Jun 2015" reads as the date E&Y was engaged — six years wrong for Apple,
  // and wrong in the flattering direction.
  ck("the floor says it is a floor, not a start date",
     cont.since_is_a_change
       ? /the engagement began here/i.test(auditor.text)
       : /at least/i.test(auditor.text) && /A floor, not a tenure/i.test(auditor.text),
     auditor.text.slice(0,260));
  ck("the years quoted match the payload",
     cont.since_is_a_change || auditor.text.includes(`${cont.years} yrs`), `api=${cont.years}`);
  // Scoped to the FLOOR line: the window note beneath it legitimately carries exact dates, because
  // the indexed window IS known to the day. What must not be day-precise is the floor itself.
  ck("no day-level precision is implied by an index edge",
     cont.since_is_a_change || !auditor.floor.includes(cont.since),
     `floor="${auditor.floor}" since=${cont.since}`);
} else {
  ck("a too-short index makes no continuity claim at all",
     !/Signed every annual report/i.test(auditor.text), auditor.text.slice(0,200));
  ck("and it says why the window is too short",
     /too short to establish|not indexed|has not been built/i.test(auditor.text),
     auditor.text.slice(0,240));
}
ck("the word tenure is never attached to the floor",
   !/tenure (?:of|since|:)\s*\d/i.test(auditor.text), auditor.text.slice(0,160));

/* ---- an absence is only as big as the window it was checked over ---------------------------- */
ck("the audit-event window is named", /indexed|window|filings? (?:on file|indexed)|since/i.test(auditor.text),
   auditor.text.slice(-220));

/* ---- the re-pointed slot must not pose as a non-GAAP count ---------------------------------- */
const ext = sec.cards["Company extension tags"]||{text:""};
ck("the extension slot is titled for what it is", !!sec.cards["Company extension tags"],
   Object.keys(sec.cards).join(" | "));
ck("it disclaims being a non-GAAP adjustment count",
   /not a non-gaap adjustment count/i.test(ext.text), ext.text.slice(-200));
if (api?.extension_tags?.status === "ok") {
  ck("the extension count matches the payload",
     ext.text.includes(String(api.extension_tags.distinct)),
     `api=${api.extension_tags.distinct}`);
  // The share is of TAGGED FACTS, and the two denominators differ: `facts` is how many facts used
  // an extension, `total_facts` every fact in the instance. A card quoting the wrong one would
  // overstate the departure several-fold.
  const pct = (api.extension_tags.share*100).toFixed(1);
  ck("the share quoted is of all tagged facts, not of extension facts",
     ext.text.includes(pct), `api=${pct}%`);
}

/* ---- Track 2 cards take an honest empty state, never a zero --------------------------------- */
for (const name of ["Critical audit matters","Critical accounting estimates"]) {
  const c = sec.cards[name]||{text:""};
  ck(`${name} explains its absence`, c.text.length > 40 && !/^0$|\b0 (?:matters|estimates)\b/i.test(c.text),
     c.text.slice(0,120));
}
ck("no card renders a bare 0 where a value is missing",
   !/(?:^|\s)(?:Fees|Distinct tags defined|Share of tagged facts)\s*0(?:\s|$)/i.test(sec.text));

ck("no page error", errs.length===0, errs[0]);
ck("no 429", http429===0);
}
console.log(`\n${pass} passed, ${fail} failed`);
await b.close(); s.close();
process.exit(fail?1:0);
