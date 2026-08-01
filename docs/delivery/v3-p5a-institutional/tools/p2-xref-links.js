// Assert the two new cross-view links actually hop to the Insider view (D-behaviour).
const puppeteer = require("puppeteer");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 1200 });
  const errs = [];
  p.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  p.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text()); });
  const base = "http://p5a-preview:8000/company/AAPL/institutional";
  const out = [];

  for (const [name, prep] of [
    ["§01 xref", async () => {}],
    ["§06 xref", async () => {
      await p.evaluate(() => {
        [...document.querySelectorAll("button")]
          .filter((x) => /also in this section/i.test(x.innerText || ""))
          .forEach((x) => x.click());
      });
      await wait(800);
    }],
  ]) {
    await p.goto(base, { waitUntil: "networkidle0" });
    await wait(1500);
    await prep();
    const links = await p.$$eval("[data-ip-go]", (ns) =>
      ns.map((n) => ({ text: n.innerText.trim(), href: n.getAttribute("href") })));
    const idx = name.startsWith("§01") ? 0 : links.length - 1;
    out.push({ check: name + " present", pass: links.length > 0, detail: JSON.stringify(links[idx] || null) });
    if (!links.length) continue;
    await p.evaluate((i) => document.querySelectorAll("[data-ip-go]")[i].click(), idx);
    await wait(1800);
    const after = await p.evaluate(() => ({
      path: location.pathname,
      heading: (document.querySelector("#view h2, #view h3, #view .rr-empty p, #view table") || {}).innerText || "(none)",
      hasInst: !!document.getElementById("ip-01"),
    }));
    out.push({ check: name + " -> insider view", pass: after.path.endsWith("/insider") && !after.hasInst,
      detail: JSON.stringify(after).slice(0, 160) });
  }
  out.forEach((o) => console.log((o.pass ? "PASS  " : "FAIL  ") + o.check + "   " + o.detail));
  console.log("failures:", out.filter((o) => !o.pass).length, "| page errors:", errs.length, errs.slice(0, 3));
  await b.close();
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
