// The exact crash condition: §03 rendered with NO prior-quarter register available.
const puppeteer = require("puppeteer");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 1200 });
  const errs = []; p.on("pageerror", (e) => errs.push(e.message.slice(0, 100)));
  // Starve every older-quarter register so ip03RankedSpec().prior is null.
  await p.setRequestInterception(true);
  p.on("request", (r) => {
    const u = r.url();
    if (/institutional-register\?period=(2025-12-31|2025-09-30|2025-06-30)/.test(u)) return r.abort();
    r.continue();
  });
  await p.goto("http://p5a-preview:8000/company/AAPL/institutional", { waitUntil: "networkidle0" });
  await wait(4000);
  const r = await p.evaluate(() => {
    const sec = document.getElementById("ip-03");
    const svg = sec.querySelector('[data-ip-chart="03-ranked"] svg');
    const note = sec.querySelector('[data-ip-note="03-ranked"]');
    return {
      rendered: !!sec && (sec.innerText || "").length > 400,
      dashedPaths: svg ? [...svg.querySelectorAll("path")].filter(n => n.getAttribute("stroke-dasharray")).length : -1,
      solidPaths: svg ? [...svg.querySelectorAll("path")].filter(n => !n.getAttribute("stroke-dasharray")).length : -1,
      legend: svg ? (svg.querySelector("text.ip-ax2") ? "" : "") : "",
      legendText: svg ? [...svg.querySelectorAll("text")].map(t=>t.textContent).filter(t=>/cumulative/.test(t))[0] : null,
      note: (note ? note.textContent : "").slice(0, 120),
    };
  });
  console.log(JSON.stringify(r, null, 1));
  console.log("page errors:", errs.length, errs);
  await b.close();
  process.exit(errs.length || !r.rendered ? 1 : 0);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
