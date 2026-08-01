// End-to-end: rewrite the API response so a manager has a pathologically long name, with the
// webfont blocked too. The gutter must grow and the label must trim -- never clip.
const puppeteer = require("puppeteer");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 1200 });
  await p.setRequestInterception(true);
  p.on("request", async (r) => {
    if (/\.(woff2?|ttf|otf)(\?|$)/i.test(r.url())) return r.abort();
    if (!/institutional-activity/.test(r.url())) return r.continue();
    const res = await fetch(r.url(), { headers: r.headers() });
    const j = await res.json();
    if (j.activity && j.activity[0]) {
      j.activity[0].manager_name =
        "NORTHLESS CAPITAL PARTNERS INTERNATIONAL HOLDINGS MANAGEMENT LLP";
    }
    r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(j) });
  });
  await p.goto("http://p5a-preview:8000/company/JPM/institutional", { waitUntil: "networkidle0" });
  await wait(3500);
  const o = await p.evaluate(() => {
    const svg = document.querySelector("#ip-01 svg.ip-db");
    return {
      gutter: +svg.getAttribute("data-ip-gutter"),
      trackStart: +svg.querySelector("line").getAttribute("x1"),
      labels: [...svg.querySelectorAll("text.ip-db-label")].map((t) => {
        const shown = t.lastChild.nodeValue, full = t.querySelector("title").textContent;
        const len = t.getComputedTextLength(), anchorX = +t.getAttribute("x");
        return { shown, trimmed: shown !== full, fullKept: full.length > shown.length,
          len: +len.toFixed(1), leftEdge: +(anchorX - len).toFixed(1), CLIPPED: anchorX - len < 0 };
      }),
      dotsInside: [...svg.querySelectorAll("circle")].every((c) => +c.getAttribute("cx") >= 0),
    };
  });
  console.log(JSON.stringify(o, null, 1));
  await b.close();
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
