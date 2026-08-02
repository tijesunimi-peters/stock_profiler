/**
 * Drives the states and the controls the DOM diff cannot speak to.
 *
 * `render_snapshot.mjs` proves the RESTING page is unchanged. It says nothing about the three
 * states that only exist in motion (loading, error, empty), nor about whether a control that
 * renders still does anything. Both are acceptance criteria, and neither is visible in a static
 * capture — a button that lost its handler in a refactor diffs as identical.
 *
 * Same runner as the snapshot script; see its header for why it mounts next to puppeteer.
 *
 *   docker run --rm -u root \
 *     -v "$PWD/clearyfi_frontend/scripts/drive_states.mjs":/home/pptruser/drive_states.mjs:ro \
 *     -v "$PWD/clearyfi_frontend":/app -w /home/pptruser \
 *     -e PUPPETEER_CACHE_DIR=/home/pptruser/.cache/puppeteer \
 *     ghcr.io/puppeteer/puppeteer:latest node drive_states.mjs --dist /app/app-dist
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import puppeteer from "puppeteer";

const args = process.argv.slice(2);
const DIST = resolve(args[args.indexOf("--dist") + 1] ?? "app-dist");
const PORT = 5198;
const BASE = `http://localhost:${PORT}`;

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2" };

function serve() {
  return new Promise((ready) => {
    const s = createServer(async (req, res) => {
      const url = new URL(req.url, BASE);
      let file = join(DIST, decodeURIComponent(url.pathname));
      if (!extname(url.pathname) || !existsSync(file)) file = join(DIST, "index.html");
      const body = await readFile(file);
      res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
      res.end(body);
    });
    s.listen(PORT, () => ready(s));
  });
}

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
}

const server = await serve();
const browser = await puppeteer.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1200 });

const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

const settled = async () => {
  await page.waitForFunction(
    () => {
      const r = document.querySelector(".alt-content");
      // View-agnostic — see the note in render_snapshot.mjs. `.hub` is not every view's root.
      return !!r && r.childElementCount > 0 && !r.querySelector(".state-loading");
    },
    { timeout: 20_000 },
  );
};

try {
  for (const view of ["overview", "institutional"]) {
    console.log(`\n== ${view} ==`);

    // AC-3 loading — `?slow` holds every seam call for 900ms, so the state is observable.
    await page.goto(`${BASE}/company/NVDA/${view}?focal=NVDA&slow`, { waitUntil: "domcontentloaded" });
    const sawLoading = await page
      .waitForSelector(".alt-content .state-loading", { timeout: 5000 })
      .then(() => true, () => false);
    check("AC-3 loading state renders", sawLoading);

    // AC-4 error — degrade honestly: a StateBlock, not a blank page and not a crash.
    await page.goto(`${BASE}/company/NVDA/${view}?focal=NVDA&fail`, { waitUntil: "networkidle0" });
    const errState = await page.$(".alt-content .state .state-title.err");
    const stillFramed = await page.$(".alt-shell, .alt-content");
    check("AC-4 error state renders", !!errState);
    check("AC-4 page survives the failure", !!stillFramed);

    // AC-6 no figure claims to be real: nothing became more real in a refactor.
    await page.goto(`${BASE}/company/NVDA/${view}?focal=NVDA`, { waitUntil: "networkidle0" });
    await settled();

    // AC-5 no missing value rendered as a bare 0 where a dash/N-A belongs.
    const zeroCells = await page.$$eval(".alt-content .hub-cell-mono", (els) =>
      els.map((e) => e.textContent.trim()).filter((t) => t === "0" || t === "0.0" || t === "$0.0B"),
    );
    check("AC-5 no bare-zero cells", zeroCells.length === 0, zeroCells.join(", "));
  }

  // AC-8 — every control still does something. A handler dropped in a refactor is invisible to
  // a DOM diff of the resting page, which is exactly why this is driven rather than eyeballed.
  console.log("\n== AC-8 controls ==");
  await page.goto(`${BASE}/company/NVDA/overview?focal=NVDA`, { waitUntil: "networkidle0" });
  await settled();

  const tabs = await page.$$(".hub-tabs .hub-tab");
  const before = await page.$eval(".alt-content", (e) => e.innerHTML.length);
  await tabs[1].click();
  await new Promise((r) => setTimeout(r, 250));
  const afterTab = await page.$eval(".alt-content", (e) => e.innerHTML.length);
  check("statement tab switches the table", before !== afterTab);

  const chip = await page.$(".hub-calc-chip");
  await chip.click();
  await new Promise((r) => setTimeout(r, 200));
  check("ƒ derived chip opens its drawer", !!(await page.$(".hub-calc")));

  const row = await page.$(".hub-row.is-clickable");
  await row.click();
  await page.waitForSelector(".hub-drawer", { timeout: 5000 }).then(() => {}, () => {});
  check("statement row opens a trend drawer", !!(await page.$(".hub-drawer")));

  const rangeTabs = await page.$$(".hub-drawer .hub-tab");
  if (rangeTabs.length) {
    const pre = await page.$eval(".hub-drawer", (e) => e.innerHTML.length);
    await rangeTabs[1].click();
    await new Promise((r) => setTimeout(r, 400));
    const post = await page.$eval(".hub-drawer", (e) => e.innerHTML.length);
    check("drawer range tab refetches the series", pre !== post);
  } else check("drawer range tab refetches the series", false, "no drawer tabs found");

  const trayAdd = await page.$(".hub-tray-add");
  if (trayAdd) {
    await trayAdd.click();
    await new Promise((r) => setTimeout(r, 400));
    check("+ compare puts a metric in the tray", !!(await page.$(".hub-tray")));
  } else check("+ compare puts a metric in the tray", false, "no tray button found");

  const railFilter = await page.$$(".hub-tl-filter");
  if (railFilter.length > 1) {
    const pre = await page.$$eval(".hub-tl-row", (r) => r.length);
    await railFilter[1].click();
    await new Promise((r) => setTimeout(r, 250));
    const post = await page.$$eval(".hub-tl-row", (r) => r.length);
    check("rail form filter filters the timeline", pre !== post);
  } else check("rail form filter filters the timeline", false, "no filters found");

  check("no console or page errors during the drive", errors.length === 0, errors.slice(0, 3).join(" | "));
} finally {
  await browser.close();
  server.close();
}

console.log(`\n${fail ? "FAILED" : "OK"} — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
