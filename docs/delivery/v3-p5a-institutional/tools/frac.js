// Fractional heights of the boxes an image diff blames, at both device pixel ratios.
const puppeteer = require("puppeteer");
const URL = process.env.URL;
const SEL = process.env.SEL;
const NAV = process.env.NAV === "1";
const PIN = process.env.PIN === "1";

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
  for (const dsf of [1, 2]) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1200, deviceScaleFactor: dsf });
    await page.goto(URL, { waitUntil: "networkidle0", timeout: 120000 });
    await new Promise((r) => setTimeout(r, 2500));
    if (NAV) {
      await clickByText(page, "Companies");
      await new Promise((r) => setTimeout(r, 1200));
      await clickByText(page, "Institutional");
      await new Promise((r) => setTimeout(r, 2000));
    }
    if (PIN) {
      await page.evaluate(() => {
        const s = document.createElement("style");
        s.textContent = "#view{width:694px;max-width:694px;}";
        document.head.appendChild(s);
      });
      await new Promise((r) => setTimeout(r, 400));
    }
    const out = await page.evaluate((s) => {
      const root = document.querySelector(s);
      const o = root.getBoundingClientRect();
      const pick = (sel, name) => {
        const e = root.querySelector(sel);
        if (!e) return [name, null];
        const b = e.getBoundingClientRect();
        return [name, { y: +(b.top - o.top).toFixed(2), w: +b.width.toFixed(2), h: +b.height.toFixed(2) }];
      };
      const kids = Array.from(root.children).map((e, i) => {
        const b = e.getBoundingClientRect();
        return ["child" + i, { y: +(b.top - o.top).toFixed(2), w: +b.width.toFixed(2), h: +b.height.toFixed(2) }];
      });
      const cards = Array.from(root.children)[1] || root;
      return Object.fromEntries([
        ["section", { y: 0, w: +o.width.toFixed(2), h: +o.height.toFixed(2) }],
        ...kids,
        pick("button, .ip-badge", "badge"),
        pick("svg", "svg"),
      ]);
    }, SEL);
    console.log("dsf", dsf, JSON.stringify(out, null, 1));
    await page.close();
  }
  await browser.close();
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
