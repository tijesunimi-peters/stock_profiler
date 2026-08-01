const puppeteer = require("puppeteer");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 1200 });
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 80)); });
  await p.goto("http://p5a-preview:8000/company/AAPL/institutional", { waitUntil: "networkidle0" });
  await wait(2800);
  const o = await p.evaluate(() => {
    const sec = document.getElementById("ip-01");
    const slots = [...sec.querySelectorAll(".ip-strip-cell, .ip-eq-cell, .ip-tile")].map((n) => {
      const label = (n.querySelector(".ip-micro, .ip-eq-label") || {}).innerText || "?";
      const val = (n.querySelector(".ip-strip-val, .ip-eq-val, .ip-tile-val") || {}).innerText || "?";
      const chip = (n.querySelector(".chip") || {}).innerText || null;
      return { label: label.trim(), val: val.trim(), chip: chip && chip.trim() };
    });
    return {
      slots,
      // the rule: chip iff the value is N/A
      violations: slots.filter((s) => (s.val === "N/A") !== !!s.chip),
      stripH: Math.round(sec.querySelector(".ip-strip").getBoundingClientRect().height),
      eqH: Math.round(sec.querySelector(".ip-eq").getBoundingClientRect().height),
      sectionH: Math.round(sec.getBoundingClientRect().height),
    };
  });
  console.log(JSON.stringify(o, null, 1));
  console.log("page errors:", errs.length, errs.slice(0, 3));
  await b.close();
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
