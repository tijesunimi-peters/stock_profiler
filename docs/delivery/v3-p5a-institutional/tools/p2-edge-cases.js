// Empty / error paths: an issuer with no resolvable register, and a bogus symbol.
const puppeteer = require("puppeteer");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  for (const sym of ["JPM", "ZZZZ"]) {
    const p = await b.newPage();
    await p.setViewport({ width: 1440, height: 1200 });
    const errs = [];
    p.on("pageerror", (e) => errs.push("pageerror: " + e.message));
    p.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 90)); });
    await p.goto("http://p5a-preview:8000/company/" + sym + "/institutional", { waitUntil: "networkidle0" });
    await wait(3000);
    const o = await p.evaluate(() => {
      const sec = document.getElementById("ip-01");
      if (!sec) return { missing: true, view: (document.getElementById("view") || {}).innerText?.slice(0, 200) };
      const vals = [...sec.querySelectorAll(".ip-strip-val, .ip-tile-val, .ip-eq-val")].map((n) => n.innerText.trim());
      return {
        strip: [...sec.querySelectorAll(".ip-strip-cell")].map((n) => n.innerText.replace(/\n/g, " | ").slice(0, 110)),
        tiles: [...sec.querySelectorAll(".ip-tile")].map((n) => n.innerText.replace(/\n/g, " | ").slice(0, 90)),
        chart: (sec.querySelector(".ip-chart") || {}).innerText || "(svg)",
        zeros: vals.filter((v) => /^0$|^0\.0|^0%|^—$/.test(v)),
        allVals: vals,
      };
    });
    console.log("### " + sym, JSON.stringify(o, null, 1));
    console.log("   page errors:", errs.length, errs.slice(0, 3));
    await p.close();
  }
  await b.close();
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
