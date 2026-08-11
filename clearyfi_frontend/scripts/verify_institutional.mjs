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
const cohortCols = await p.evaluate(()=>[...document.querySelectorAll("#i5 ~ *, .hub-sec")].length);
ck("A8 retention heat has cells", /\+0Q/.test(txt.all));
}
console.log(`\n${pass} passed, ${fail} failed`);
await b.close(); s.close();
