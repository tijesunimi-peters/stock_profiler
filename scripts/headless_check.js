// Headless render check for the ClearyFi data pages, run inside the puppeteer Docker image
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
      // The Data Explorer merged into the company hub's Statements tab (2026-07-17);
      // the first entry goes through the old /explorer URL to exercise the redirect.
      ["statements-balance", "/explorer?symbol=AAPL&statement=balance"],
      ["statements-income", "/company/AAPL?tab=statements&stmt=income"],
      // Income-statement chart view (waterfall bridge + common-size): two filer shapes.
      ["statements-income-chart", "/company/AAPL?tab=statements&stmt=income"],
      ["statements-income-chart-wmt", "/company/WMT?tab=statements&stmt=income"],
      // Balance-sheet chart view (capital-structure trend + working-capital bridge + matrix):
      // AAPL (clean, negative working capital) and WMT (derives liabilities for the trend).
      ["statements-balance-chart", "/company/AAPL?tab=statements&stmt=balance"],
      ["statements-balance-chart-wmt", "/company/WMT?tab=statements&stmt=balance"],
      // Cash-flow chart view (cash bridge + FCF breakdown + earnings quality): AAPL and WMT.
      // Single-period fixtures -> the bridge renders the honest relative walk (absolute=false).
      ["statements-cashflow-chart", "/company/AAPL?tab=statements&stmt=cashflow"],
      ["statements-cashflow-chart-wmt", "/company/WMT?tab=statements&stmt=cashflow"],
      ["statements-segments", "/company/AAPL?tab=statements&stmt=segments"],
      ["trend", "/company/AAPL?trend=net_margin"],
      ["institutional", "/company/AAPL?tab=institutional"],
      // JPM's holders have no reported location -> exercises the holder-geography EMPTY STATE
      // (no-mappable-location -> honest note + tallies, never a blank map). Regression guard for
      // docs/delivery/institutional-tab-viz/4-qa.md round 3.
      ["institutional-nolocation", "/company/JPM?tab=institutional"],
      ["manager", "/manager/1067983"],
      ["compare", "/compare?symbols=AAPL,JPM,WMT"],
      ["trajectories", "/compare?symbols=AAPL,JPM,WMT&view=trajectories&metric=net_margin"],
      ["screen", "/screen?view=rank&concept=revenue&year=2024&sort=desc&limit=25"],
      // Single-sector overview (redesign Phase 1): the DEFAULT landing (selector spine + the
      // largest sector's DuPont tree), a sector selected via ?group= (tree + 5Y trend + per-sector
      // spreads), the lifecycle trend, the selector combobox OPEN, and an unknown ?group= that
      // falls back to the default with a muted note (never a broken page).
      // sectors (group 73) now leads with the composite scorecard (5 scored + 2 deferred tiles)
      // above the DuPont body; group 60 (banks) shows 4 scored + 2 deferred (op-efficiency omitted).
      ["sectors", "/sectors"],
      ["sectors-selected", "/sectors?group=60&range=5y"],
      // A working-capital sector selected to the DIO/DSO/DPO/CCC lifecycle trend -- group 73
      // (services) has a NEGATIVE CCC, and the "all" range shows the ~ approximate affordance.
      ["sectors-lifecycle", "/sectors?group=73&range=all"],
      // Open the sector combobox (exercises the client-side filter + keyboard-less render path).
      ["sectors-selector", "/sectors"],
      // Unknown group -> honest fallback to the default sector with the "not found" note.
      ["sectors-unknown-group", "/sectors?group=99"],
      // Click a score to open its inline decomposition (constituents + oriented-z contributions).
      ["sectors-decomp", "/sectors?group=73"],
      // A sector with NO theme scores -> the honest empty-scorecard state (DuPont still below).
      ["sectors-scorecard-empty", "/sectors?group=52"],
      // Expand a theme (tile body) -> peer strip + drill-down follow it. Financial health = a
      // POPULATED drill-down (4/4 constituents have a distribution); Cash & investment = the honest
      // EMPTY drill-down (its constituents have no distribution).
      ["sectors-drilldown-fh", "/sectors?group=73"],
      ["sectors-drilldown-empty", "/sectors?group=73"],
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
      if (name === "statements-balance") {
        // Exercise the statement view's toggles (merged from the explorer): flip to the
        // "show your work" audit rows and reveal one exact value -- the screenshot
        // captures both, and any JS error in the handlers fails the check.
        await page.click("#stmt-audit-btn");
        await page.click("#stmt-audit-btn"); // back to the clean rows
        await page.click(".data-row .row-value[data-exact]");
        await new Promise((r) => setTimeout(r, 300));
      }
      if (
        name.startsWith("statements-income-chart") ||
        name.startsWith("statements-balance-chart") ||
        name.startsWith("statements-cashflow-chart")
      ) {
        // Flip the statement to the Chart view; wait for the lazy viz fetch + Plot render. The
        // screenshot captures the chart cards (income: waterfall + common-size; balance:
        // capital-structure trend + working-capital bridge + matrix; cashflow: cash bridge +
        // FCF breakdown + earnings quality), and any JS error in the builders fails the check.
        await page.click('.stmt-view-toggle [data-stmt-mode="chart"]');
        await new Promise((r) => setTimeout(r, 1800));
      }
      if (name === "institutional-nolocation") {
        // The institutional tab groups its panels behind a Holders/Geography/Activity sub-strip
        // (Holders is the default view). The holder-geography EMPTY STATE this case guards now
        // lives under the Geography sub-tab, so click into it before the screenshot -- otherwise
        // the regression guard would only ever render the Holders group and silently rot.
        await page.click('#inst-subtabs button[data-inst-group="geography"]');
        await new Promise((r) => setTimeout(r, 1200));
      }
      if (name === "sectors-decomp") {
        // Open a score's inline decomposition (constituent oriented-z bars). Any JS error in the
        // toggle/render fails the check; the screenshot captures the expanded panel.
        await page.click(".sc-score");
        await new Promise((r) => setTimeout(r, 400));
      }
      if (name === "sectors-drilldown-fh" || name === "sectors-drilldown-empty") {
        // Expand a theme by clicking the tile BODY (not the score). Financial health -> a populated
        // drill-down; Cash & investment -> the honest empty drill-down. Wait for the spread fetch.
        const theme = name === "sectors-drilldown-fh" ? "financial_health" : "cash_investment";
        await page.waitForSelector(`.sc-tile[data-focus-theme="${theme}"]`);
        await page.click(`.sc-tile[data-focus-theme="${theme}"]`);
        await new Promise((r) => setTimeout(r, 900));
      }
      if (name === "sectors-selector") {
        // Open the sector combobox (client-side filter over the loaded sector list): focus the
        // input and type a partial name -- the screenshot captures the open menu, and any JS error
        // in the widget fails the check like any other page error.
        await page.focus("#sbInput");
        await page.type("#sbInput", "in", { delay: 40 });
        await new Promise((r) => setTimeout(r, 500));
      }
      if (name === "company") {
        // Exercise the company autocomplete (suggest.js) via the shell's topbar search:
        // type a partial name and give the debounce + /v1/companies/suggest round trip a
        // moment -- the screenshot then captures the open dropdown, and any JS error
        // in the widget fails the check like any other page error.
        await page.focus(".topbar-search input");
        await page.type(".topbar-search input", "micro", { delay: 40 });
        await new Promise((r) => setTimeout(r, 900));
      }
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
