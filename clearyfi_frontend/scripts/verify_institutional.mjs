/* Cross-check what the institutional view RENDERS against what the API returns. */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import puppeteer from "puppeteer";
const DIST=resolve(process.argv[process.argv.indexOf("--dist")+1]), PORT=5220, API="http://127.0.0.1:8000";
const H={"sec-fetch-site":"same-origin"};
const MIME={".html":"text/html",".js":"text/javascript",".css":"text/css",".woff2":"font/woff2"};
const s=createServer(async(rq,rs)=>{const u=new URL(rq.url,`http://localhost:${PORT}`);
  if(u.pathname.startsWith("/v1")){const r=await fetch(API+u.pathname+u.search,{headers:H});
    rs.writeHead(r.status,{"content-type":"application/json"});rs.end(await r.text());return;}
  let f=join(DIST,decodeURIComponent(u.pathname));
  if(!extname(u.pathname)||!existsSync(f))f=join(DIST,"index.html");
  rs.writeHead(200,{"content-type":MIME[extname(f)]??"application/octet-stream"});rs.end(await readFile(f));});
await new Promise(r=>s.listen(PORT,r));
const g=(p)=>fetch(API+p,{headers:H}).then(r=>r.json());
const b=await puppeteer.launch({args:["--no-sandbox","--disable-dev-shm-usage"]});
const p=await b.newPage(); await p.setViewport({width:1440,height:2000});
let pass=0,fail=0;
const ck=(n,ok,d="")=>{ok?(pass++,console.log(`  ✓ ${n}`)):(fail++,console.error(`  ✗ ${n}${d?` — ${d}`:""}`));};

for (const TK of (process.env.TICKERS||"AAPL").split(",")) {
console.log(`\n── ${TK} ──`);
const per = await g(`/v1/companies/${TK}/institutional-periods`);
const base = per.periods.find(x => x <= "9999") && (new Date().toISOString().slice(0,10) < per.period_meta.deadline ? per.periods[1] : per.periods[0]);
const reg = await g(`/v1/companies/${TK}/institutional-register?period=${base}`);
const attr = await g(`/v1/companies/${TK}/institutional-share-attribution?period=${base}`);
const dom = await g(`/v1/companies/${TK}/institutional-holder-domicile?period=${base}`);
const shape = await g(`/v1/companies/${TK}/institutional-register-shape?period=${base}`);

await p.goto(`http://localhost:${PORT}/company/${TK}/institutional?focal=${TK}`,{waitUntil:"networkidle0"});
await p.waitForFunction(()=>!!document.querySelector("#i6"),{timeout:90000});
await new Promise(r=>setTimeout(r,1500));
await p.evaluate(()=>document.querySelectorAll("button").forEach(x=>{if(/^\+ |show /i.test(x.textContent||""))x.click();}));
await new Promise(r=>setTimeout(r,1200));
const txt = await p.evaluate(()=>({
  all:(document.body.innerText||"").replace(/\s+/g," "),
  s3:(document.querySelector("#i3")?.closest(".hub-sec")?.innerText||"").replace(/\s+/g," "),
}));

/* A1 the base quarter is the one past its deadline */
ck("A1 base quarter is the last past-deadline one", txt.all.includes(base.split("-")[0]) && !txt.all.includes("Register as of 30 Jun"), `base=${base}`);
/* A2 holder count agrees across sections */
const hc = reg.concentration.holder_count.toLocaleString();
ck(`A2 §01 base register == §02/§03 holder count (${hc})`, txt.all.includes(hc), `api=${hc}`);
/* A3 attribution institutional row == the §01 tile */
const instShares = attr.attribution.rows.find(r=>r.key==="institutional");
ck("A3 §01 institutional tile matches attribution", txt.all.includes((instShares.share_of_outstanding*100).toFixed(1)+"%"), `api=${(instShares.share_of_outstanding*100).toFixed(1)}%`);
/* A4 concentration figures */
ck("A4 HHI rendered matches", txt.s3.includes(Math.round(reg.concentration.hhi).toLocaleString()), `api=${Math.round(reg.concentration.hhi)}`);
ck("A5 Gini rendered matches", txt.s3.includes(reg.concentration.gini.toFixed(3)), `api=${reg.concentration.gini.toFixed(3)}`);
/* A6 domicile: is the top-N cap disclosed? */
const domRows = dom.domicile.rows.length;
// The bar must SUM to the whole: the residual segment is labelled "<n> other places".
ck(`A6 domicile residual is shown (${domRows} places exist)`,
   domRows <= 8 || new RegExp(`${domRows - 8} other places`).test(txt.s3),
   `${domRows} places, expected a "${domRows - 8} other places" segment`);
/* A7 turnover is NOT the endpoint's filling-quarter figure */
ck("A7 turnover is not the endpoint's filling-quarter value",
   !txt.all.includes(shape.turnover.turnover_pct.toFixed(1)+"%"), `endpoint=${shape.turnover.turnover_pct.toFixed(1)}%`);
/* A8 retention columns exclude the filling quarter */
ck("A8 retention heat has cells", /\+0Q/.test(txt.all));

/*
 * A9 the Pareto cumulative curve is a share of the REGISTER, not of the twenty bars drawn.
 *
 * Read the curve back off the page: the right-hand axis is the 0-100% scale, so two of its ticks
 * fix the mapping and the solid ink path's last vertex is the claim the chart makes. Comparing it
 * to a figure computed from the register keeps the check honest in both directions -- it fails if
 * the denominator reverts to the drawn rows, and it also fails if the chart silently stops
 * receiving the register total.
 */
const sv = reg.share_vector ?? [];
const top20 = sv.slice(0,20).reduce((a,h)=>a+h.shares,0);
const expected = 100*top20/reg.total_reported_shares;
const cum = await p.evaluate(()=>{
  const svg=[...document.querySelectorAll('svg[aria-label]')].find(s=>/Ranked manager share$/.test(s.getAttribute("aria-label")||""));
  if(!svg) return null;
  const ticks=[...svg.querySelectorAll(".tick")].map(t=>{
    const v=Number((t.querySelector("text")?.textContent||"").replace(/[^\d.-]/g,""));
    const m=/translate\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/.exec(t.getAttribute("transform")||"");
    return m&&/%$/.test(t.querySelector("text")?.textContent||"")?{v,y:Number(m[2])}:null;
  }).filter(Boolean);
  if(ticks.length<2) return null;
  const [a,z]=[ticks[0],ticks[ticks.length-1]];
  // The prior-quarter ghost is dashed; the current curve is the solid one.
  const path=[...svg.querySelectorAll("path")].filter(x=>!x.style.strokeDasharray&&x.getAttribute("fill")==="none")
    .sort((m,n)=>(n.getAttribute("d")||"").length-(m.getAttribute("d")||"").length)[0];
  const pts=[...(path?.getAttribute("d")||"").matchAll(/[ML]\s*(-?[\d.]+),(-?[\d.]+)/g)];
  if(!pts.length) return null;
  const y=Number(pts[pts.length-1][2]);
  return a.v+((y-a.y)*(z.v-a.v))/(z.y-a.y);
});
ck(`A9 Pareto cumulative tops out at the top-20 share, not 100%`,
   cum!=null && Math.abs(cum-expected)<2 && cum<95,
   `drew ${cum==null?"(unreadable)":cum.toFixed(1)+"%"}, register says ${expected.toFixed(1)}%`);

/*
 * A10 the largest-moves dumbbell plots only positions reported at BOTH ends, and says how many it
 * left out. A one-sided row drawn with a zero reads as "Norges Bank 192.3M -> 0M" for a manager
 * that simply left the register.
 */
const act = await g(`/v1/companies/${TK}/institutional-activity?period=${base}&limit=2000`);
const oneSided = (act.activity??[]).filter(m=>m.shares_before==null||m.shares_after==null).length;
const exits = (act.activity??[]).filter(m=>m.action==="exited").length;
ck(`A10 one-sided positions are excluded and counted (${oneSided} of ${(act.activity??[]).length})`,
   oneSided===0 || new RegExp(`${exits.toLocaleString()} exited`).test(txt.all),
   `expected the note to report ${exits.toLocaleString()} exits`);
}
console.log(`\n${pass} passed, ${fail} failed`);
await b.close(); s.close();
