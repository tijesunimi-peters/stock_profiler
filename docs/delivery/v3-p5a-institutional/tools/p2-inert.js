const puppeteer = require("puppeteer");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 1400 });
  await p.goto("http://p5a-preview:8000/company/AAPL/institutional", { waitUntil: "networkidle0" });
  await wait(3000);
  await p.evaluate(() => [...document.querySelectorAll("button")]
    .filter((x) => /also in this section/i.test(x.innerText || "")).forEach((x) => x.click()));
  await wait(1200);
  const o = await p.evaluate(() => {
    const derives = [...document.querySelectorAll("[data-ip-derive]")].map((n) => n.getAttribute("data-ip-derive"));
    const opens = [...document.querySelectorAll("[data-ip-open]")].map((n) => n.getAttribute("data-ip-open"));
    return {
      derivesWithNoPanel: derives.filter((k) => !document.querySelector('[data-ip-deriv-for="' + k + '"]')),
      totalDerives: derives.length, totalOpens: opens.length, opens,
    };
  });
  console.log(JSON.stringify(o, null, 1));
  await b.close();
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
