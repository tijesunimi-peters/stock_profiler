// Capture ONE section, from the prototype or from our app, collapsed or expanded, at a matched
// content column AND a matched fractional origin. Replaces the ad-hoc per-section shot scripts.
//
//   proto:  URL=http://proto-srv:9000/prototype.dc.html SEL='#i2' NAV=1 OPEN=1 \
//           OUTFILE=/gt/proto-i2-open.png node shot2.js
//   ours:   URL=http://p5a-preview:8000/company/AAPL/institutional SEL='#ip-02' OPEN=1 \
//           PIN=1 FRACX=<from proto> FRACY=<from proto> OUTFILE=/gt/ours-ip-02-open.png node shot2.js
//
// Why the fractional origin: Chrome snaps line boxes to device pixels, so a half-pixel difference
// in where the section starts rounds one line of a paragraph differently from its neighbours and
// fills the diff with noise that is not a layout difference. Match the fraction, or the diff lies.
const puppeteer = require("puppeteer");
const {
  URL: U, SEL, NAV, OPEN, PIN, PINSEL = "#view", COL = "694",
  FRACX, FRACY, OUTFILE, DPR = "2", HIDESTICKY, VH = "1200", SNAP, CLICK, CLICKN = "0",
} = process.env;

const click = async (p, t) =>
  p.evaluate((t) => {
    const e = [...document.querySelectorAll("button,a,[role=button],div,span,li")].find(
      (e) => (e.innerText || "").trim() === t && e.offsetParent !== null
    );
    if (!e) return false;
    e.click();
    return true;
  }, t);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: +VH, deviceScaleFactor: +DPR });
  const errs = [];
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text()); });

  await page.goto(U, { waitUntil: "networkidle0", timeout: 120000 });
  await wait(2200);
  if (NAV === "1") {
    await click(page, "Companies");
    await wait(1200);
    await click(page, "Institutional");
    await wait(2200);
  }
  await page.waitForSelector(SEL, { timeout: 30000 });

  if (OPEN === "1") {
    const n = await page.evaluate(() => {
      const bs = [...document.querySelectorAll("button")].filter((b) =>
        /also in this section/i.test(b.innerText || "")
      );
      bs.forEach((b) => b.click());
      return bs.length;
    });
    console.log("expanders clicked:", n);
    await wait(2000);
  }

  // Optional: drive one affordance inside the section before capturing, so an OPENED state can be
  // diffed the same way a default one is.
  if (CLICK) {
    const ok = await page.evaluate((sel, label, nth) => {
      const root = document.querySelector(sel);
      const all = [...root.querySelectorAll("button,a,[role=button]")].filter(
        (e) => (e.innerText || "").replace(/\s+/g, " ").trim() === label
      );
      if (!all[nth]) return false;
      all[nth].click();
      return true;
    }, SEL, CLICK, +CLICKN);
    console.log("clicked", JSON.stringify(CLICK), ok);
    await wait(1200);
  }

  if (PIN === "1") {
    await page.evaluate((sel, t) => {
      const s = document.createElement("style");
      s.textContent = `${sel}{width:${t}px;max-width:${t}px;}`;
      document.head.appendChild(s);
    }, PINSEL, +COL);
    await wait(400);
  }

  // A section taller than the viewport is captured with captureBeyondViewport, which PAINTS every
  // position:sticky/fixed chrome element into the middle of the clip -- the topbar lands ~380px
  // down the section and fills the diff with a band that is not a layout difference. Hide them
  // (visibility, so sticky keeps its space in flow) on BOTH sides.
  if (HIDESTICKY === "1") {
    const n = await page.evaluate((sel) => {
      const sec = document.querySelector(sel);
      let k = 0;
      for (const e of document.querySelectorAll("*")) {
        if (e.contains(sec) || sec.contains(e)) continue;
        const p = getComputedStyle(e).position;
        if (p === "fixed" || p === "sticky") { e.style.visibility = "hidden"; k++; }
      }
      return k;
    }, SEL);
    console.log("sticky/fixed hidden:", n);
    await wait(300);
  }

  const el = await page.$(SEL);
  await el.evaluate((e) => e.scrollIntoView({ block: "center" }));
  await wait(500);

  const before = await page.evaluate((s) => {
    const b = document.querySelector(s).getBoundingClientRect();
    return { left: b.left, top: b.top, w: b.width, h: b.height };
  }, SEL);

  // Shift the whole column so the section's origin lands on the prototype's own fraction.
  if (FRACX !== undefined || FRACY !== undefined) {
    await page.evaluate(
      (sel, pinsel, fx, fy) => {
        const b = document.querySelector(sel).getBoundingClientRect();
        const v = document.querySelector(pinsel);
        const frac = (n) => n - Math.floor(n);
        if (fx !== null) v.style.marginLeft = (fx - frac(b.left)) + "px";
        if (fy !== null) v.style.marginTop = (fy - frac(b.top)) + "px";
      },
      SEL, PINSEL,
      FRACX === undefined ? null : +FRACX,
      FRACY === undefined ? null : +FRACY
    );
    await wait(400);
  }

  /* SNAP: park the section's top on a whole pixel in DOCUMENT space, on both sides.
   *
   * Matching the viewport-space fraction (FRACY) is not enough for a tall section. Chrome snaps
   * each paint op to the device-pixel grid independently, and that grid is anchored to the
   * document, not the viewport — so two pages whose sections sit at the same viewport offset but
   * different document offsets round some of their glyph runs up and some down. §03 showed it at
   * its worst: every DOM box, line box, wrapper and SVG matched to three decimals, the top half of
   * the capture aligned exactly, and everything below the Lorenz was exactly one CSS pixel out.
   *
   * With the document offset integral on both sides every op snaps the same way, and the clip
   * origin is integral too, so there is no resampling either. Shifts the pinned column (ours) or
   * the section itself (the prototype, which has no column to pin). */
  if (SNAP === "1") {
    await page.evaluate((sel, pinsel) => {
      const el = document.querySelector(sel);
      const target = document.querySelector(pinsel) || el;
      const docY = el.getBoundingClientRect().top + window.scrollY;
      const cur = parseFloat(getComputedStyle(target).marginTop) || 0;
      target.style.marginTop = cur - (docY - Math.floor(docY)) + "px";
    }, SEL, PINSEL);
    await wait(400);
  }

  const after = await page.evaluate((s) => {
    const b = document.querySelector(s).getBoundingClientRect();
    return { left: b.left, top: b.top, w: b.width, h: b.height };
  }, SEL);

  /* Explicit clip, not el.screenshot(). An element screenshot lets Puppeteer round the clip
   * itself, and for a section whose height lands on a half pixel it can round the SAME 3016.5px
   * box to 6034 device rows on one page and 6032 on the other — after which every glyph below is
   * rasterised half a device pixel off and the diff fills with fringing that is not a layout
   * difference. (§03 measured identical to 4 decimals on both sides while diffing at 2.4%.)
   * A floored, explicit clip is identical on both sides by construction. */
  if (OUTFILE) {
    const clip = await page.evaluate((s) => {
      const b = document.querySelector(s).getBoundingClientRect();
      return { x: b.left + window.scrollX, y: b.top + window.scrollY, width: Math.floor(b.width), height: Math.floor(b.height) };
    }, SEL);
    await page.screenshot({ path: OUTFILE, clip, captureBeyondViewport: true });
  }
  const f = (n) => +(n - Math.floor(n)).toFixed(4);
  console.log(JSON.stringify({
    sel: SEL, out: OUTFILE,
    before: { ...before, fracX: f(before.left), fracY: f(before.top) },
    after: { ...after, fracX: f(after.left), fracY: f(after.top) },
    errs,
  }, null, 1));
  await browser.close();
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
