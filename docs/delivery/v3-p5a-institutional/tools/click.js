// Click one affordance in the prototype (or ours) and report what it DID: which elements appeared,
// which disappeared, what changed class/attribute, plus a viewport screenshot of the result.
// The only honest way to port an interaction -- the markup does not say what a control opens.
//
//   URL=... SEL='#i3' NAV=1 LABEL='⤡ Expand' NTH=0 OUTFILE=/gt/x.png node click.js
const fs = require("fs");
const puppeteer = require("puppeteer");
const { URL: U, SEL, NAV, OPEN, LABEL, LABEL2, NTH = "0", OUTFILE, DPR = "1", FULL } = process.env;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const clickText = async (p, t) =>
  p.evaluate((t) => {
    const e = [...document.querySelectorAll("button,a,[role=button],div,span,li")].find(
      (e) => (e.innerText || "").trim() === t && e.offsetParent !== null
    );
    if (!e) return false;
    e.click();
    return true;
  }, t);

const snapshot = (p) =>
  p.evaluate(() => {
    const out = [];
    let i = 0;
    for (const e of document.querySelectorAll("body *")) {
      e.dataset.ckId = e.dataset.ckId || "ck" + i++;
      const r = e.getBoundingClientRect();
      out.push([e.dataset.ckId, e.tagName.toLowerCase(),
        (e.className || "").toString().slice(0, 40),
        Math.round(r.width) + "x" + Math.round(r.height),
        (e.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60),
        getComputedStyle(e).position + "|" + getComputedStyle(e).zIndex]);
    }
    return out;
  });

(async () => {
  const b = await puppeteer.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 1200, deviceScaleFactor: +DPR });
  await p.goto(U, { waitUntil: "networkidle0", timeout: 120000 });
  await wait(2200);
  if (NAV === "1") { await clickText(p, "Companies"); await wait(1200); await clickText(p, "Institutional"); await wait(2200); }
  await p.waitForSelector(SEL);
  if (OPEN === "1") {
    await p.evaluate(() => [...document.querySelectorAll("button")]
      .filter((b) => /also in this section/i.test(b.innerText || "")).forEach((b) => b.click()));
    await wait(1500);
  }

  const before = await snapshot(p);
  const hit = await p.evaluate((sel, label, nth) => {
    const root = document.querySelector(sel);
    const all = [...root.querySelectorAll("button,a,[role=button]")].filter(
      (e) => (e.innerText || "").replace(/\s+/g, " ").trim() === label
    );
    const e = all[nth];
    if (!e) return { found: all.length, clicked: false };
    e.scrollIntoView({ block: "center" });
    e.click();
    return { found: all.length, clicked: true, tag: e.tagName.toLowerCase(), title: e.getAttribute("title") };
  }, SEL, LABEL, +NTH);
  await wait(1200);
  // optional second click (a toggle's other half — its label usually changed, so pass LABEL2)
  if (LABEL2) {
    await p.evaluate((sel, label) => {
      const root = document.querySelector(sel);
      const e = [...root.querySelectorAll("button,a,[role=button]")].find(
        (e) => (e.innerText || "").replace(/\s+/g, " ").trim() === label
      );
      if (e) e.click();
    }, SEL, LABEL2);
    await wait(1200);
  }
  const after = await snapshot(p);

  const bm = new Map(before.map((r) => [r[0], r]));
  const am = new Map(after.map((r) => [r[0], r]));
  const added = after.filter((r) => !bm.has(r[0]));
  const removed = before.filter((r) => !am.has(r[0]));
  const changed = after.filter((r) => bm.has(r[0]) && JSON.stringify(bm.get(r[0]).slice(2)) !== JSON.stringify(r.slice(2)));

  console.log(JSON.stringify({ hit, addedCount: added.length, removedCount: removed.length, changedCount: changed.length }, null, 1));
  console.log("\n--- ADDED (first 40) ---");
  added.slice(0, 40).forEach((r) => console.log("  ", r[1], "|", r[2], "|", r[3], "|", r[5], "|", JSON.stringify(r[4])));
  console.log("\n--- REMOVED (first 15) ---");
  removed.slice(0, 15).forEach((r) => console.log("  ", r[1], "|", r[2], "|", r[3], "|", JSON.stringify(r[4])));
  console.log("\n--- CHANGED (first 25) ---");
  changed.slice(0, 25).forEach((r) => console.log("  ", r[1], "|", r[2], "|", r[3], "|", JSON.stringify(r[4])));

  if (OUTFILE) await p.screenshot({ path: OUTFILE, fullPage: FULL === "1" });
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
