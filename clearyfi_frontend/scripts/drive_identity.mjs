/**
 * Drives §01 identity against the LIVE `/v1` API — the first surface off the fixtures.
 *
 * Unlike `render_snapshot.mjs`, this one cannot assert "nothing changed": the whole point is that
 * the output changed, from a hash of the ticker to what EDGAR says. So it asserts the CONTRACT
 * instead — real values where we have them, a stated reason where we do not, a chip on exactly
 * the unsourceable rows and none of the others, and unknown never rendered as zero or absent.
 *
 * It proxies `/v1` to a running API, so it needs `--network host` and `docker compose up -d api`.
 *
 *   docker run --rm -u root --network host \
 *     -v "$PWD/clearyfi_frontend/scripts/drive_identity.mjs":/home/pptruser/drive_identity.mjs:ro \
 *     -v "$PWD/clearyfi_frontend":/app -w /home/pptruser \
 *     -e PUPPETEER_CACHE_DIR=/home/pptruser/.cache/puppeteer \
 *     ghcr.io/puppeteer/puppeteer:latest node drive_identity.mjs --dist /app/app-dist
 *
 * The two tickers are pinned with their expected values on purpose: an assertion that only checks
 * "a string is present" passes just as happily on a fixture.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import puppeteer from "puppeteer";
const A=f=>process.argv[process.argv.indexOf(f)+1];
const DIST=resolve(A("--dist")), PORT=5189, API="http://127.0.0.1:8000";
const MIME={".html":"text/html",".js":"text/javascript",".css":"text/css",".woff2":"font/woff2"};
const s=createServer(async(rq,rs)=>{
  const u=new URL(rq.url,`http://localhost:${PORT}`);
  if (u.pathname.startsWith("/v1")) {                 // the dev proxy, in miniature
    try{ const r=await fetch(API+u.pathname+u.search);
      rs.writeHead(r.status,{"content-type":"application/json"}); rs.end(await r.text());
    }catch(e){ rs.writeHead(502).end(String(e)); }
    return;
  }
  let f=join(DIST,decodeURIComponent(u.pathname));
  if(!extname(u.pathname)||!existsSync(f))f=join(DIST,"index.html");
  rs.writeHead(200,{"content-type":MIME[extname(f)]??"application/octet-stream"});rs.end(await readFile(f));
});
await new Promise(r=>s.listen(PORT,r));
const b=await puppeteer.launch({args:["--no-sandbox","--disable-dev-shm-usage"]});
const p=await b.newPage(); await p.setViewport({width:1440,height:1400});
let pass=0,fail=0; const errs=[];
p.on("pageerror",e=>errs.push(e.message)); p.on("console",m=>{if(m.type()==="error")errs.push(m.text());});
const ck=(n,ok,d="")=>{ok?(pass++,console.log(`  ✓ ${n}`)):(fail++,console.error(`  ✗ ${n}${d?` — ${d}`:""}`));};

for (const [t, expect] of [["AAPL",{sic:"3571",inc:"CA",hq:"CUPERTINO"}],["JPM",{sic:"6021",inc:"DE",hq:"NEW YORK"}]]) {
  console.log(`\n== ${t} ==`);
  await p.goto(`http://localhost:${PORT}/company/${t}/overview?focal=${t}`,{waitUntil:"networkidle0"});
  await p.waitForFunction(()=>{const r=document.querySelector(".alt-content");
    return !!r&&r.childElementCount>0&&!r.querySelector(".state-loading");},{timeout:20000});
  const rows = await p.$$eval(".hub-profile-cell", els=>els.map(e=>({
    k:e.querySelector(".hub-profile-k")?.textContent?.trim(),
    v:e.querySelector(".hub-profile-v")?.textContent?.trim(),
    reason:e.querySelector(".hub-profile-v")?.getAttribute("title")||null})));
  const get=k=>rows.find(r=>r.k===k);
  ck("all ten cover-page rows survive", rows.length===10, `${rows.length}`);
  ck(`SIC is real (${expect.sic})`, (get("SIC")?.v||"").includes(expect.sic), get("SIC")?.v);
  ck(`incorporation is real (${expect.inc})`, get("State of incorp.")?.v===expect.inc, get("State of incorp.")?.v);
  ck(`HQ is real (${expect.hq})`, (get("Headquarters")?.v||"").includes(expect.hq), get("Headquarters")?.v);
  // The chip IS the value on an unsourceable row, so the cell text is the chip's own glyph+label
  // ("∅N/A"), not a bare "N/A". Asserting the bare string was checking the old rendering.
  const isNA = (v) => /N\/A/.test(v || "");
  for (const k of ["NAICS","Employees","Independent auditor"]) {
    const r=get(k);
    ck(`${k} is N/A WITH a stated reason`, isNA(r?.v) && !!r?.reason, `${r?.v} / reason=${!!r?.reason}`);
  }
  const naChips = await p.$$eval(".hub-profile-cell .chip", e=>e.length);
  ck("a chip on every N/A row and no others", naChips===rows.filter(r=>isNA(r.v)).length, `${naChips} chips vs ${rows.filter(r=>isNA(r.v)).length} N/A rows`);
  // And a sourced row must NOT carry one — a chip on a good value is the other half of D-chips.
  const sourced = get("State of incorp.");
  ck("no chip on a sourced row", !/N\/A/.test(sourced?.v || "") && !sourced?.reason, sourced?.v);
  const subsEmpty = await p.$eval(".hub-subs-grid", el=>el.parentElement.textContent);
  ck("subsidiaries say UNKNOWN, not zero", /unknown/i.test(subsEmpty) && !/\b0 entities\b/.test(subsEmpty));
  const biz = await p.$eval(".hub-prose", e=>e.textContent);
  ck("business text is the filing record, not invented prose",
     biz.includes("SIC") && /do not parse/.test(biz), biz.slice(0,60));
}
console.log("\n== error path ==");
await p.goto(`http://localhost:${PORT}/company/ZZZZNOTREAL/overview?focal=ZZZZNOTREAL`,{waitUntil:"networkidle0"});
await new Promise(r=>setTimeout(r,800));
const errTxt = await p.$eval(".alt-content", e=>e.textContent).catch(()=>"");
ck("unknown ticker degrades to a stated error", /No filer matches|returned \d\d\d/.test(errTxt), errTxt.slice(0,80));
ck("no console/page errors beyond the deliberate 404", errs.filter(e=>!/404/.test(e)).length===0, errs.slice(0,2).join(" | "));
console.log(`\n${fail?"FAILED":"OK"} — ${pass} passed, ${fail} failed`);
await b.close(); s.close(); process.exit(fail?1:0);
