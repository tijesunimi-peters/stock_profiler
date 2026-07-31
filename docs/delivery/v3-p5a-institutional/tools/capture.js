// V3-P5a phase 1 (P1c) — capture prototype ground truth.
//
// The v3 prototype (docs/design/sector-app-prototype-v3/prototype.dc.html) is a dc-runtime
// React export that RENDERS when served over HTTP with outbound internet. This drives it to
// Companies -> Institutional and captures, per section:
//   - a PNG at the prototype's own 694px content column
//   - the section's literal text values (D-literals: the port carries these verbatim)
//   - computed CSS for the primitives the port has to reproduce
//
//   docker run -d --rm --name proto-srv --network stock_profiler_default \
//     -v "$PWD/docs/design/sector-app-prototype-v3:/srv:ro" -w /srv \
//     python:3.11-slim python -m http.server 9000
//   docker run --rm --network stock_profiler_default \
//     -v "$PWD/docs/delivery/v3-p5a-institutional/tools/capture.js:/home/pptruser/capture.js:ro" \
//     -v "$PWD/docs/delivery/v3-p5a-institutional/prototype-ground-truth:/out" \
//     -w /home/pptruser ghcr.io/puppeteer/puppeteer:latest node capture.js
const fs = require("fs");
const puppeteer = require("puppeteer");

const URL = "http://proto-srv:9000/prototype.dc.html";
const OUT = "/out";

const clickByText = async (page, text) =>
  page.evaluate((t) => {
    const el = Array.from(
      document.querySelectorAll("button, a, [role=button], div, span, li")
    ).find((e) => (e.innerText || "").trim() === t && e.offsetParent !== null);
    if (!el) return false;
    el.click();
    return true;
  }, text);

(async () => {
  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1200, deviceScaleFactor: 2 });
  const errs = [];
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));

  await page.goto(URL, { waitUntil: "networkidle0", timeout: 120000 });
  await new Promise((r) => setTimeout(r, 3000));

  if (!(await clickByText(page, "Companies"))) throw new Error('no "Companies" nav item');
  await new Promise((r) => setTimeout(r, 1500));

  const rail = await page.evaluate(() =>
    Array.from(document.querySelectorAll("button, a, [role=button], div, span"))
      .map((e) => (e.innerText || "").trim())
      .filter((t) => t && t.length < 30 && !t.includes("\n"))
      .filter((t, i, a) => a.indexOf(t) === i)
  );
  console.log("=== after Companies, candidate labels ===");
  console.log(JSON.stringify(rail.slice(0, 80)));

  if (!(await clickByText(page, "Institutional"))) throw new Error('no "Institutional" rail item');
  await new Promise((r) => setTimeout(r, 2500));

  // What sections exist, and how wide is the content column?
  const shape = await page.evaluate(() => {
    const secs = Array.from(document.querySelectorAll("[data-screen-label], section, [id^=i]"))
      .filter((e) => /^i\d+$/.test(e.id))
      .map((e) => ({
        id: e.id,
        label: e.getAttribute("data-screen-label"),
        w: Math.round(e.getBoundingClientRect().width),
        h: Math.round(e.getBoundingClientRect().height),
      }));
    return { secs, docH: document.body.scrollHeight };
  });
  console.log("=== sections ===");
  console.log(JSON.stringify(shape, null, 1));

  // Full page
  await page.screenshot({ path: `${OUT}/proto-institutional-full.png`, fullPage: true });

  // Per section
  for (const s of shape.secs) {
    const el = await page.$(`#${s.id}`);
    if (!el) continue;
    await el.evaluate((e) => e.scrollIntoView({ block: "center" }));
    await new Promise((r) => setTimeout(r, 400));
    await el.screenshot({ path: `${OUT}/proto-${s.id}.png` });
  }

  // Literals + computed CSS, per section, straight from the DOM (never hand-typed).
  const dump = await page.evaluate(() => {
    const cs = (el, props) => {
      const c = getComputedStyle(el);
      const o = {};
      props.forEach((p) => (o[p] = c[p]));
      return o;
    };
    const BOX = [
      "fontFamily", "fontSize", "fontWeight", "letterSpacing", "textTransform",
      "color", "backgroundColor", "border", "borderRadius", "padding", "margin",
      "boxShadow", "display", "gridTemplateColumns", "gap", "alignItems", "lineHeight",
      "borderBottom", "borderLeft", "textAlign", "width", "height", "overflow",
    ];
    const walk = (root) => {
      const out = [];
      const rec = (el, depth) => {
        const r = el.getBoundingClientRect();
        const own = Array.from(el.childNodes)
          .filter((n) => n.nodeType === 3)
          .map((n) => n.textContent.trim())
          .filter(Boolean)
          .join(" ");
        out.push({
          d: depth,
          tag: el.tagName.toLowerCase(),
          text: own,
          w: Math.round(r.width),
          h: Math.round(r.height),
          css: cs(el, BOX),
        });
        Array.from(el.children).forEach((c) => rec(c, depth + 1));
      };
      rec(root, 0);
      return out;
    };
    const res = {};
    Array.from(document.querySelectorAll("[id]"))
      .filter((e) => /^i\d+$/.test(e.id))
      .forEach((e) => {
        res[e.id] = { text: e.innerText, tree: walk(e), html: e.outerHTML };
      });
    // The prototype's design tokens, as resolved on :root
    const rootCs = getComputedStyle(document.documentElement);
    const tokens = {};
    for (const name of Array.from(document.styleSheets)
      .flatMap((s) => {
        try {
          return Array.from(s.cssRules);
        } catch {
          return [];
        }
      })
      .filter((r) => r.style)
      .flatMap((r) => Array.from(r.style))
      .filter((p) => p.startsWith("--"))
      .filter((p, i, a) => a.indexOf(p) === i)) {
      tokens[name] = rootCs.getPropertyValue(name).trim();
    }
    return { res, tokens };
  });

  fs.writeFileSync(`${OUT}/literals.json`, JSON.stringify(dump.res, null, 1));
  fs.writeFileSync(`${OUT}/tokens.json`, JSON.stringify(dump.tokens, null, 1));
  console.log("=== tokens ===");
  console.log(JSON.stringify(dump.tokens, null, 1));
  console.log("=== errors ===", JSON.stringify(errs));

  await browser.close();
})().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
