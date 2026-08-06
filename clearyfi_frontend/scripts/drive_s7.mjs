/*
 * §07 — obligations & contingencies, driven against the real API.
 *
 * The claim this section must not make: that an absent figure is a zero. Under ASC 450 an accrual
 * exists only when a loss is probable AND estimable, so most filers disclose matters they never
 * accrue — and the card that used to stand here invented three of them per company.
 *
 *   TICKERS=MSFT,AAPL,JNJ node scripts/drive_s7.mjs --dist app-dist
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import puppeteer from "puppeteer";
const DIST=resolve(process.argv[process.argv.indexOf("--dist")+1]), PORT=5209, API="http://127.0.0.1:8000";
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

/* The matter names the fixture used to invent. None may survive anywhere in the section. */
const INVENTED = [
  "Patent infringement — competitor","Securities class action","Antitrust / trade regulation inquiry",
  "Contract dispute — supplier","Employment class action","Export controls inquiry",
];
const STAGES = ["motion to dismiss pending","on appeal","settled — payment pending","discovery"];

for (const TK of (process.env.TICKERS||"MSFT").split(",")) {
console.log(`\n── ${TK} ──`);
const api = await fetch(`${API}/v1/companies/${encodeURIComponent(TK)}/obligations?groups=legal_proceedings`)
  .then(r=>r.json()).catch(()=>null);
const g = (api?.groups||[])[0];

await p.goto(`http://localhost:${PORT}/company/${TK}/overview?focal=${TK}`,{waitUntil:"networkidle0"});
await p.waitForFunction(()=>!!document.querySelector("#s7"),{timeout:90000});
await new Promise(r=>setTimeout(r,800));

const sec = await p.evaluate(()=>{
  const s=document.querySelector("#s7")?.closest(".hub-sec");
  const cards={};
  for (const c of s?.querySelectorAll(".p-card")||[]) {
    const label=(c.querySelector(".hub-label, .hub-panel-title")?.textContent||"").trim();
    cards[label]={ text:(c.innerText||"").replace(/\s+/g," ").trim(),
      synth:c.querySelectorAll(".hub-synth-card").length };
  }
  return { text:(s?.innerText||"").replace(/\s+/g," ").trim(), cards };
});
const legal = sec.cards["Legal proceedings"]||{text:"",synth:0};

/* ---- no fabricated litigation, anywhere -------------------------------------------------- */
for (const m of INVENTED)
  ck(`no invented matter: "${m.slice(0,28)}"`, !sec.text.includes(m));
ck("no invented case stage survives",
   !STAGES.some(x=>sec.text.includes(x)), STAGES.find(x=>sec.text.includes(x)));
ck("the legal card is no longer marked synthetic", legal.synth===0, `synth=${legal.synth}`);
ck("§07 carries no synthetic marker at all", !/synthetic/i.test(sec.text), sec.text.slice(0,90));

/* ---- the accrual, where the filer recorded one --------------------------------------------- */
if (g?.status === "ok") {
  ck("the accrual renders", /Recorded loss contingency accrual/i.test(legal.text), legal.text.slice(0,120));
  ck("the figure is the filer's", legal.text.includes("$"), legal.text.slice(0,160));
  ck("its provenance travels", new RegExp(g.form.replace(/[-/]/g,"[-/]")).test(legal.text),
     `form=${g.form}`);
} else {
  ck("an absent accrual is an explained absence, never a zero",
     !/\$0\b|\b0\b/.test(legal.text.replace(/ASC 450/g,"")), legal.text.slice(0,160));
  ck("and the card says why it is absent",
     /probable|estimable|not disclosed|narrative/i.test(legal.text), legal.text.slice(0,200));
}

/* ---- the load-bearing caveat, present in BOTH states ---------------------------------------- */
ck("absence is never read as zero exposure",
   /not a zero exposure|absence is not|never means the exposure is zero/i.test(legal.text),
   legal.text.slice(-260));
ck("the narrative columns are named as narrative",
   /Item 3 narrative|narrative/i.test(legal.text), legal.text.slice(-260));

/* ---- letters of credit stay a different instrument from guarantees -------------------------- */
const restr = sec.cards["Restructuring & other obligations"]||{text:""};
ck("letters of credit are named, not folded into guarantees",
   /Letters of credit outstanding/i.test(restr.text), restr.text.slice(-200));

// The empty state's reason and the card's note are the SAME paragraph from the route. Rendering
// both printed it twice — a rendering fault that reads as emphasis.
const asc = legal.text.match(/Under ASC 450 an accrual is recorded/g) || [];
ck("the ASC 450 note appears exactly once", asc.length === 1, `count=${asc.length}`);

ck("no page error", errs.length===0, errs[0]);
ck("no 429", http429===0);
}
console.log(`\n${pass} passed, ${fail} failed`);
await b.close(); s.close();
process.exit(fail?1:0);
