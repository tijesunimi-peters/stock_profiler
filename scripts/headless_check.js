// Headless render check for the Profin data pages, run inside the puppeteer Docker image
// (see docker-compose.yml's `e2e` profile). Loads each page in real Chromium, fails on any
// console/page/request error, and writes a full-height screenshot per page for eyeballing.
//
// Config via env:
//   BASE_URL  base of the running app          (default http://localhost:8000)
//   OUT_DIR   where screenshots are written    (default /out)
//   PAGES     "name=path,name=path" overrides  (default: company/coverage/components)
const puppeteer = require("puppeteer");

const BASE = (process.env.BASE_URL || "http://localhost:8000").replace(/\/$/, "");
const OUT = process.env.OUT_DIR || "/out";
const PAGES = process.env.PAGES
  ? process.env.PAGES.split(",").map((p) => {
      const i = p.indexOf("="); // split on the FIRST '=' so query strings survive
      return [p.slice(0, i), p.slice(i + 1)];
    })
  : [
      ["company", "/company/AAPL"],
      ["trend", "/company/AAPL?trend=net_margin"],
      ["institutional", "/company/AAPL?tab=institutional"],
      ["manager", "/manager/1067983"],
      ["compare", "/compare?symbols=AAPL,JPM,WMT"],
      ["coverage", "/coverage"],
      ["components", "/components"],
    ];

(async () => {
  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    defaultViewport: { width: 1280, height: 1400 },
  });
  let failed = false;
  for (const [name, path] of PAGES) {
    const url = BASE + path;
    const page = await browser.newPage();
    const errs = [];
    page.on("console", (m) => { if (m.type() === "error") errs.push("console.error: " + m.text()); });
    page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
    page.on("requestfailed", (r) => errs.push("requestfailed: " + r.url() + " " + (r.failure() || {}).errorText));
    try {
      await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 });
      await new Promise((r) => setTimeout(r, 1500)); // let async renders settle
      await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
      console.log(`[${name}] rendered "${await page.title()}" (${url}), errors=${errs.length}`);
      errs.forEach((e) => console.log("    " + e));
      if (errs.length) failed = true;
    } catch (e) {
      console.log(`[${name}] FAILED (${url}): ${e.message}`);
      failed = true;
    }
    await page.close();
  }
  await browser.close();
  console.log(failed ? "HEADLESS CHECK: FAIL" : "HEADLESS CHECK: PASS");
  process.exit(failed ? 1 : 0);
})();
