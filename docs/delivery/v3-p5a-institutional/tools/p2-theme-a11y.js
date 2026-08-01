// Theme + keyboard reachability + the honesty scan, on the live page.
const puppeteer = require("puppeteer");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  for (const scheme of ["light", "dark"]) {
    const p = await b.newPage();
    await p.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }]);
    await p.setViewport({ width: 1440, height: 1200 });
    await p.goto("http://p5a-preview:8000/company/AAPL/institutional", { waitUntil: "networkidle0" });
    await wait(2600);
    const o = await p.evaluate(() => {
      const sec = document.getElementById("ip-01");
      const cs = (n) => getComputedStyle(n);
      const lum = (c) => { const m = c.match(/\d+/g); if (!m) return null;
        return +(0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]).toFixed(0); };
      const card = sec.querySelector(".ip-card");
      // every N/A must be legible against its card, not a blank styled like a value
      const nas = [...sec.querySelectorAll(".ip-strip-val, .ip-tile-val, .ip-eq-val")]
        .filter((n) => n.innerText.trim() === "N/A");
      return {
        pageBg: lum(cs(document.body).backgroundColor),
        cardBg: lum(cs(card).backgroundColor),
        naCount: nas.length,
        naInks: [...new Set(nas.map((n) => lum(cs(n).color)))],
        eqWhyInk: lum(cs(sec.querySelector(".ip-eq-why")).color),
        // any hard-coded hex that would only work in one theme
        hardCoded: [...sec.querySelectorAll("[style*='#']")].length,
        focusables: [...sec.querySelectorAll("a[href],button,[tabindex]:not([tabindex='-1'])")].length,
      };
    });
    console.log(scheme.toUpperCase(), JSON.stringify(o));
    await p.close();
  }
  // keyboard: tab to the xref link and activate it
  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 1200 });
  await p.goto("http://p5a-preview:8000/company/AAPL/institutional", { waitUntil: "networkidle0" });
  await wait(2600);
  const reached = await p.evaluate(() => {
    const a = document.querySelector("#ip-01 [data-ip-go]");
    a.focus();
    const f = document.activeElement === a;
    const ol = getComputedStyle(a, ":focus-visible").outlineStyle;
    return { focusable: f, outline: ol, tag: a.tagName, href: a.getAttribute("href") };
  });
  await p.keyboard.press("Enter");
  await wait(1600);
  const after = await p.evaluate(() => location.pathname);
  console.log("KEYBOARD", JSON.stringify({ ...reached, landedOn: after }));
  await b.close();
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
