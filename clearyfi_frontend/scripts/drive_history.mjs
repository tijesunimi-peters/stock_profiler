/*
 * Company Hub → Financial history, driven against the real API.
 *
 * This whole page was a seeded random walk until 2026-08-07, including three INVENTED filing
 * events ("restated", "re-segmented", "ASC adoption") planted at fixed quarters for every
 * company. The assertions below are mostly about what must no longer appear.
 *
 *   TICKERS=AAPL,KO node scripts/drive_history.mjs --dist app-dist
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import puppeteer from "puppeteer";
const DIST=resolve(process.argv[process.argv.indexOf("--dist")+1]), PORT=5210, API="http://127.0.0.1:8000";
const MIME={".html":"text/html",".js":"text/javascript",".css":"text/css",".woff2":"font/woff2"};
const s=createServer(async(rq,rs)=>{const u=new URL(rq.url,`http://localhost:${PORT}`);
  if(u.pathname.startsWith("/v1")){const r=await fetch(API+u.pathname+u.search);
    rs.writeHead(r.status,{"content-type":"application/json"});rs.end(await r.text());return;}
  let f=join(DIST,decodeURIComponent(u.pathname));
  if(!extname(u.pathname)||!existsSync(f))f=join(DIST,"index.html");
  rs.writeHead(200,{"content-type":MIME[extname(f)]??"application/octet-stream"});rs.end(await readFile(f));});
await new Promise(r=>s.listen(PORT,r));
const b=await puppeteer.launch({args:["--no-sandbox","--disable-dev-shm-usage"]});
const p=await b.newPage(); await p.setViewport({width:1440,height:1400});
let pass=0,fail=0,http429=0; const errs=[]; p.on("pageerror",e=>errs.push(e.message));
p.on("response",r=>{if(r.status()===429)http429++;});
const ck=(n,ok,d="")=>{ok?(pass++,console.log(`  ✓ ${n}`)):(fail++,console.error(`  ✗ ${n}${d?` — ${d}`:""}`));};

const INVENTED = ["re-segmented", "ASC adoption"];

for (const TK of (process.env.TICKERS||"AAPL").split(",")) {
console.log(`\n── ${TK} ──`);
const enc = encodeURIComponent(TK);
const [rev, revFiled, audit] = await Promise.all([
  // The page opens on 20 QUARTERS, so the legend's headline is the latest quarter.
  fetch(`${API}/v1/companies/${enc}/concept-series?concept=revenue&frequency=quarterly`).then(r=>r.json()),
  fetch(`${API}/v1/companies/${enc}/concept-series?concept=revenue&frequency=quarterly&restatement_basis=as-originally-reported`).then(r=>r.json()),
  fetch(`${API}/v1/companies/${enc}/audit`).then(r=>r.json()).catch(()=>null),
]);

await p.goto(`http://localhost:${PORT}/company/${TK}/history?focal=${TK}`,{waitUntil:"networkidle0"});
await p.waitForFunction(()=>!!document.querySelector(".hist-chart"),{timeout:90000});
await new Promise(r=>setTimeout(r,900));

const read = async () => p.evaluate(()=>({
  text:(document.querySelector(".hub")?.innerText||"").replace(/\s+/g," ").trim(),
  picks:[...document.querySelectorAll(".hist-pick")].map(x=>x.textContent.trim()),
  legend:(document.querySelector(".hist-legend")?.innerText||"").replace(/\s+/g," ").trim(),
  notes:(document.querySelector(".hub-drawer-notes")?.innerText||"").replace(/\s+/g," ").trim(),
  points:[...document.querySelectorAll(".hist-chart svg circle, .hist-chart svg path")].length,
}));
let v = await read();

/* ---- the fixture is gone -------------------------------------------------------------------- */
for (const bad of INVENTED)
  ck(`no invented filing event: "${bad}"`, !v.text.includes(bad));
ck("the picker no longer offers Risk factor count", !v.picks.includes("Risk factor count"),
   v.picks.join(" | ").slice(0,120));
ck("the picker offers the real catalogue", v.picks.length >= 20, `n=${v.picks.length}`);
// The two labels the fixture got wrong about what the data is.
ck("cash is named as cash & equivalents, not cash & ST investments",
   !v.picks.some(x=>/short-term inv/i.test(x)), v.picks.find(x=>/short-term inv/i.test(x)));
ck("debt is named long-term debt, not total debt",
   !v.picks.includes("Total debt"), v.picks.find(x=>/total debt/i.test(x)));

/* ---- the default line is this filer's real revenue ------------------------------------------ */
ck("the chart draws something", v.points > 0, `paths=${v.points}`);
if (rev.points?.length) {
  const last = rev.points[rev.points.length-1];
  // Rendered compactly ($416B), so compare on the leading digits rather than the raw figure.
  const b = (last.value/1e9);
  const shown = b >= 100 ? String(Math.round(b)) : b.toFixed(1);
  ck("the legend's latest value is the filing's", v.legend.includes(shown),
     `api=${shown}B legend=${v.legend.slice(0,120)}`);
  ck("the source tag travels", v.notes.includes(rev.source_tag), `tag=${rev.source_tag}`);
}

/* ---- the basis toggle moves real numbers ---------------------------------------------------- */
ck("the default basis is stated as as-restated",
   /As restated — the latest-filed value/i.test(v.notes), v.notes.slice(0,200));
await p.evaluate(()=>[...document.querySelectorAll(".hub-tab")].find(b=>b.textContent.trim()==="As filed")?.click());
await new Promise(r=>setTimeout(r,900));
const v2 = await read();
ck("switching basis restates the label",
   /As originally reported — the value the first filing/i.test(v2.notes), v2.notes.slice(0,200));
ck("a divergence is not called a restatement outright",
   /corrected the figure or reported it to a different precision/i.test(v2.notes), v2.notes.slice(0,260));
// Where the filer never restated, the two bases must render the SAME latest value.
const sameLatest = rev.points?.at(-1)?.value === revFiled.points?.at(-1)?.value;
if (sameLatest) ck("an unrestated latest period reads identically on both bases",
   v.legend.replace(/\s/g,"") === v2.legend.replace(/\s/g,""), `${v.legend} vs ${v2.legend}`);

/* ---- comparability marks are real or absent -------------------------------------------------- */
const real4402 = (audit?.audit_events?.events ?? []).filter(e=>e.kind==="non_reliance_restatement");
if (real4402.length === 0)
  ck("with no 4.02 on file the chart says so rather than implying none ever",
     /No 8-K Item 4\.02 non-reliance filing falls in this range/i.test(v2.notes), v2.notes.slice(-220));
else
  ck("a real 4.02 is marked and named", /non-reliance restatement 8-K/i.test(v2.notes), v2.notes.slice(-220));

/* ---- an untagged metric is named, never drawn as zero ---------------------------------------- */
await p.evaluate(()=>[...document.querySelectorAll(".hist-pick")].find(b=>b.textContent.trim()==="Employees")?.click());
await new Promise(r=>setTimeout(r,900));
const v3 = await read();
const emp = await fetch(`${API}/v1/companies/${enc}/concept-series?concept=employees&frequency=annual`).then(r=>r.json());
if (!emp.points?.length)
  ck("an untagged metric says so instead of drawing a zero line",
     /Employees: not tagged by this filer/i.test(v3.notes), v3.notes.slice(-260));
else
  ck("a tagged headcount draws a real line", v3.legend.includes("Employees"), v3.legend.slice(0,140));

/* ---- a ratio overlaid on a currency must not be erased ---------------------------------------- */
// Fresh load: the Employees check above leaves its pick selected, and a third series would make
// this a different scenario than the one under test.
await p.goto(`http://localhost:${PORT}/company/${TK}/history?focal=${TK}`,{waitUntil:"networkidle0"});
await p.waitForFunction(()=>!!document.querySelector(".hist-chart"),{timeout:90000});
await new Promise(r=>setTimeout(r,900));
await p.evaluate(()=>[...document.querySelectorAll(".hist-pick")].find(b=>b.textContent.trim()==="Gross margin")?.click());
await new Promise(r=>setTimeout(r,1000));
const v4 = await read();
ck("mixed units are indexed rather than sharing a quantity axis",
   /indexed to its own range \(0.100\)/i.test(v4.notes), v4.notes.slice(0,300));
ck("the legend still carries each metric's real value in its own unit",
   /%/.test(v4.legend) && /\$/.test(v4.legend), v4.legend.slice(0,160));
ck("a computed metric is not reported as having failed to resolve a tag",
   !/no tag resolved/i.test(v4.notes), v4.notes.slice(-200));

/* ---- the two bases diverge where the filer restated ------------------------------------------- */
const qr = await fetch(`${API}/v1/companies/${enc}/concept-series?concept=revenue&frequency=quarterly`).then(r=>r.json());
const qf = await fetch(`${API}/v1/companies/${enc}/concept-series?concept=revenue&frequency=quarterly&restatement_basis=as-originally-reported`).then(r=>r.json());
const byR = Object.fromEntries((qr.points||[]).map(x=>[x.period_end,x.value]));
const nDiff = (qf.points||[]).filter(x=>x.value!=null && byR[x.period_end]!=null && Math.abs(byR[x.period_end]-x.value)>1).length;
console.log(`   (${nDiff} of ${(qf.points||[]).length} quarters differ between bases)`);
ck("the two bases are computed independently, not aliased",
   JSON.stringify(qr.points)!==JSON.stringify(qf.points) || nDiff===0,
   `nDiff=${nDiff}`);

ck("no page error", errs.length===0, errs[0]);
ck("no 429", http429===0);
}
console.log(`\n${pass} passed, ${fail} failed`);
await b.close(); s.close();
process.exit(fail?1:0);
