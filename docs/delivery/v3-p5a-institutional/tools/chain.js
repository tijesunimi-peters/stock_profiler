// Walk from an anchor element (the Nth <svg>, or the first element matching TEXT) up to the
// section, printing every ancestor's box, margins, padding and border — and then the anchor's
// following siblings. For the case where every text box matches and the raster still disagrees:
// the difference is in a WRAPPER, which no text-based probe can see.
const puppeteer = require("puppeteer");
const { URL: U, SEL, NAV, OPEN, PIN, PINSEL = "#view", COL = "694", DPR = "2", SVGN = "0" } = process.env;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const click = async (p, t) =>
  p.evaluate((t) => {
    const e = [...document.querySelectorAll("button,a,[role=button],div,span,li")].find(
      (e) => (e.innerText || "").trim() === t && e.offsetParent !== null
    );
    if (!e) return false;
    e.click();
    return true;
  }, t);

(async () => {
  const b = await puppeteer.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 1200, deviceScaleFactor: +DPR });
  await p.goto(U, { waitUntil: "networkidle0", timeout: 120000 });
  await wait(2200);
  if (NAV === "1") { await click(p, "Companies"); await wait(1200); await click(p, "Institutional"); await wait(2200); }
  await p.waitForSelector(SEL);
  if (OPEN === "1") {
    await p.evaluate(() => [...document.querySelectorAll("button")]
      .filter((b) => /also in this section/i.test(b.innerText || "")).forEach((b) => b.click()));
    await wait(1500);
  }
  if (PIN === "1") {
    await p.evaluate((sel, t) => {
      const s = document.createElement("style");
      s.textContent = `${sel}{width:${t}px;max-width:${t}px;}`;
      document.head.appendChild(s);
    }, PINSEL, +COL);
    await wait(400);
  }
  console.log(JSON.stringify(await p.evaluate((sel, n) => {
    const root = document.querySelector(sel);
    const o = root.getBoundingClientRect();
    const svg = root.querySelectorAll("svg")[n];
    const info = (e, tag) => {
      const r = e.getBoundingClientRect();
      const c = getComputedStyle(e);
      return {
        what: tag, tag: e.tagName.toLowerCase(), cls: (e.className || "").toString().slice(0, 28),
        y: +(r.top - o.top).toFixed(3), h: +r.height.toFixed(3),
        mt: c.marginTop, mb: c.marginBottom, pt: c.paddingTop, pb: c.paddingBottom,
        bt: c.borderTopWidth, bb: c.borderBottomWidth, disp: c.display, lh: c.lineHeight,
        fs: c.fontSize, va: c.verticalAlign,
      };
    };
    const out = [];
    let e = svg;
    while (e && e !== root) { out.push(info(e, "ancestor")); e = e.parentElement; }
    out.reverse();
    let s = svg.parentElement.nextElementSibling;
    let k = 0;
    while (s && k < 4) { out.push(info(s, "sibling+" + ++k)); s = s.nextElementSibling; }
    return out;
  }, SEL, +SVGN), null, 1));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
