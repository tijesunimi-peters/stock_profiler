// Full-precision heights of a section and of every direct child chain that contributes to it.
// A section can report the same 1-decimal height on both sides and still differ by a hundredth,
// which is enough to move the capture's clip by a device pixel and fill the diff with fringing.
const puppeteer = require("puppeteer");
const { URL: U, SEL, NAV, OPEN, PIN, PINSEL = "#view", COL = "694" } = process.env;
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
  await p.setViewport({ width: 1440, height: 1200, deviceScaleFactor: 2 });
  await p.goto(U, { waitUntil: "networkidle0", timeout: 120000 });
  await wait(2200);
  if (NAV === "1") { await click(p, "Companies"); await wait(1200); await click(p, "Institutional"); await wait(2200); }
  await p.waitForSelector(SEL);
  if (OPEN === "1") {
    await p.evaluate(() => [...document.querySelectorAll("button")]
      .filter((b) => /also in this section/i.test(b.innerText || "")).forEach((b) => b.click()));
    await wait(1800);
  }
  if (PIN === "1") {
    await p.evaluate((sel, t) => {
      const s = document.createElement("style");
      s.textContent = `${sel}{width:${t}px;max-width:${t}px;}`;
      document.head.appendChild(s);
    }, PINSEL, +COL);
    await wait(400);
  }
  console.log(JSON.stringify(await p.evaluate((sel) => {
    const root = document.querySelector(sel);
    const o = root.getBoundingClientRect();
    const kids = [...root.children].map((e) => {
      const r = e.getBoundingClientRect();
      return { tag: e.tagName.toLowerCase(), cls: (e.className || "").toString().slice(0, 30),
        y: +(r.top - o.top).toFixed(4), h: +r.height.toFixed(4), w: +r.width.toFixed(4) };
    });
    const svgs = [...root.querySelectorAll("svg")].map((e) => {
      const r = e.getBoundingClientRect();
      return { vb: e.getAttribute("viewBox"), y: +(r.top - o.top).toFixed(4),
        w: +r.width.toFixed(4), h: +r.height.toFixed(4) };
    });
    return { h: +o.height.toFixed(4), w: +o.width.toFixed(4), kids, svgs };
  }, SEL), null, 1));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
