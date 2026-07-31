// Click an affordance, then dump the OVERLAY it opened: outerHTML plus the computed style of every
// element in it. For porting a modal you cannot read out of the static markup.
//
//   URL=... SEL='#i3' NAV=1 LABEL='⤡ Expand' node overlay.js
const puppeteer = require("puppeteer");
const { URL: U, SEL, NAV, OPEN, LABEL, NTH = "0", HTML } = process.env;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const clickText = async (p, t) =>
  p.evaluate((t) => {
    const e = [...document.querySelectorAll("button,a,[role=button],div,span,li")].find(
      (e) => (e.innerText || "").trim() === t && e.offsetParent !== null
    );
    if (!e) return false;
    e.click();
    return true;
  }, t);

(async () => {
  const b = await puppeteer.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 1200, deviceScaleFactor: 1 });
  await p.goto(U, { waitUntil: "networkidle0", timeout: 120000 });
  await wait(2200);
  if (NAV === "1") { await clickText(p, "Companies"); await wait(1200); await clickText(p, "Institutional"); await wait(2200); }
  await p.waitForSelector(SEL);
  if (OPEN === "1") {
    await p.evaluate(() => [...document.querySelectorAll("button")]
      .filter((b) => /also in this section/i.test(b.innerText || "")).forEach((b) => b.click()));
    await wait(1500);
  }
  await p.evaluate((sel, label, nth) => {
    const root = document.querySelector(sel);
    const all = [...root.querySelectorAll("button,a,[role=button]")].filter(
      (e) => (e.innerText || "").replace(/\s+/g, " ").trim() === label
    );
    if (all[nth]) all[nth].click();
  }, SEL, LABEL, +NTH);
  await wait(1200);

  const res = await p.evaluate((wantHtml) => {
    // the overlay is the fixed-position element that covers the viewport
    const all = [...document.querySelectorAll("body *")];
    const ov = all.find((e) => {
      const c = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      return c.position === "fixed" && r.width >= window.innerWidth - 2 && r.height >= window.innerHeight - 2;
    });
    if (!ov) return { found: false };
    const KEYS = ["position", "inset", "top", "left", "width", "height", "zIndex", "background",
      "backgroundColor", "display", "alignItems", "justifyContent", "padding", "margin", "border",
      "borderRadius", "boxShadow", "overflow", "overflowY", "maxWidth", "maxHeight", "gap",
      "fontFamily", "fontSize", "fontWeight", "letterSpacing", "textTransform", "color", "lineHeight",
      "flexWrap", "flexDirection", "backdropFilter"];
    const walk = (e, d) => {
      const r = e.getBoundingClientRect();
      const c = getComputedStyle(e);
      const css = {};
      KEYS.forEach((k) => {
        const v = c[k];
        if (v && v !== "none" && v !== "normal" && v !== "auto" && v !== "0px" && v !== "static" &&
            v !== "rgba(0, 0, 0, 0)" && v !== "visible" && v !== "wrap" && !/^0px none/.test(v)) css[k] = v;
      });
      const own = [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).filter(Boolean).join(" ");
      const out = [{ d, tag: e.tagName.toLowerCase(), text: own, w: +r.width.toFixed(1), h: +r.height.toFixed(1),
        x: +r.left.toFixed(1), y: +r.top.toFixed(1), css }];
      [...e.children].forEach((k) => out.push(...walk(k, d + 1)));
      return out;
    };
    return { found: true, tree: walk(ov, 0).slice(0, 40), html: wantHtml === "1" ? ov.outerHTML.slice(0, 4000) : undefined };
  }, HTML);
  console.log(JSON.stringify(res, null, 1));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
