/*
 * Chart geometry sweep: every route, every chart, every text node.
 *
 *   ROUTES=/company/AAPL/institutional node scripts/sweep_chart_geometry.mjs --dist app-dist
 *
 * Prints svg/text counts per route so a clean run cannot be a run that measured nothing — the
 * manager routes reported zero charts until the CIK was one the fixture universe actually knows.
 *
 * Reports any SVG text that starts left of its chart / card, or ends right of it. This is the
 * class of defect that types and the headless render check both miss — it is geometric and
 * data-dependent, so it only shows on real filings at a real width.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import puppeteer from "puppeteer";
const DIST=resolve(process.argv[process.argv.indexOf("--dist")+1]), PORT=5216, API="http://127.0.0.1:8000";
const MIME={".html":"text/html",".js":"text/javascript",".css":"text/css",".woff2":"font/woff2"};
const s=createServer(async(rq,rs)=>{const u=new URL(rq.url,`http://localhost:${PORT}`);
  if(u.pathname.startsWith("/v1")){const r=await fetch(API+u.pathname+u.search,{headers:{"sec-fetch-site":"same-origin"}});
    rs.writeHead(r.status,{"content-type":"application/json"});rs.end(await r.text());return;}
  let f=join(DIST,decodeURIComponent(u.pathname));
  if(!extname(u.pathname)||!existsSync(f))f=join(DIST,"index.html");
  rs.writeHead(200,{"content-type":MIME[extname(f)]??"application/octet-stream"});rs.end(await readFile(f));});
await new Promise(r=>s.listen(PORT,r));
const b=await puppeteer.launch({args:["--no-sandbox","--disable-dev-shm-usage"]});
const p=await b.newPage();

const ROUTES = (process.env.ROUTES || [
  "/company/AAPL/overview","/company/AAPL/history","/company/AAPL/institutional",
  "/company/AAPL/insider","/company/AAPL/peers",
  "/company/KO/institutional","/company/JPM/institutional",
  "/sectors","/sectors/qualitative","/sectors/filings",
  "/compare/companies","/compare/sectors",
  "/manager/1364742/profile","/manager/1364742/footprint","/manager/1364742/activity",
].join(",")).split(",");

const MEASURE = () => {
  const bad = [];
  document.querySelectorAll("svg").forEach((svg) => {
    const sb = svg.getBoundingClientRect();
    if (!sb.width) return;
    const card = svg.closest(".p-card") || svg.parentElement;
    const cb = card.getBoundingClientRect();
    const title = (card.querySelector(".hub-panel-title,.hub-label")?.textContent || "").trim().slice(0, 26);
    svg.querySelectorAll("text").forEach((t) => {
      const r = t.getBoundingClientRect();
      if (!r.width) return;
      const L = Math.max(sb.left - r.left, cb.left - r.left);
      const R = Math.max(r.right - sb.right, r.right - cb.right);
      if (L > 1 || R > 1)
        bad.push({ card: title, text: (t.textContent || "").slice(0, 30),
                   left: +L.toFixed(1), right: +R.toFixed(1) });
    });
  });
  // keep the worst few per page
  return bad.sort((a, b2) => Math.max(b2.left, b2.right) - Math.max(a.left, a.right)).slice(0, 6);
};

let total = 0;
for (const route of ROUTES) {
  for (const w of [1440, 1100]) {
    await p.setViewport({ width: w, height: 1500 });
    try {
      await p.goto(`http://localhost:${PORT}${route}`, { waitUntil: "networkidle0", timeout: 60000 });
    } catch { console.log(`  ${route} @${w}  NAV FAILED`); continue; }
    await new Promise((r) => setTimeout(r, 1500));
    // open every disclosure so hidden charts are measured too
    await p.evaluate(() => {
      document.querySelectorAll("button").forEach((btn) => {
        if (/^\+ |show |Treemap|By manager|Combinations/i.test(btn.textContent || "")) btn.click();
      });
    });
    await new Promise((r) => setTimeout(r, 1200));
    const counts = await p.evaluate(()=>({
      svgs: document.querySelectorAll("svg").length,
      texts: document.querySelectorAll("svg text").length,
      state: (document.querySelector(".ds-state, .state-block, [data-state]")?.textContent||"").slice(0,40),
    }));
    const bad = await p.evaluate(MEASURE);
    total += bad.length;
    console.log(`  ${route} @${w}px  svgs=${counts.svgs} svgText=${counts.texts}${counts.state?" state="+counts.state:""}${bad.length?"  <-- "+bad.length+" OVERFLOW":""}`);
    if (bad.length) {
      console.log(`\n  ${route} @${w}px`);
      bad.forEach((x) => console.log(`     ${String(x.left).padStart(6)}L ${String(x.right).padStart(6)}R  [${x.card}] ${x.text}`));
    }
  }
}
console.log(total ? `\nTOTAL overflowing labels: ${total}` : "\nno overflow on any route");
await b.close(); s.close();
