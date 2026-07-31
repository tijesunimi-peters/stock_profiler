// Per-LINE-BOX geometry of the elements whose own text matches a regex. When two elements report
// the same box on both sides but rasterise a pixel apart, the difference is inside the line box —
// line-height, half-leading, or a wrap that lands elsewhere. This is the probe that shows it.
const puppeteer = require("puppeteer");
const { URL: U, SEL, NAV, OPEN, RE, PIN, PINSEL = "#view", COL = "694", DPR = "2" } = process.env;
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
      const c = getComputedStyle(e);
      const box = e.getBoundingClientRect();
      const lines = [];
      for (const n of e.childNodes) {
        if (n.nodeType !== 3) continue;
        const r = document.createRange();
        r.selectNodeContents(n);
        for (const rect of r.getClientRects()) {
          lines.push({ y: +(rect.top - o.top).toFixed(3), h: +rect.height.toFixed(3), w: +rect.width.toFixed(3) });
        }
      }
      out.push({
        cls: (e.className || "").toString().slice(0, 30),
        y: +(box.top - o.top).toFixed(3), h: +box.height.toFixed(3),
        fs: c.fontSize, lh: c.lineHeight, font: c.fontFamily, wrap: c.textWrap, ws: c.whiteSpace,
        lines,
      });
    }
    return out;
  }, SEL, RE), null, 1));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
