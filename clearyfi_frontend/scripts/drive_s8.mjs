/*
 * §08 filing activity & disclosure events — driven against the real API.
 *
 * The section was re-scoped: five of its seven designed fields are irreducibly narrative, so the
 * filing record replaces them. What is asserted here is what those counts must not imply:
 *
 *   - every count is scoped to EDGAR's ROLLING window, and the window is stated (Apple's reaches
 *     2015, JPMorgan's covers twelve months — a count without it compares a decade to a year),
 *   - an amendment rate is a rate, never a quality score,
 *   - a "checked negative" cyber flag and a missing 8-K Item 1.05 are different claims,
 *   - the two cards that restate §06 say so instead of posing as a second finding,
 *   - the fabricated risk-diff / MD&A / outlook cards are gone, not hidden.
 *
 *   TICKERS=AAPL,TSLA,MSFT,JPM node scripts/drive_s8.mjs --dist app-dist
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import puppeteer from "puppeteer";
const DIST=resolve(process.argv[process.argv.indexOf("--dist")+1]), PORT=5196, API="http://127.0.0.1:8000";
const MIME={".html":"text/html",".js":"text/javascript",".css":"text/css",".woff2":"font/woff2"};
const s=createServer(async(rq,rs)=>{const u=new URL(rq.url,`http://localhost:${PORT}`);
  if(u.pathname.startsWith("/v1")){const r=await fetch(API+u.pathname+u.search);
    rs.writeHead(r.status,{"content-type":"application/json"});rs.end(await r.text());return;}
  let f=join(DIST,decodeURIComponent(u.pathname));
  if(!extname(u.pathname)||!existsSync(f))f=join(DIST,"index.html");
  rs.writeHead(200,{"content-type":MIME[extname(f)]??"application/octet-stream"});rs.end(await readFile(f));});
await new Promise(r=>s.listen(PORT,r));
const b=await puppeteer.launch({args:["--no-sandbox","--disable-dev-shm-usage"]});
const p=await b.newPage(); await p.setViewport({width:1440,height:3000});
let pass=0,fail=0,http429=0; const errs=[]; p.on("pageerror",e=>errs.push(e.message));
p.on("response",r=>{if(r.status()===429)http429++;});
const ck=(n,ok,d="")=>{ok?(pass++,console.log(`  ✓ ${n}`)):(fail++,console.error(`  ✗ ${n}${d?` — ${d}`:""}`));};

for (const TK of (process.env.TICKERS||"AAPL").split(",")) {
console.log(`\n── ${TK} ──`);
const enc=encodeURIComponent(TK);
const [act, audit] = await Promise.all([
  fetch(`${API}/v1/companies/${enc}/filing-activity`).then(r=>r.json()).catch(()=>null),
  fetch(`${API}/v1/companies/${enc}/audit`).then(r=>r.json()).catch(()=>null),
]);

await p.goto(`http://localhost:${PORT}/company/${TK}/overview?focal=${TK}`,{waitUntil:"networkidle0"});
await p.waitForFunction((tk)=>{
  const r=document.querySelector(".alt-content");
  if(!r||!r.childElementCount||r.querySelector(".state-loading")) return false;
  if(!document.body.innerText.includes(tk)) return false;
  return !!document.querySelector("#s8");
}, {timeout:90000}, TK);
await new Promise(r=>setTimeout(r,700));

const { section, cards, rows } = await p.evaluate(()=>{
  const sec = document.querySelector("#s8")?.closest(".hub-sec");
  const cards = {}, rows = {};
  for (const c of sec?.querySelectorAll(".p-card")||[]) {
    const label=(c.querySelector(".hub-label")?.textContent||"").trim();
    cards[label]=(c.innerText||"").replace(/\s+/g," ").trim();
    // Counted as ELEMENTS, not as occurrences of a string in the card's text: the notes beneath
    // these lists mention the same item codes, so a text match counts the caveat as a row.
    rows[label]=c.querySelectorAll(".hub-kv-row").length;
  }
  return { section:(sec?.innerText||"").replace(/\s+/g," ").trim(), cards, rows };
});
console.log("   heading:", section.slice(0, 130));

/* ---- the fabricated cards are gone, not hidden ------------------------------------------- */
ck("the section is retitled to what it now shows",
   /Filing activity & disclosure events/i.test(section), section.slice(0,80));
ck("the invented risk-factor diff is gone", !/risk factors ·|reworded/i.test(section));
ck("the invented MD&A quotes are gone", !/Management-attributed drivers/i.test(section));
ck("the invented outlook language is gone", !/Outlook language/i.test(section));
ck("the invented human-capital headcount is gone", !/Human capital/i.test(section));
ck("six cards render", Object.keys(cards).length===6, Object.keys(cards).join(" | "));

/* ---- every count carries its window ------------------------------------------------------ */
// Apple's index reaches 2015 and JPMorgan's covers a year. A count without its window would
// compare a decade against twelve months.
if (act?.status==="ok") {
  const yr = (act.covered_from||"").slice(0,4);
  ck(`the 8-K profile states its window (${yr})`,
     (cards["8-K disclosure profile"]||"").includes(yr), cards["8-K disclosure profile"]?.slice(0,120));
  ck("the form mix states its window",
     (cards["Form mix & amendments"]||"").includes(yr), cards["Form mix & amendments"]?.slice(0,120));
  ck("the note says the window is rolling, not whole history",
     /rolling window, not the company's whole history/i.test(section), section.slice(-400));
  ck("the 8-K count matches the API",
     (cards["8-K disclosure profile"]||"").includes(String(act.eight_k_count)),
     `api=${act.eight_k_count}`);
  ck("the indexed filing count matches the API",
     (cards["Form mix & amendments"]||"").includes(String(act.indexed_filings)),
     `api=${act.indexed_filings}`);

  /* ---- an amendment rate is not a quality score ---------------------------------------- */
  ck("the amendment rate is stated",
     /amended \(\d+\.\d%\)/.test(cards["Form mix & amendments"]||""),
     cards["Form mix & amendments"]?.slice(-160));
  ck("the card refuses to read the rate as quality",
     /not a quality measure/i.test(cards["Form mix & amendments"]||""),
     cards["Form mix & amendments"]?.slice(-200));

  /* ---- item codes say WHICH, never WHAT -------------------------------------------------- */
  ck("item codes say which kind of event, never what it said",
     /never what it said/i.test(section), section.slice(-400));

  /* ---- material agreements --------------------------------------------------------------- */
  const agreements = (act.material_agreements||[]).length;
  const mac = cards["Material agreements · 8-K 1.01"] || "";
  if (agreements) {
    ck(`${agreements} material agreements render`, rows["Material agreements · 8-K 1.01"]===agreements,
       `card=${(mac.match(/Item 1\.01/g)||[]).length} api=${agreements}`);
  } else {
    ck("no agreements is an absence scoped to the window",
       /No 8-K Item 1\.01 among the \d+ filings indexed/i.test(mac), mac.slice(0,160));
  }
  ck("the agreements card refuses to claim the terms",
     /Existence and date only/i.test(mac), mac.slice(-160));
}

/* ---- cybersecurity: two different claims about "was there an incident" -------------------- */
const cyb = cards["Cybersecurity · 10-K Item 1C"] || "";
const c = audit?.cybersecurity;
if (c?.status==="ok") {
  ck("the checked negative is stated as the registrant's own claim",
     /registrant states no material effect/i.test(cyb) || /HAS materially affected/i.test(cyb),
     cyb.slice(0,160));
  // A missing Item 1.05 is an unchecked box; the cyd flag is a checked one. Both are shown and
  // the card must not merge them into one sentence.
  ck("the 8-K Item 1.05 answer is separate from the flag",
     /8-K Item 1\.05/i.test(cyb), cyb.slice(0,240));
  ck("governance is listed from the flags", /Governance:/i.test(cyb), cyb.slice(0,240));
  ck("the framework line is named as untagged",
     /framework a registrant follows is not tagged/i.test(cyb), cyb.slice(-160));
  ck("no framework is ever named", !/NIST|ISO 27001/.test(cyb), cyb.slice(0,240));
} else {
  ck("an untagged filer explains itself rather than showing false",
     cyb.length>40 && !/false/i.test(cyb), cyb.slice(0,160));
}

/* ---- the two cards that restate §06 say so ------------------------------------------------ */
ck("the restatement card names §06 as its source",
   /the same 8-K Item 4\.01\/4\.02 .* §06 reads/i.test(cards["Restatement & non-reliance events"]||""),
   cards["Restatement & non-reliance events"]?.slice(-220));
ck("the tag-density card names §06 as its source",
   /the same census §06 shows/i.test(cards["Tag-set density"]||""),
   cards["Tag-set density"]?.slice(-220));
ck("the tag-density card admits it cannot show a change over time",
   /a change over time cannot be shown/i.test(cards["Tag-set density"]||""),
   cards["Tag-set density"]?.slice(-200));
ck("tag density is not called a non-GAAP count",
   !/non-GAAP adjustment count\b(?! )/.test(cards["Tag-set density"]||"") ||
   /never a non-GAAP adjustment count/i.test(cards["Tag-set density"]||""),
   cards["Tag-set density"]?.slice(-200));

// EDGAR names the ownership forms and the proposed-sale notice by bare number — 3, 4, 5, 144.
// Beside a count column "4  555" reads as two numbers, so each is checked against the payload.
const FORM_ROWS = 6, ITEM_ROWS = 7;
const numeric = (act?.forms ?? []).slice(0, FORM_ROWS).filter((f) => /^\d+(\/A)?$/.test(f.form));
const mix = cards["Form mix & amendments"] || "";
for (const f of numeric.slice(0, 6))
  ck(`form ${f.form} is named, not left a bare number`,
     mix.includes(`Form ${f.form}`), mix.slice(0, 140));
if (!numeric.length) ck("this filer's form mix has no bare-numeric form to name", true);

// TWO caps in series: the route returns a top slice and reports the rest as a residual, then the
// card shows fewer rows still. The note must count BOTH — counting only the card's cap reported
// NVIDIA as "2 further form types (15 filings)" when the truth was 24 types and 79 filings.
const hiddenFormTypes =
  Math.max(0, (act?.forms ?? []).length - FORM_ROWS) + (act?.forms_not_listed?.types ?? 0);
ck("the form mix counts BOTH caps, not just its own",
   hiddenFormTypes <= 0 || new RegExp(`${hiddenFormTypes} further form type`).test(mix),
   `expected=${hiddenFormTypes} :: ${mix.slice(-220)}`);
// The arithmetic a reader can do: shown rows + named remainder = the header's total.
const shownFilings = (act?.forms ?? []).slice(0, FORM_ROWS).reduce((a, f) => a + f.count, 0);
const namedRest = Number((/(\d[\d,]*) filings?\) not shown/.exec(mix)?.[1] || "0").replace(/,/g, ""));
ck("shown rows plus the named remainder reach the header's total",
   hiddenFormTypes <= 0 || shownFilings + namedRest === act.indexed_filings,
   `${shownFilings} + ${namedRest} vs ${act?.indexed_filings}`);

const prof = cards["8-K disclosure profile"] || "";
const hiddenItemTypes =
  Math.max(0, (act?.items ?? []).length - ITEM_ROWS) + (act?.items_not_labelled?.codes ?? 0);
ck("the 8-K profile counts unlabelled codes as well as its own cap",
   hiddenItemTypes <= 0 || new RegExp(`${hiddenItemTypes} further item type`).test(prof),
   `expected=${hiddenItemTypes} :: ${prof.slice(-220)}`);

const agr = cards["Material agreements · 8-K 1.01"] || "";
const hiddenAgr = (act?.material_agreements_total ?? 0) - (act?.material_agreements ?? []).length;
ck("uncapped agreements are named when the list is capped",
   hiddenAgr <= 0 || new RegExp(`${hiddenAgr} earlier Item 1.01`).test(agr), `hidden=${hiddenAgr}`);

ck("no page error", errs.length===0, errs[0]);
ck("no 429", http429===0);
}
console.log(`\n${pass} passed, ${fail} failed`);
await b.close(); s.close();
process.exit(fail?1:0);
