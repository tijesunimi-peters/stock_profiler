/**
 * Render-equivalence snapshots — the gate for a refactor that must not change a pixel.
 *
 * Builds nothing itself: point it at an existing `app-dist/`. It serves that directory with an
 * SPA fallback, drives headless Chromium over a fixed matrix of (view x ticker), and writes one
 * normalized HTML file per cell. Run it once before a refactor and once after; `diff -r` the two
 * output directories. An empty diff IS the acceptance criterion (AC-2).
 *
 * ## Why this can work at all
 *
 * Every figure in this app is deterministic-synthetic — `lib/seed.ts` hashes the ticker, and there
 * is no `Date.now()`, no arg-less `new Date()` and no `Math.random()` anywhere in `app/` or `src/`.
 * Same ticker in, same numbers out, every run. **If that stops being true this harness silently
 * stops meaning anything**, so it asserts determinism explicitly (`--verify-stable`) rather than
 * trusting it.
 *
 * ## The trap this exists to avoid
 *
 * After the refactor the views resolve their data through a promise, so the FIRST paint is a
 * loading state. A capture on `domcontentloaded` would diff a shimmer against a page and report a
 * catastrophic change that is really just a race. So we wait on the resolved state: the view root
 * present AND no `.state-loading` inside it.
 *
 * Run (no npm dependency — Chromium comes from the image the repo already pulls for e2e).
 * The script is mounted NEXT TO puppeteer's own node_modules, not under the repo: ESM resolves
 * bare specifiers from the importing FILE's directory upward, so a script living under /app would
 * search /app/node_modules and never find it. Same reason `scripts/headless_check.js` is mounted
 * into /home/pptruser rather than run in place.
 *
 *   npm run app:build      # first — this snapshots app-dist/, it does not build it
 *
 *   docker run --rm -u root \
 *     -v "$PWD/clearyfi_frontend/scripts/render_snapshot.mjs":/home/pptruser/render_snapshot.mjs:ro \
 *     -v "$PWD/clearyfi_frontend":/app -w /home/pptruser \
 *     -e PUPPETEER_CACHE_DIR=/home/pptruser/.cache/puppeteer \
 *     ghcr.io/puppeteer/puppeteer:latest \
 *     node render_snapshot.mjs --dist /app/app-dist --out /app/.render/before --verify-stable
 *
 * Then, after the change:  ... --out /app/.render/after   &&   diff -r .render/before .render/after
 */
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import puppeteer from "puppeteer";

const args = process.argv.slice(2);

function argOf(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

// `--dist`/`--out` are explicit because the runner's CWD is NOT this repo: Chromium's own
// `node_modules` lives at /home/pptruser in the puppeteer image, so node must resolve from there
// while the app being snapshotted is bind-mounted somewhere else entirely.
const DIST = resolve(argOf("--dist") ?? "app-dist");
const outDir = resolve(argOf("--out") ?? ".render/out");
const verifyStable = args.includes("--verify-stable");
const PORT = 5199;

/**
 * The capture matrix.
 *
 * Three tickers, not one: the views are seeded from the ticker, so a single one could match by
 * luck through a branch that only differs for other filers. `hub.ts` has real branches (dual-class
 * vs single, restructuring active or not, auditor changed or not) and three draws exercise more of
 * them than one does.
 */
const TICKERS = ["NVDA", "AMD", "INTC"];
const VIEWS = ["overview", "institutional"];

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2",
  ".woff": "font/woff", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon",
};

/** Static server with SPA fallback — the router reads `location.pathname`, so deep links must 200. */
function serve() {
  return new Promise((ready) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url, `http://localhost:${PORT}`);
      let file = join(DIST, decodeURIComponent(url.pathname));
      // No extension => a client route, not an asset. Hand back the shell.
      if (!extname(url.pathname) || !existsSync(file)) file = join(DIST, "index.html");
      try {
        const body = await readFile(file);
        res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
        res.end(body);
      } catch (err) {
        res.writeHead(500).end(String(err));
      }
    });
    server.listen(PORT, () => ready(server));
  });
}

/**
 * Normalise away what React and the browser vary run-to-run, and NOTHING else.
 *
 * Over-normalising is how a diff goes green while the page actually changed, so this is
 * deliberately short: whitespace between tags, and the generated id/aria pairs React mints for
 * accessibility wiring. Values, classes, attributes and order are all left exactly as rendered.
 */
function normalise(html) {
  return html
    .replace(/\sdata-reactroot=""/g, "")
    .replace(/(\s(?:id|for|aria-controls|aria-labelledby)=")[^"]*:r[0-9a-z]+:[^"]*"/g, '$1<generated>"')
    .replace(/>\s+</g, ">\n<")
    .trim();
}

async function capture(page, ticker, view) {
  await page.goto(`http://localhost:${PORT}/company/${ticker}/${view}?focal=${ticker}`, {
    waitUntil: "networkidle0",
  });
  // The resolved state, not the first paint. See the header note.
  await page.waitForFunction(
    () => {
      const root = document.querySelector(".alt-content");
      return !!root && !!root.querySelector(".hub") && !root.querySelector(".state-loading");
    },
    { timeout: 20_000 },
  );
  return normalise(await page.$eval(".alt-content", (el) => el.outerHTML));
}

const server = await serve();
const browser = await puppeteer.launch({
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
await mkdir(outDir, { recursive: true });

let failures = 0;
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1200 });
  // A console error is a defect in its own right; surface it rather than snapshotting over it.
  page.on("pageerror", (e) => { console.error(`  !! page error: ${e.message}`); failures++; });
  page.on("console", (m) => { if (m.type() === "error") { console.error(`  !! console: ${m.text()}`); failures++; } });

  for (const ticker of TICKERS) {
    for (const view of VIEWS) {
      const html = await capture(page, ticker, view);
      await writeFile(join(outDir, `${ticker}-${view}.html`), html + "\n");
      console.log(`  captured ${ticker}/${view}  (${html.length.toLocaleString()} chars)`);

      if (verifyStable) {
        // Same input twice must give the same bytes, or the harness is measuring noise.
        const again = await capture(page, ticker, view);
        if (again !== html) {
          console.error(`  !! NOT DETERMINISTIC: ${ticker}/${view} differs between two runs`);
          failures++;
        }
      }
    }
  }
} finally {
  await browser.close();
  server.close();
}

console.log(failures ? `\nFAILED with ${failures} problem(s)` : `\nOK — snapshots in ${outDir}`);
process.exit(failures ? 1 : 0);
