// P1e — capture OUR ported §01 at the prototype's own 694px content column, so the two PNGs
// can be diffed at 1:1 without rescaling. Also reports console/page errors and the measured
// geometry of every primitive, for a numeric diff against literals.json.
const fs = require("fs");
const puppeteer = require("puppeteer");

const BASE = process.env.BASE_URL || "http://p5a-preview:8000";
const OUT = "/out";
const TARGET_COL = 694;

(async () => {
  const browser = await puppeteer.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1200, deviceScaleFactor: 2 });
  const errs = [];
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text()); });
  page.on("requestfailed", (r) => errs.push("requestfailed: " + r.url()));

  await page.goto(`${BASE}/company/AAPL/institutional`, { waitUntil: "networkidle0", timeout: 90000 });
  await page.waitForSelector("#ip-01", { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1200));

  // Pin the content column to the prototype's exact 694px. Done by fixing the column's width
  // rather than by resizing the window: the window can only land on whole pixels, so a
  // resize-to-fit converges on 694 ± half a pixel, and that fraction re-rasterises every glyph
  // below the first wrapping row — which reads as a 1px layout drift in an image diff and is not
  // one. Anything the section itself gets wrong still shows.
  await page.evaluate((t) => {
    const s = document.createElement("style");
    s.textContent = `#view{width:${t}px;max-width:${t}px;}`;
    document.head.appendChild(s);
  }, TARGET_COL);
  await new Promise((r) => setTimeout(r, 400));

  // Land the section's origin on a whole device pixel. Our shell puts it at x=546.59; the
  // prototype's is at x=436. Text rasterised half a pixel off renders every glyph with a faint
  // antialiasing ghost, which fills an image diff with noise that isn't a layout difference.
  // Structure (rules, borders, dots) is unaffected either way — this only makes the diff readable.
  await page.evaluate(() => {
    const r = document.querySelector("#ip-01").getBoundingClientRect();
    const v = document.querySelector("#view");
    v.style.marginLeft = -(r.left - Math.floor(r.left)) + "px";
    // Same fractional origin as the prototype's section (left 436.0, top 324.5) — not merely a
    // whole pixel. Chrome snaps each line box to device pixels, so a half-pixel difference in the
    // block's origin can round one line of a paragraph a pixel differently from its neighbours.
    v.style.marginTop = -(r.top - Math.floor(r.top) - 0.5) + "px";
  });
  await new Promise((r) => setTimeout(r, 300));

  const geo = await page.evaluate(() => {
    const r = (s) => {
      const e = document.querySelector(s);
      if (!e) return null;
      const b = e.getBoundingClientRect();
      return { w: Math.round(b.width), h: Math.round(b.height) };
    };
    const col = document.querySelector("#ip-01").getBoundingClientRect().width;
    const cs = (s, p) => {
      const e = document.querySelector(s);
      if (!e) return null;
      const c = getComputedStyle(e);
      const o = {};
      p.forEach((k) => (o[k] = c[k]));
      return o;
    };
    return {
      viewport: window.innerWidth,
      column: Math.round(col),
      section: r("#ip-01"),
      edgeCard: r("#ip-01 .ip-card--edge"),
      strip: r("#ip-01 .ip-strip"),
      vrule: r("#ip-01 .ip-vrule"),
      card2: r("#ip-01 .ip-card:not(.ip-card--edge)"),
      tint: r("#ip-01 .ip-tint"),
      chart: r("#ip-01 .ip-db"),
      tiles: r("#ip-01 .ip-tiles"),
      tile1: r("#ip-01 .ip-tile"),
      badge: r("#ip-01 .ip-badge"),
      expBtn: r("#ip-01 .ip-expander-btn"),
      head: cs("#ip-01 .ip-sec-head", ["borderBottom", "paddingBottom", "marginBottom", "gap"]),
      micro: cs("#ip-01 .ip-micro", ["fontSize", "letterSpacing", "color", "fontFamily"]),
      tileVal: cs("#ip-01 .ip-tile-val", ["fontSize", "lineHeight", "borderBottom", "fontWeight"]),
      text: document.querySelector("#ip-01").innerText,
    };
  });

  fs.writeFileSync(`${OUT}/ours-i1-geometry.json`, JSON.stringify({ geo, errs }, null, 1));

  const el = await page.$("#ip-01");
  await el.evaluate((e) => e.scrollIntoView({ block: "center" }));
  await new Promise((r) => setTimeout(r, 400));
  await el.screenshot({ path: `${OUT}/ours-i1.png` });
  await page.screenshot({ path: `${OUT}/ours-institutional-full.png`, fullPage: true });

  console.log(JSON.stringify({ ...geo, text: undefined }, null, 1));
  console.log("=== TEXT ===\n" + geo.text);
  console.log("=== ERRORS ===\n" + JSON.stringify(errs, null, 1));
  await browser.close();
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
