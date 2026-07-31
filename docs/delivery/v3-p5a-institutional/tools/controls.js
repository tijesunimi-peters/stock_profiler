// Inventory EVERY control in a section: buttons, links and anything with a role. Reports what our
// side renders it as, so an inert <span> stands out. Step 1 of the affordance checklist.
const puppeteer = require("puppeteer");
const { URL: U, SEL, NAV, OPEN } = process.env;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ct = async (p, t) => p.evaluate((t) => { const e=[...document.querySelectorAll("button,a,[role=button],div,span,li")].find(e=>(e.innerText||"").trim()===t&&e.offsetParent!==null); if(e)e.click(); }, t);
(async () => {
  const b = await puppeteer.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 1200, deviceScaleFactor: 1 });
  await p.goto(U, { waitUntil: "networkidle0", timeout: 120000 });
  await wait(2200);
  if (NAV === "1") { await ct(p, "Companies"); await wait(1200); await ct(p, "Institutional"); await wait(2200); }
  await p.waitForSelector(SEL);
  if (OPEN === "1") { await p.evaluate(() => [...document.querySelectorAll("button")].filter(b=>/also in this section/i.test(b.innerText||"")).forEach(b=>b.click())); await wait(1500); }
  const out = await p.evaluate((sel) => {
    const root = document.querySelector(sel);
    const rows = [];
    for (const e of root.querySelectorAll("*")) {
      const tag = e.tagName.toLowerCase();
      const cs = getComputedStyle(e);
      const isControl = tag === "button" || tag === "a" || e.getAttribute("role") === "button" ||
        cs.cursor === "pointer" || /ip-(chip|badge|toggle|card-link|minibtn|expander-btn)/.test(e.className || "");
      if (!isControl) continue;
      const t = (e.innerText || e.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40);
      if (!t) continue;
      rows.push({ tag, t, cls: (e.className || "").toString().slice(0, 34),
        wired: !!(e.dataset.ipOpen || e.dataset.ipDerive || e.dataset.ipView || e.dataset.ipTrend || e.dataset.ipLabel ||
                  tag === "a" && e.getAttribute("href")),
        cursor: cs.cursor });
    }
    return rows;
  }, SEL);
  out.forEach((r) => console.log(
    "  " + (r.wired ? "live " : "INERT") + "  <" + r.tag + ">".padEnd(9) +
    JSON.stringify(r.t).padEnd(44) + r.cls));
  console.log("  -- " + out.length + " controls, " + out.filter((r) => !r.wired).length + " inert");
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
