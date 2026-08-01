const puppeteer = require("puppeteer");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  for (const sym of ["AAPL", "JPM"]) {
    const p = await b.newPage();
    await p.setViewport({ width: 1440, height: 1200 });
    const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    p.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 90)); });
    await p.goto("http://p5a-preview:8000/company/" + sym + "/institutional", { waitUntil: "networkidle0" });
    await wait(3000);
    await p.evaluate(() => [...document.querySelectorAll("button")]
      .filter((x) => /also in this section/i.test(x.innerText || "")).forEach((x) => x.click()));
    await wait(900);
    const o = await p.evaluate(() => {
      const sec = document.getElementById("ip-02");
      const txt = (s) => [...sec.querySelectorAll(s)].map((n) => n.innerText.replace(/\s+/g, " ").trim());
      const vals = txt(".ip-topten-val, .ip-mtab-num");
      return {
        banner: (document.querySelector(".ip-banner-title") || {}).innerText || "(gone)",
        cardTitles: txt(".ip-card-title"),
        axisTicks: [...sec.querySelectorAll("text.ip-ax")].map((t) => t.textContent).slice(0, 12),
        xLabels: [...sec.querySelectorAll("text.ip-ax-x")].map((t) => t.textContent),
        netChange: txt(".ip-caption")[0],
        emptyStates: txt(".ip-rr-empty p").map((t) => t.slice(0, 90)),
        topTen: txt(".ip-topten-val")[0],
        panels: txt(".ip-panel-name"),
        panelQ: txt(".ip-panel-cls"),
        tableRows: txt(".ip-mtab-row").slice(0, 3),
        colHeads: txt(".ip-mtab-head")[0],
        zeros: vals.filter((v) => /^0$|^0\.0|^0%|^—$/.test(v)),
        chips: [...sec.querySelectorAll(".chip")].map((c) => c.innerText.replace(/\s+/g, "")),
      };
    });
    console.log("### " + sym + " " + JSON.stringify(o, null, 1));
    console.log("   page errors:", errs.length, errs.slice(0, 3));
    await p.close();
  }
  await b.close();
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
