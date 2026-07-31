// Positional diff: dump every text-bearing box inside a section, relative to that section's own
// top-left, so the prototype and the port can be compared element by element instead of by eye.
//   URL=... SEL=#i1 NAV=1 OUTFILE=/out/boxes-proto.json node _boxes.js
const fs = require("fs");
const puppeteer = require("puppeteer");

const URL = process.env.URL;
const SEL = process.env.SEL;
const NAV = process.env.NAV === "1"; // prototype needs Companies -> Institutional first
const OUTFILE = process.env.OUTFILE;
const TARGET_COL = 694;

const clickByText = async (page, text) =>
  page.evaluate((t) => {
    const el = Array.from(document.querySelectorAll("button, a, [role=button], div, span, li"))
      .find((e) => (e.innerText || "").trim() === t && e.offsetParent !== null);
    if (!el) return false;
    el.click();
    return true;
  }, text);

(async () => {
  const browser = await puppeteer.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1200, deviceScaleFactor: 1 });
  await page.goto(URL, { waitUntil: "networkidle0", timeout: 120000 });
  await new Promise((r) => setTimeout(r, 2500));
  if (NAV) {
    await clickByText(page, "Companies");
    await new Promise((r) => setTimeout(r, 1200));
    await clickByText(page, "Institutional");
    await new Promise((r) => setTimeout(r, 2000));
  }
  await page.waitForSelector(SEL, { timeout: 30000 });

  let vw = 1440;
  for (let i = 0; i < 12; i++) {
    const w = await page.evaluate((s) => document.querySelector(s).getBoundingClientRect().width, SEL);
    const d = Math.round(w) - TARGET_COL;
    if (d === 0) break;
    vw -= d;
    await page.setViewport({ width: Math.round(vw), height: 1200, deviceScaleFactor: 1 });
    await new Promise((r) => setTimeout(r, 250));
  }

  const boxes = await page.evaluate((s) => {
    const root = document.querySelector(s);
    const o = root.getBoundingClientRect();
    const out = [];
    const rec = (el) => {
      const own = Array.from(el.childNodes).filter((n) => n.nodeType === 3)
        .map((n) => n.textContent.trim()).filter(Boolean).join(" ");
      const b = el.getBoundingClientRect();
      if (own) out.push({ t: own, x: +(b.left - o.left).toFixed(1), y: +(b.top - o.top).toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) });
      Array.from(el.children).forEach(rec);
    };
    rec(root);
    return { h: +root.getBoundingClientRect().height.toFixed(1), out };
  }, SEL);

  fs.writeFileSync(OUTFILE, JSON.stringify(boxes, null, 1));
  console.log(OUTFILE, "height", boxes.h, "boxes", boxes.out.length);
  await browser.close();
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
