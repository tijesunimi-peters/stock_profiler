// Measure every element inside a section whose OWN text matches a regex: rect, font, colour, and
// the per-run widths of its text nodes. For chasing a caption that drifts mid-line (a glyph the
// declared font lacks falls back differently on each side) or a colour read off the wrong token.
//
//   URL=... SEL='#i2' NAV=1 OPEN=1 RE='quarter over quarter' node text.js
const puppeteer = require("puppeteer");
const { URL: U, SEL, NAV, OPEN, RE, PIN, PINSEL = "#view", COL = "694", DPR = "1" } = process.env;
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
  console.log(JSON.stringify(await p.evaluate((sel, re) => {
    const rx = new RegExp(re);
    const root = document.querySelector(sel);
    const o = root.getBoundingClientRect();
    const out = [];
    for (const e of root.querySelectorAll("*")) {
      const own = [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("");
      if (!own.trim() || !rx.test(own)) continue;
      const b = e.getBoundingClientRect();
      const c = getComputedStyle(e);
      // per-text-node widths, so a drift can be localised to one run
      const runs = [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => {
        const r = document.createRange();
        r.selectNodeContents(n);
        const rects = [...r.getClientRects()];
        return { t: n.textContent, w: +(rects.reduce((s, x) => s + x.width, 0)).toFixed(2) };
      });
      out.push({
        tag: e.tagName.toLowerCase(), cls: e.className && e.className.toString(),
        x: +(b.left - o.left).toFixed(2), y: +(b.top - o.top).toFixed(2),
        w: +b.width.toFixed(2), h: +b.height.toFixed(2),
        font: `${c.fontSize}/${c.lineHeight} ${c.fontWeight} ${c.fontFamily}`,
        ls: c.letterSpacing, color: c.color, runs,
      });
    }
    return out;
  }, SEL, RE), null, 1));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
