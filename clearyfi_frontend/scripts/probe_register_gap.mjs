/*
 * Does a FAILED register fetch render as a real zero?
 *
 * §02's register-over-time chart is built from one `-register` read per quarter, each wrapped in
 * `.catch(() => null)`. If the adapter coalesces that null to 0, a transport failure — a 429, a
 * 502, a dropped connection — draws a quarter in which nobody held the stock. That is the one
 * thing the honesty rule forbids: a missing value shown as 0, and here it is missing for a reason
 * that has nothing to do with the filings.
 *
 * This aborts exactly one quarter's register request and reads back what the chart drew. A line
 * that dives to the axis fails; a line with a GAP passes.
 *
 *   node scripts/probe_register_gap.mjs --dist app-dist
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import puppeteer from "puppeteer";

const DIST = resolve(process.argv[process.argv.indexOf("--dist") + 1]), PORT = 5231, API = "http://127.0.0.1:8000";
const H = { "sec-fetch-site": "same-origin" };
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2" };
const s = createServer(async (rq, rs) => {
  const u = new URL(rq.url, `http://localhost:${PORT}`);
  if (u.pathname.startsWith("/v1")) {
    const r = await fetch(API + u.pathname + u.search, { headers: H });
    rs.writeHead(r.status, { "content-type": "application/json" });
    rs.end(await r.text());
    return;
  }
  let f = join(DIST, decodeURIComponent(u.pathname));
  if (!extname(u.pathname) || !existsSync(f)) f = join(DIST, "index.html");
  rs.writeHead(200, { "content-type": MIME[extname(f)] ?? "application/octet-stream" });
  rs.end(await readFile(f));
});
await new Promise((r) => s.listen(PORT, r));

const TK = process.env.TICKER || "AAPL";
const per = await fetch(`${API}/v1/companies/${TK}/institutional-periods`, { headers: H }).then((r) => r.json());
// Fail a MIDDLE quarter: an interior gap is unambiguous, an edge one could be a short series.
const victim = per.periods[3];

const b = await puppeteer.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const p = await b.newPage();
await p.setViewport({ width: 1440, height: 2000 });
await p.setRequestInterception(true);
let aborted = 0;
p.on("request", (rq) => {
  if (rq.url().includes("institutional-register?") && rq.url().includes(victim)) {
    aborted++;
    return rq.abort("failed");
  }
  rq.continue();
});

await p.goto(`http://localhost:${PORT}/company/${TK}/institutional?focal=${TK}`, { waitUntil: "networkidle0" });
await p.waitForFunction(() => !!document.querySelector("#i2"), { timeout: 90000 });
await new Promise((r) => setTimeout(r, 1500));

const seen = await p.evaluate(() => {
  const sec = document.querySelector("#i2")?.closest(".hub-sec");
  const svg = sec?.querySelector("svg");
  if (!svg) return { err: "no svg under #i2" };
  const paths = [...svg.querySelectorAll("path")].map((x) => x.getAttribute("d") || "").filter((d) => d.startsWith("M"));
  const line = paths.sort((a, b) => b.length - a.length)[0] || "";
  const pts = [...line.matchAll(/[ML]\s*(-?[\d.]+),(-?[\d.]+)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));

  /* Recover the y SCALE from the axis ticks, so a vertex can be read back as its plotted value. */
  const ticks = [...svg.querySelectorAll("g.tick, .tick")]
    .map((t) => {
      const label = Number((t.querySelector("text")?.textContent || "").replace(/[^\d.-]/g, ""));
      const m = /translate\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/.exec(t.getAttribute("transform") || "");
      return m ? { v: label, x: Number(m[1]), y: Number(m[2]) } : null;
    })
    // The x-axis ticks translate along x and share one y; the y-axis ticks are the converse.
    // Keeping both fits a line through two different scales and reads back nonsense.
    .filter((t) => t && Number.isFinite(t.v) && t.x === 0);
  const a = ticks[0], z = ticks[ticks.length - 1];
  const toValue = a && z && a.y !== z.y ? (y) => a.v + ((y - a.y) * (z.v - a.v)) / (z.y - a.y) : null;

  return {
    moves: (line.match(/M/g) || []).length,
    vertices: pts.length,
    values: toValue ? pts.map((q) => Math.round(toValue(q.y))) : null,
    ticks: ticks.map((t) => t.v),
  };
});

console.log(`ticker=${TK}  aborted ${aborted} request(s) for ${victim}`);
console.log(`  register-over-time line: ${JSON.stringify(seen)}`);
if (seen.err) console.log("  INCONCLUSIVE");
else if (seen.moves > 1) console.log(`  PASS — the line BREAKS at the missing quarter (${seen.moves} segments)`);
else console.log(`  FAIL — one unbroken segment: the missing quarter was drawn as a value`);

await b.close();
s.close();
