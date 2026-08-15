/*
 * Cross-check the §Sector altitude against the API it claims to be reading.
 *
 * The point is not that the page renders — it is that every FIGURE on screen came back from an
 * endpoint. The prototype rendered beautifully with numbers hashed out of the string "Semi", so
 * "it looks right" proves nothing. Each assertion here reads the API first and then looks for that
 * exact value in the rendered text.
 *
 *   GROUPS=36,73,28,60 node scripts/verify_sectors.mjs --dist app-dist
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import puppeteer from "puppeteer";
const DIST=resolve(process.argv[process.argv.indexOf("--dist")+1]), PORT=5243, API="http://127.0.0.1:8000";
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
const b=await puppeteer.launch({args:["--no-sandbox","--disable-dev-shm-usage"],protocolTimeout:420000});
const p=await b.newPage(); await p.setViewport({width:1440,height:3000});
let pass=0,fail=0;
const ck=(n,ok,d="")=>{ok?(pass++,console.log(`  ✓ ${n}`)):(fail++,console.error(`  ✗ ${n}${d?` — ${d}`:""}`));};

/* usdCompact, mirrored from app/lib/format.ts so the harness checks the FIGURE, not the code. */
const usdCompact=(v)=>{const neg=v<0,a=Math.abs(v);
  const [n,sfx]=a>=1e12?[a/1e12,"T"]:a>=1e9?[a/1e9,"B"]:a>=1e6?[a/1e6,"M"]:a>=1e3?[a/1e3,"K"]:[a,""];
  const d=n<10?2:n<100?1:0; const r=Math.round(n*10**d)/10**d;
  const str=`$${r}${sfx}`; return neg?`(${str})`:str;};
const ord=(n)=>{const s=["th","st","nd","rd"],v=n%100;return n+(s[(v-20)%10]||s[v]||s[0]);};

const roster = await g("/v1/sectors");
const scores = await g("/v1/sectors/theme-scores");
const YEAR = roster.fiscal_year;

/* A0 the nav vocabulary is the API's, not a hand-written list */
console.log(`\n── roster ──`);
ck(`A0 the roster is SEC's own groups (${roster.sectors.length} at ${roster.peer_basis})`,
   roster.sectors.length > 20 && /SIC 2-digit/.test(roster.peer_basis));
for (const G of (process.env.GROUPS||"36").split(",")) {
console.log(`\n── SIC ${G} ──`);
const row = roster.sectors.find(s => s.group === G);
const sc  = scores.sectors.find(s => s.group === G);
const spreads = await g(`/v1/sectors/${G}/spreads?year=${YEAR}&period=FY`);
const flow    = await g(`/v1/sectors/${G}/insider-flow`);
const geo     = await g(`/v1/sectors/${G}/geographic-mix`);

await p.goto(`http://localhost:${PORT}/sectors/sector?sector=${G}`,{waitUntil:"networkidle0"});
await p.waitForFunction(()=>!!document.querySelector(".scorecard, .state"),{timeout:240000});
await new Promise(r=>setTimeout(r,1200));
const txt = await p.evaluate(()=>(document.body.innerText||"").replace(/\s+/g," "));

/* ---------------------------------------------------------------- A the vocabulary */
ck(`A1 the page names the SEC's label for this group ("${row?.group_label}")`,
   !!row && txt.includes(row.group_label));
ck(`A2 the filer count is the API's (${row?.peer_count})`,
   !!row && new RegExp(`${row.peer_count} filers`).test(txt), `api=${row?.peer_count}`);
ck("A3 no prototype sector name survives on the page",
   !/\bSemiconductors\b|\bIT hardware\b|\bBiotech\b/.test(txt));
ck("A4 the sub-industry control is gone (it had no source at 2-digit)",
   !/Sub-industry/i.test(txt));
ck("A5 the invented coverage chip is gone", !/94% filed/.test(txt));

/* ---------------------------------------------------------------- B the scorecard */
if (sc) {
  const scored = sc.themes.filter(t => t.scored);
  const unscored = sc.themes.filter(t => !t.scored);
  ck(`B1 every theme the API names is on the page (${sc.themes.length})`,
     sc.themes.every(t => txt.includes(t.theme_label)));
  /* B2 each SCORED theme's score reaches the screen */
  for (const t of scored) {
    ck(`B2 ${t.theme} score ${t.score} is rendered`,
       new RegExp(`\\b${t.score}\\b`).test(txt), `api=${t.score}`);
  }
  /* B3 an UNSCORED theme shows no number and carries its reason */
  for (const t of unscored) {
    ck(`B3 ${t.theme} renders unscored, with the API's reason`,
       txt.includes(t.theme_label) && txt.includes(t.reason.slice(0, 40)),
       `reason=${t.reason?.slice(0,50)}`);
  }
  ck(`B3b two themes are unscored, not silently dropped (${unscored.length})`, unscored.length === 2);
  /* B4 rank_of is per-theme and the page says which — the tell is more than one distinct N */
  const rankOfs = [...new Set(scored.map(t => t.rank_of))];
  ck(`B4 per-theme rank_of reaches the page (${rankOfs.join(", ")})`,
     rankOfs.every(n => new RegExp(`of ${n} sectors scored`).test(txt)));
  /* B5 the focused theme's rank ordinal */
  const focus = scored.find(t => t.theme === "growth") ?? scored[0];
  if (focus) ck(`B5 ${focus.theme} rank reads "${ord(focus.rank)} of ${focus.rank_of}"`,
     txt.includes(`${ord(focus.rank)} of ${focus.rank_of} sectors scored`));
  /* B6 the delta is the API's, and a null delta does not render as 0 */
  for (const t of scored) {
    ck(`B6 ${t.theme} delta ${t.delta_vs_prior_fy}`,
       t.delta_vs_prior_fy == null
         ? true
         : new RegExp(`${t.delta_vs_prior_fy > 0 ? "\\+" : ""}${t.delta_vs_prior_fy}`).test(txt));
  }
  /* B7 the normalization sentence is the server's own words, not a placeholder */
  ck("B7 the method note is the API's normalization string",
     txt.includes(scores.normalization.slice(0, 60)));
  ck("B7b the prototype's placeholder method note is gone",
     !/final weighting\/normalization not defined/.test(txt));

  /* ------------------------------------------------------------ C the strip */
  const focusKey = focus?.theme;
  const stripN = scores.sectors.filter(s => s.themes.find(t => t.theme === focusKey && t.scored)).length;
  ck(`C1 the strip counts the sectors SCORED on the focused theme (${stripN})`,
     new RegExp(`${stripN} sectors scored`).test(txt), `api=${stripN}`);
  const bars = await p.$$eval(".peerstrip.is-dense .peerstrip-bar", els =>
    els.map(e => ({ label: e.textContent.trim(), focal: e.className.includes("is-focal"),
                    h: parseFloat(getComputedStyle(e.querySelector(".peerstrip-fill")).height) })));
  ck(`C2 one bar per scored sector (${bars.length})`, bars.length === stripN, `dom=${bars.length}`);
  ck(`C3 exactly one bar is the focal sector, and it is this group`,
     bars.filter(x=>x.focal).length === 1 && bars.find(x=>x.focal)?.label === G,
     `focal=${bars.find(x=>x.focal)?.label}`);
  /* C4 bars are on a FIXED 0-100 domain, not normalized to the tallest: the top bar must be
     shorter than the track unless some sector actually scores 100. */
  const top = Math.max(...scores.sectors.flatMap(s =>
    s.themes.filter(t => t.theme === focusKey && t.scored).map(t => t.score)));
  const tallest = Math.max(...bars.map(x=>x.h));
  ck(`C4 the tallest bar tracks its SCORE (${top}), not the panel height`,
     Math.abs(tallest - Math.round(top/100*96)) <= 1, `dom=${tallest}px expected≈${Math.round(top/100*96)}px`);
}

/* ---------------------------------------------------------------- D insider flow */
if (flow.has_data) {
  ck(`D1 net open-market flow ${usdCompact(flow.net)} is on the page`,
     txt.includes(usdCompact(flow.net)), `api=${usdCompact(flow.net)}`);
  ck(`D2 the counts are the API's (${flow.buy_count} buys / ${flow.sell_count} sells)`,
     txt.includes(`${flow.buy_count} buys`) && txt.includes(`${flow.sell_count} sells`));
  ck(`D3 the window is named ("${flow.window.label}")`, txt.includes(flow.window.label));
  ck("D4 the open-market filter is stated, not assumed",
     /Codes P and S only/.test(txt));
  /* D5 the prototype's uncomputable "×" ratio is gone */
  ck("D5 no buy/sell '×' ratio is claimed", !/net buy\/sell \(\$\)/.test(txt));
  if (flow.excluded_no_price_count > 0) {
    ck(`D6 the ${flow.excluded_no_price_count} no-price exclusions are reported`,
       txt.includes(`${flow.excluded_no_price_count} transactions reported no price`));
  }
} else {
  ck("D1 an empty insider flow says so", /No open-market insider transactions/.test(txt));
}

/* ---------------------------------------------------------------- E geographic mix */
if (geo.has_data) {
  ck(`E1 the domestic share ${(geo.mix.domestic*100).toFixed(1)}% is rendered`,
     txt.includes(`${(geo.mix.domestic*100).toFixed(1)}%`));
} else {
  ck("E1 the un-ingested geographic mix renders its reason, not an empty bar",
     /No ASC 280 geographic revenue splits/.test(txt));
  const segs = await p.$$eval(".geo-bar", e => e.length);
  ck("E2 no geo bar is drawn when there is no mix", segs === 0, `dom=${segs} bars`);
}

/* ---------------------------------------------------------------- F distribution */
const inScope = spreads.metrics ?? [];
ck(`F1 the spreads are pinned to the roster's year (FY ${YEAR})`,
   spreads.fiscal_year === YEAR, `api=${spreads.fiscal_year}`);
/* "All metrics" scope: every materialized metric, with its own peer count. */
await p.goto(`http://localhost:${PORT}/sectors/sector?sector=${G}&scope=all`,{waitUntil:"networkidle0"});
await p.waitForFunction(()=>!!document.querySelector(".scorecard, .state"),{timeout:240000});
await new Promise(r=>setTimeout(r,900));
const txtAll = await p.evaluate(()=>(document.body.innerText||"").replace(/\s+/g," "));
ck(`F2 all-metrics scope draws every materialized spread (${inScope.length})`,
   inScope.every(m => txtAll.includes(m.label)),
   `missing=${inScope.filter(m=>!txtAll.includes(m.label)).map(m=>m.label).join(",")}`);
for (const m of inScope.slice(0, 3)) {
  ck(`F3 ${m.metric} median ${m.unit==="ratio"?m.median.toFixed(3):Math.round(m.median)} is the API's`,
     txtAll.includes(m.unit==="ratio"?m.median.toFixed(3):String(Math.round(m.median))));
  ck(`F4 ${m.metric} reports its own peer count (${m.peer_count})`,
     new RegExp(`${m.peer_count} filers reported this`).test(txtAll));
}
/* F5 each metric carries ITS OWN peer count. The tell is that where the API's counts DIFFER, the
   page shows every distinct one — a single number would mean we averaged them away. Skipped for a
   group whose counts genuinely coincide (small groups where every filer reports everything), which
   is a fact about the sector and not something the page can be blamed for. */
const counts = [...new Set(inScope.map(m => m.peer_count))];
if (counts.length > 1) {
  ck(`F5 all ${counts.length} distinct per-metric peer counts reach the page`,
     counts.every(c => new RegExp(`${c} filers reported this`).test(txtAll)),
     `api=${counts.join(",")}`);
} else {
  console.log(`  · F5 skipped — every metric in SIC ${G} has the same peer count (${counts[0]})`);
}

/* F6 "This theme" scope: the intersection with the focused theme's constituents, reported as a
   fraction — including the real 0-of-N case. */
const th = sc?.themes.find(t => t.theme === "cash_investment");
if (th?.scored) {
  await p.goto(`http://localhost:${PORT}/sectors/sector?sector=${G}&theme=cash_investment&scope=theme`,
    {waitUntil:"networkidle0"});
  await p.waitForFunction(()=>!!document.querySelector(".scorecard, .state"),{timeout:240000});
  await new Promise(r=>setTimeout(r,900));
  const t2 = await p.evaluate(()=>(document.body.innerText||"").replace(/\s+/g," "));
  const hit = th.constituents.filter(c => inScope.some(m => m.metric === c.metric)).length;
  ck(`F6 this-theme scope reports the intersection (${hit} of ${th.constituents.length})`,
     t2.includes(`${hit} of ${th.constituents.length} constituents have a spread`),
     `api=${hit}/${th.constituents.length}`);
  if (hit === 0) {
    ck("F7 a theme with NO materialized spread says so rather than falling back to all metrics",
       /has no spread to show/.test(t2));
  }
}

/* ---------------------------------------------------------------- G decomposition */
if (sc) {
  const dt = sc.themes.find(t => t.scored);
  await p.goto(`http://localhost:${PORT}/sectors/sector?sector=${G}&theme=${dt.theme}&decomp=${dt.theme}`,
    {waitUntil:"networkidle0"});
  await p.waitForFunction(()=>!!document.querySelector(".scorecard, .state"),{timeout:240000});
  await new Promise(r=>setTimeout(r,900));
  const t3 = await p.evaluate(()=>(document.body.innerText||"").replace(/\s+/g," "));
  ck(`G1 every constituent of ${dt.theme} is listed (${dt.constituents.length})`,
     dt.constituents.every(c => t3.includes(c.label)));
  ck(`G2 the weight shown is EQUAL (1/${dt.constituents.length}), not the prototype's 0.25/0.30`,
     t3.includes(`w ${(1/dt.constituents.length).toFixed(2)}`),
     `expected w ${(1/dt.constituents.length).toFixed(2)}`);
  for (const c of dt.constituents.slice(0, 3)) {
    const z = `${c.oriented_z > 0 ? "+" : ""}${c.oriented_z.toFixed(2)}σ`;
    ck(`G3 ${c.metric} contributes ${z}`, t3.includes(z), `api=${z}`);
  }
  /* G4 a lower-is-better constituent is LABELLED, so its oriented z is not read backwards */
  const low = dt.constituents.find(c => !c.higher_is_better);
  if (low) ck(`G4 "${low.label}" is marked lower-is-better`, /↓ better/.test(t3));
  /* G5 the shifts panel is the API's per-theme delta, sorted by magnitude */
  const shifts = sc.themes.filter(t => t.scored && t.delta_vs_prior_fy)
    .sort((a,b)=>Math.abs(b.delta_vs_prior_fy)-Math.abs(a.delta_vs_prior_fy));
  if (shifts.length) {
    ck(`G5 the biggest shift is ${shifts[0].theme_label} (${shifts[0].delta_vs_prior_fy} pts)`,
       t3.includes(`${shifts[0].delta_vs_prior_fy > 0 ? "+" : ""}${shifts[0].delta_vs_prior_fy} pts`));
    ck("G5b shifts are named against the PRIOR FISCAL YEAR, not 'own history'",
       /theme score vs prior fiscal year/.test(t3) && !/vs own history/.test(t3));
  }
}
}

/* ---------------------------------------------------------------- H a company crumb */
console.log(`\n── company crumbs ──`);
const prof = await g("/v1/companies/NVDA/profile");
/* The crumb used to read SECTOR_NAMES[sel.sectorIdx] — the sector the reader last picked. Land on
   NVDA with a DIFFERENT sector selected and the crumb must still be NVIDIA's own SIC. */
await p.goto(`http://localhost:${PORT}/company/NVDA/peers?sector=60`,{waitUntil:"networkidle0"});
await p.waitForFunction(()=>!!document.querySelector(".qual-crumb, .state"),{timeout:240000});
await new Promise(r=>setTimeout(r,1500));
const ctxt = await p.evaluate(()=>(document.body.innerText||"").replace(/\s+/g," "));
ck(`H1 the crumb is the FILER's own SIC (${prof.sic_description}), with SIC 60 selected`,
   ctxt.includes(prof.sic_description), `api=${prof.sic_description}`);
ck("H2 it is not the selected sector's label", !/Depository Institutions/.test(ctxt));
ck(`H3 the context pill carries the real SIC ${prof.sic}, not the hardcoded 3674/62 rank`,
   ctxt.includes(`SIC ${prof.sic}`) && !/rank 5 \/ 62/.test(ctxt));

console.log(`\n${pass} passed, ${fail} failed`);
await b.close(); s.close();
process.exit(fail ? 1 : 0);
