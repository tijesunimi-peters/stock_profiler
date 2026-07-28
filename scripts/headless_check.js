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
      // V3-P2 URL-as-state: the view is addressable as a PATH segment. These prove the new forms
      // resolve to the right view; the legacy ?tab= forms below prove the old ones still do.
      ["company-path-view", "/company/AAPL/statements"],
      // An unknown slug must fall back to the default view, never error (AC-21).
      ["company-path-unknown", "/company/AAPL/nonsense"],
      // V3-P4 re-cut: the two new views, plus every legacy URL form that must still resolve.
      ["company-hub", "/company/AAPL/hub"],
      ["company-tray", "/company/AAPL/hub"],
      ["company-history", "/company/AAPL/history"],
      ["company-history-range", "/company/AAPL/history"],
      ["company-legacy-fundamentals", "/company/AAPL/fundamentals"],
      ["company-legacy-tab", "/company/AAPL?tab=statements"],
      ["sectors-path-group", "/sectors/35"],
      // V3-P2 drawer guard: below 1024px the sidebar is off-canvas behind a hamburger. This lived
      // only in the retired script.js shell, so it is the single easiest thing in the merge to lose
      // -- the shot opens the drawer, so a regression shows up as a failed selector, not just a
      // different-looking picture.
      ["shell-drawer-narrow", "/company/AAPL"],
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
      // M2 routing swap (2026-07-24): /sectors is the Sector Analytics app (the sectorapp* shots
      // below drive it at the canonical URL). The pre-v2 single-sector page and its /sectors-legacy
      // rollback shot were deleted in V3-P2 (= M3 of ROADMAP_SECTOR_MIGRATION).
      ["coverage", "/coverage"],
      ["components", "/components"],
      // "Paper terminal" Sector Analytics app v2 -- now canonical at /sectors (M2 swap; the URLs below
      // exercise the app at its canonical route, incl. deep-links, post-swap). 3-col shell (960px cap +
      // right rail: snapshot + "What's moving" Track-2 feed PLACEHOLDER + how-to-read) and the Sector
      // view's three scopes: 01 scorecard (F4 delta color kept) + peer strip + the REAL Geographic-mix
      // card (P6b: derived revenue-weighted domestic/international/other split) + the REAL Insider-flow
      // card (P6a: derived open-market net buy/sell); 02 decomposition
      // (full-width, open by default) + biggest shifts; 03 Distribution (this-theme / all-metric
      // toggle). The decomp shot re-points the decomposition by clicking a tile; the dist-all shot
      // flips the Distribution scope to All metrics; the qual shot opens the Track-2 stub.
      ["sectorapp", "/sectors"],
      ["sectorapp-decomp", "/sectors"],
      ["sectorapp-dist-all", "/sectors"],
      ["sectorapp-qual", "/sectors"],
      // P6a/P6b: the geo/insider row's honest N/A states -- group "28" is seeded with NO insider-flow
      // AND no geographic-mix row, so the Insider-flow card reads "No insider data" (never $0) and the
      // Geographic-mix card reads "No ASC 280 geographic disclosure" (never 0%). Both populated cards
      // show on the default-sector `sectorapp` shot above.
      ["sectorapp-insider-na", "/sectors?group=28"],
      // v2 P5: the Filings view (5th) -- an on-site theme DRILL reached from the Qualitative
      // "Filings →" stub. Honest Track-2 placeholder LAYOUT: breadcrumb + coverage/direction chip +
      // count + representative-language + form-type tabs + paginated list, all "to be defined"; the
      // range label is "— of —" (never a fabricated "1–6 of 14"). The shot opens the drill and flips
      // a form tab; a JS error in the drill/tab/pager wiring fails the check.
      ["sectorapp-filings", "/sectors"],
      // Company view (altitude 2): the empty state (no filer picked), a populated peer dot-cloud
      // for a preset focal (?symbol=900001, a raw CIK in the seeded SIC-35 group), and a dot re-focus.
      // No ?symbol= now resolves a DEFAULT focal (first-alpha company in the largest sector) so the
      // Company view opens POPULATED; the honest empty state is only a no-resolve fallback.
      ["sectorapp-company-default", "/sectors?view=company"],
      ["sectorapp-company", "/sectors?view=company&symbol=900001"],
      ["sectorapp-company-refocus", "/sectors?view=company&symbol=900001"],
      // v2 P2: sparklines + click-to-expand 8-quarter trend. ?symbol=320193 (AAPL, which HAS real
      // companyfacts history and shares the SIC-35 group) -> a POPULATED sparkline; the shot clicks it
      // to open the trailing-8 trend panel. (900001 above is synthetic -> its sparklines honestly read
      // "no trend yet" -- the honest-degradation case in the same view.)
      ["sectorapp-company-trend", "/sectors?view=company&symbol=320193"],
      // Compare view (altitude 3): sector-vs-sector paired theme bars + metric-median cards.
      // 73 vs 60 (60 omits operating-efficiency -> honest "not scored" on B); 73 alone (B unset ->
      // prompt); 73 vs 28 (28 has no liquidity/solvency spreads -> metric-card N/A cells); and the
      // pin-to-compare flow (land on a sector, click Pin, then pick B). NO favorability color.
      ["sectorapp-compare", "/sectors?view=compare&a=73&b=60"],
      ["sectorapp-compare-nab", "/sectors?view=compare&a=73"],
      ["sectorapp-compare-na", "/sectors?view=compare&a=73&b=28"],
      ["sectorapp-compare-pin", "/sectors?group=73"],
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
    // The drawer only exists below 1024px, so this one shot runs at a phone width.
    if (name === "shell-drawer-narrow") await page.setViewport({ width: 900, height: 1200 });
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
      if (name === "sectorapp-decomp") {
        // Click a scorecard TILE -> re-points the focus (decomposition in 02, peer strip, and the 03
        // Distribution) at that theme. Captures the colored trend-delta chip + the re-pointed decomp.
        await page.waitForSelector(".pa-tile[data-theme]");
        await page.click(".pa-tile[data-theme]");
        await new Promise((r) => setTimeout(r, 500));
      }
      if (name === "sectorapp-dist-all") {
        // Flip the 03 Distribution scope toggle to [All metrics] -> the dispersion re-renders to every
        // metric with a peer distribution (not just the focused theme's constituents).
        await page.waitForSelector('.pa-scope-btn[data-scope="all"]');
        await page.click('.pa-scope-btn[data-scope="all"]');
        await new Promise((r) => setTimeout(r, 500));
      }
      if (name === "sectorapp-company-default") {
        // The default focal resolves asynchronously (largest sector -> first-alpha filer).
        await page.waitForSelector(".pa-dp-host .dist-strip-dot", { timeout: 8000 });
        await new Promise((r) => setTimeout(r, 400));
      }
      if (name === "sectorapp-company" || name === "sectorapp-company-refocus") {
        // Wait for the dot-plots to load; the refocus shot then clicks a peer dot to re-focus.
        await page.waitForSelector(".pa-dp-host .dist-strip-dot", { timeout: 8000 });
        if (name === "sectorapp-company") {
          // Exercise the composite decompose toggle (the header dropdown is captured statically).
          const cbtn = await page.$("#coCompBtn");
          if (cbtn) { await cbtn.click(); await new Promise((r) => setTimeout(r, 250)); }
        }
        if (name === "sectorapp-company-refocus") {
          await page.click(".pa-dp-host .dist-strip-dot");
          await new Promise((r) => setTimeout(r, 600));
        }
      }
      if (name === "sectorapp-company-trend") {
        // Wait for the focal's sparklines to load, then click one to expand its 8-quarter trend panel.
        await page.waitForSelector(".pa-dp-host .dist-strip-dot", { timeout: 8000 });
        await page.waitForSelector(".pa-dp-spark[data-metric]", { timeout: 8000 });
        await page.click(".pa-dp-spark[data-metric]");
        await page.waitForSelector(".pa-dp-trend", { timeout: 5000 });
        await new Promise((r) => setTimeout(r, 500));
      }
      if (name === "sectorapp-compare" || name === "sectorapp-compare-na") {
        // Wait for the paired theme bars to render.
        await page.waitForSelector(".pa-cmp-bar", { timeout: 8000 });
        await new Promise((r) => setTimeout(r, 400));
      }
      if (name === "sectorapp-compare-pin") {
        // Pin the current sector as A -> jump into Compare, then pick sector B from its selector.
        await page.waitForSelector("#paPin");
        await page.click("#paPin");
        await page.waitForSelector("#cmpSelB", { timeout: 8000 });
        await page.select("#cmpSelB", "60");
        await page.waitForSelector(".pa-cmp-bar", { timeout: 8000 });
        await new Promise((r) => setTimeout(r, 400));
      }
      if (name === "company-path-view" || name === "company-path-unknown") {
        // The rail must settle on the view the PATH names. V3-P4 re-cut the company views, so
        // the LEGACY /statements slug must alias onto `history` -- if VIEW_ALIASES were missing
        // it would silently fall through to the default and land on Overview, a wrong page
        // rather than an error. The unknown slug still resolves to the default, now `hub`.
        const want = name === "company-path-view" ? "history" : "hub";
        await page.waitForSelector(`.shell-rail-btn.active[data-view="${want}"]`, { timeout: 8000 });
      }
      if (name === "company-legacy-fundamentals" || name === "company-legacy-tab") {
        // The other two legacy forms: the retired /fundamentals path slug and the ?tab= query.
        const want = name === "company-legacy-fundamentals" ? "hub" : "history";
        await page.waitForSelector(`.shell-rail-btn.active[data-view="${want}"]`, { timeout: 8000 });
      }
      if (name === "company-hub") {
        // Overview: the merged Financial snapshot must render tiles, and opening one must
        // reveal its "how this is computed" drawer in place (AC-9/AC-11).
        await page.waitForSelector(".mtile", { timeout: 8000 });
        await page.click(".mtile [data-tile-toggle]");
        await page.waitForSelector(".mtile.open .mtile-drawer", { timeout: 6000 });
        await new Promise((r) => setTimeout(r, 600));
      }
      if (name === "company-tray") {
        // The comparison tray: "+ chart" must open the pinned bottom drawer rather than
        // navigating, and the tile must read back as being in the chart.
        await page.waitForSelector(".mtile-tray", { timeout: 8000 });
        await page.click(".mtile-tray");
        await page.waitForSelector("#compareTray .tray", { timeout: 8000 });
        await page.waitForFunction(
          () => document.querySelectorAll(".tray-chip").length === 1 &&
                /in chart/.test(document.querySelector(".mtile-tray").textContent),
          { timeout: 8000 }
        );
        await new Promise((r) => setTimeout(r, 800));
      }
      if (name === "company-history") {
        // Financial history: the explorer draws a line, then a second metric OVERLAYS it and
        // the legend grows to two entries (AC-15/AC-16).
        await page.waitForSelector(".hist-chip", { timeout: 8000 });
        await page.waitForSelector(".metric-series-chart", { timeout: 8000 });
        await page.click('.hist-chip[data-hist-metric="fcf"]');
        await page.waitForFunction(
          () => document.querySelectorAll(".hist-legend-item").length >= 2,
          { timeout: 8000 }
        );
        await new Promise((r) => setTimeout(r, 600));
      }
      if (name === "company-history-range") {
        // Switching range must re-render the chart, not leave the old one in place.
        await page.waitForSelector('[data-hist-range="5y"]', { timeout: 8000 });
        await page.click('[data-hist-range="5y"]');
        await page.waitForSelector(".metric-series-chart", { timeout: 8000 });
        await new Promise((r) => setTimeout(r, 600));
      }
      if (name === "shell-drawer-narrow") {
        // Hamburger visible below 1024px; clicking it opens the off-canvas drawer, and the scrim
        // closes it again. All three were script.js-only behaviour before the merge (AC-4).
        await page.waitForSelector("#appMenu", { visible: true });
        await page.click("#appMenu");
        await page.waitForSelector("body.side-open", { timeout: 4000 });
        await new Promise((r) => setTimeout(r, 300));
        await page.click("#appScrim");
        await page.waitForFunction(() => !document.body.classList.contains("side-open"), { timeout: 4000 });
        // Re-open so the screenshot captures the drawer rather than the closed state.
        await page.click("#appMenu");
        await page.waitForSelector("body.side-open", { timeout: 4000 });
        await new Promise((r) => setTimeout(r, 300));
      }
      if (name === "sectorapp-qual") {
        // Click the Qualitative view rail -> the honest Track-2 placeholder LAYOUT (v2 P4): banner +
        // risk-factor rows + Disclosure-landscape blocks, NO fabricated data. Then exercise the
        // wired-but-empty interactions (expand a theme's language, reveal a filer-count panel) so a
        // JS error in either handler fails the check; the screenshot captures the expanded state.
        await page.waitForSelector('.shell-rail-btn[data-view="qual"]');
        await page.click('.shell-rail-btn[data-view="qual"]');
        await page.waitForSelector('.pa-qual-banner');
        await page.waitForSelector('.pa-qual-landscape .pa-qual-block');
        await page.click('.pa-qual-rtrow[data-qual-theme]');
        await page.waitForSelector('.pa-qual-langpanel');
        await page.click('[data-qual-filer]');
        await page.waitForSelector('.pa-qual-filerpanel');
        await new Promise((r) => setTimeout(r, 300));
      }
      if (name === "sectorapp-filings") {
        // Open Qualitative, then drill into the Filings view via a risk-theme "Filings →" stub.
        // Verify the drill renders (breadcrumb + list), exercise a form tab + the pager, and confirm
        // the range label is the honest placeholder. Any JS error in the wiring fails the check.
        await page.waitForSelector('.shell-rail-btn[data-view="qual"]');
        await page.click('.shell-rail-btn[data-view="qual"]');
        await page.waitForSelector('.pa-qual-filings[data-qual-filings]');
        await page.click('.pa-qual-filings[data-qual-filings]');
        await page.waitForSelector('.pa-fil-crumb');
        await page.waitForSelector('.pa-fil-list .pa-fil-empty');
        // The range label must be the placeholder, never a fabricated count.
        const range = await page.$eval('.pa-fil-range', (el) => el.textContent.trim());
        if (!/^—\s*of\s*—$/.test(range)) { console.log('    filings range label not a placeholder: ' + JSON.stringify(range)); failed = true; }
        // Flip a form tab (real control over the empty placeholder list).
        await page.click('.pa-fil-tab[data-fil-form="10-K"]');
        await new Promise((r) => setTimeout(r, 300));
      }
      if (name === "company") {
        // Exercise the company autocomplete (suggest.js) via the shell's topbar search:
        // type a partial name and give the debounce + /v1/companies/suggest round trip a
        // moment -- the screenshot then captures the open dropdown, and any JS error
        // in the widget fails the check like any other page error.
        await page.focus(".shell-search input");
        await page.type(".shell-search input", "micro", { delay: 40 });
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
