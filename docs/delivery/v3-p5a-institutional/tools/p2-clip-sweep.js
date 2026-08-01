// The mandated sweep: any SVG text that leaves its viewBox, and any DOM text that leaves its box,
// across §01+§02 -- WITH THE WEBFONT BLOCKED, which is the condition the captures don't reproduce.
const puppeteer = require("puppeteer");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  for (const block of [false, true]) {
    for (const sym of ["AAPL", "JPM"]) {
      const p = await b.newPage();
      await p.setViewport({ width: 1440, height: 1200 });
      if (block) {
        await p.setRequestInterception(true);
        p.on("request", (r) => (/\.(woff2?|ttf|otf)(\?|$)/i.test(r.url()) ? r.abort() : r.continue()));
      }
      await p.goto("http://p5a-preview:8000/company/" + sym + "/institutional", { waitUntil: "networkidle0" });
      await wait(2800);
      await p.evaluate(() => [...document.querySelectorAll("button")]
        .filter((x) => /also in this section/i.test(x.innerText || "")).forEach((x) => x.click()));
      await wait(1000);
      const o = await p.evaluate(() => {
        const out = { svgOverflow: [], domBleed: [], docScroll: false };
        for (const sec of ["ip-01", "ip-02"]) {
          const root = document.getElementById(sec);
          if (!root) continue;
          root.querySelectorAll("svg").forEach((svg) => {
            const vb = (svg.getAttribute("viewBox") || "").split(/\s+/).map(Number);
            if (vb.length !== 4) return;
            svg.querySelectorAll("text").forEach((t) => {
              let len = 0; try { len = t.getComputedTextLength(); } catch (e) { return; }
              const x = +t.getAttribute("x") || 0;
              const a = t.getAttribute("text-anchor");
              const left = a === "end" ? x - len : a === "middle" ? x - len / 2 : x;
              const right = left + len;
              if (left < vb[0] - 0.5 || right > vb[0] + vb[2] + 0.5) {
                out.svgOverflow.push({ sec, cls: t.getAttribute("class"),
                  text: (t.lastChild && t.lastChild.nodeValue || "").slice(0, 34),
                  left: +left.toFixed(1), right: +right.toFixed(1), vbW: vb[2] });
              }
            });
          });
          root.querySelectorAll("*").forEach((n) => {
            const par = n.parentElement; if (!par) return;
            const a = n.getBoundingClientRect(), c = par.getBoundingClientRect();
            const cs = getComputedStyle(par);
            if (cs.overflowX !== "visible") return;
            if (a.width > 0 && (a.right > c.right + 1.5 || a.left < c.left - 1.5)) {
              out.domBleed.push({ sec, cls: n.className.baseVal ?? n.className,
                text: (n.innerText || "").slice(0, 30) });
            }
          });
        }
        out.docScroll = document.documentElement.scrollWidth > window.innerWidth + 1;
        return out;
      });
      console.log((block ? "BLOCKED " : "LOADED  ") + sym +
        "  svgOverflow=" + o.svgOverflow.length + "  domBleed=" + o.domBleed.length +
        "  docScroll=" + o.docScroll);
      if (o.svgOverflow.length) console.log("   " + JSON.stringify(o.svgOverflow.slice(0, 4)));
      if (o.domBleed.length) console.log("   " + JSON.stringify(o.domBleed.slice(0, 4)));
      await p.close();
    }
  }
  await b.close();
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
