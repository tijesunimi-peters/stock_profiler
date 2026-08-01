// Every control in §02 must still do something (D-behaviour).
const puppeteer = require("puppeteer");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 1200 });
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 80)); });
  await p.goto("http://p5a-preview:8000/company/AAPL/institutional", { waitUntil: "networkidle0" });
  await wait(3000);
  const res = [];
  const expandersOpen = async () => p.evaluate(() => [...document.querySelectorAll("button")]
    .filter((x) => /also in this section/i.test(x.innerText || "")).forEach((x) => x.click()));

  // 1. expander toggles
  const vis = () => p.evaluate(() => { const b = document.querySelector("#ip-02 .ip-expander-body"); return !!b && !b.hasAttribute("hidden"); });
  const before = await vis();
  await expandersOpen(); await wait(800);
  const after = await vis();
  res.push({ ctl: "§02 expander", pass: !before && after, detail: before + "->" + after });

  // 2. each ⤡ Expand in §02 opens a lightbox with a title and content
  const chips = await p.$$eval("#ip-02 .ip-chip", (ns) => ns.map((n) => n.getAttribute("data-ip-open")));
  for (const key of chips) {
    await p.evaluate((k) => document.querySelector('#ip-02 [data-ip-open="' + k + '"]').click(), key);
    await wait(900);
    const lb = await p.evaluate(() => {
      const d = document.querySelector(".ip-lb");
      if (!d) return null;
      return { title: (d.querySelector(".ip-lb-title") || {}).innerText || "",
        svgs: d.querySelectorAll("svg").length, panels: d.querySelectorAll(".ip-panel").length,
        note: (d.querySelector(".ip-lb-note") || {}).innerText || "" };
    });
    res.push({ ctl: "§02 ⤡ " + key, pass: !!lb && (lb.svgs > 0 || lb.panels > 0),
      detail: JSON.stringify(lb) });
    await p.keyboard.press("Escape"); await wait(500);
  }
  // 3. the derivation badge in §02
  const badges = await p.$$eval("#ip-02 [data-ip-derive]", (ns) => ns.map((n) => n.getAttribute("data-ip-derive")));
  for (const k of badges) {
    const shown = await p.evaluate((k) => {
      const btn = document.querySelector('#ip-02 [data-ip-derive="' + k + '"]'); btn.click();
      const panel = document.querySelector('[data-ip-deriv-for="' + k + '"]');
      return { open: panel && !panel.hidden, label: btn.textContent.trim() };
    }, k);
    await wait(400);
    res.push({ ctl: "§02 ƒ " + k, pass: shown.open, detail: JSON.stringify(shown) });
  }
  res.forEach((r) => console.log((r.pass ? "PASS  " : "FAIL  ") + r.ctl + "  " + r.detail));
  console.log("failures:", res.filter((r) => !r.pass).length, "| page errors:", errs.length, errs.slice(0, 3));
  await b.close();
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
