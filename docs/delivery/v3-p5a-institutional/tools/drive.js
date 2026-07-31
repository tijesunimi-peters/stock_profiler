// End-to-end driving pass over the port's live affordances: click each, assert what it did, and
// click it back. Prints one PASS/FAIL line per check. Run against ours; the expectations were
// read off the prototype.
const puppeteer = require("puppeteer");
const { URL: U } = process.env;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  (ok ? pass++ : fail++);
  console.log((ok ? "  PASS  " : "  FAIL  ") + name + (detail ? "   [" + detail + "]" : ""));
};
const q = (p, fn, ...a) => p.evaluate(fn, ...a);

(async () => {
  const b = await puppeteer.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const p = await b.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  p.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text()); });
  await p.setViewport({ width: 1440, height: 1200, deviceScaleFactor: 1 });
  await p.goto(U, { waitUntil: "networkidle0", timeout: 90000 });
  await p.waitForSelector("#ip-03");
  await wait(800);

  const clickSel = (s) => q(p, (s) => { const e = document.querySelector(s); if (!e) return false; e.click(); return true; }, s);

  // ---- 1. ⤡ Expand opens a lightbox, with the right title, and closes three ways
  for (const [key, title] of [["03-flows", "Position changes over time"],
                              ["03-ranked", "Cumulative share of the register"],
                              ["02-register", "Register over time"],
                              ["04-lanes", "Beneficial ownership filings"],
                              ["05-cohorts", "Holder persistence by entry cohort"]]) {
    await clickSel('[data-ip-open="' + key + '"]');
    await wait(600);
    const got = await q(p, () => {
      const lb = document.querySelector(".ip-lb");
      if (!lb) return null;
      const svg = lb.querySelector("svg");
      return { title: lb.querySelector(".ip-lb-title").textContent.trim(),
        vb: svg && svg.getAttribute("viewBox"),
        w: Math.round(lb.querySelector(".ip-lb-body").getBoundingClientRect().width) };
    });
    check("Expand[" + key + "] opens with the prototype's title",
      got && got.title === title, got ? got.title + " · vb " + got.vb : "no lightbox");
    check("Expand[" + key + "] chart authored AT the modal width (no upscaling)",
      !!got && !!got.vb && Math.abs(parseFloat(got.vb.split(" ")[2]) - (got.w + 2)) <= 2,
      got ? "vb " + got.vb + " vs body " + got.w : "");
    await p.keyboard.press("Escape");
    await wait(400);
    check("Expand[" + key + "] closes on Escape", !(await q(p, () => !!document.querySelector(".ip-lb"))));
  }
  await clickSel('[data-ip-open="03-flows"]');
  await wait(500);
  await clickSel(".ip-lb-close");
  await wait(400);
  check("lightbox closes on the Close button", !(await q(p, () => !!document.querySelector(".ip-lb"))));
  await clickSel('[data-ip-open="03-flows"]');
  await wait(500);
  await q(p, () => { const lb = document.querySelector(".ip-lb"); lb.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); });
  await wait(400);
  check("lightbox closes on a backdrop click", !(await q(p, () => !!document.querySelector(".ip-lb"))));

  // ---- 2. ƒ DERIVED toggles a panel and its own label
  const badge = '[data-ip-derive="01-share"]';
  check("derivation panel starts hidden", await q(p, () => document.querySelector('[data-ip-deriv-for="01-share"]').hidden));
  await clickSel(badge); await wait(400);
  const open = await q(p, () => {
    const b = document.querySelector('[data-ip-derive="01-share"]');
    const d = document.querySelector('[data-ip-deriv-for="01-share"]');
    return { label: b.textContent.trim(), expanded: b.getAttribute("aria-expanded"),
      hidden: d.hidden, w: Math.round(d.getBoundingClientRect().width),
      formula: d.querySelector(".ip-deriv-formula").textContent.trim() };
  });
  check("ƒ DERIVED reveals the panel", open.hidden === false);
  check("ƒ DERIVED flips its label to ƒ hide", open.label === "ƒ hide", open.label);
  check("aria-expanded tracks the panel", open.expanded === "true");
  check("panel spans the section, not the tile (no clipped source column)", open.w > 600, open.w + "px");
  check("panel carries the prototype's formula",
    open.formula === "Sum of 13F-reported shares ÷ cover-page shares outstanding", open.formula);
  await clickSel(badge); await wait(400);
  check("ƒ hide closes it again", await q(p, () => {
    const b = document.querySelector('[data-ip-derive="01-share"]');
    return document.querySelector('[data-ip-deriv-for="01-share"]').hidden && b.textContent.trim() === "ƒ derived";
  }));

  // ---- 3. the chart-view toggles
  const state = () => q(p, () => {
    const m = document.querySelector('[data-ip-chart="03-ranked"]');
    const svg = m.querySelector("svg");
    return {
      vb: svg.getAttribute("viewBox"),
      rects: svg.querySelectorAll("rect").length,
      note: document.querySelector('[data-ip-note="03-ranked"]').textContent.trim().slice(0, 40),
      chip: !document.querySelector('[data-ip-open="03-ranked"]').hidden,
      pressed: [].slice.call(document.querySelectorAll('[data-ip-group="03-ranked"] [data-ip-view]'))
        .map(function (b) { return b.getAttribute("aria-pressed"); }).join(","),
    };
  });

  var s0 = await state();
  check("default view is the ranked chart", s0.vb === "0 0 660 250" && s0.rects === 10, s0.vb + " · " + s0.rects + " rects");
  check("default toggle state is Cumulative share", s0.pressed === "true,false", s0.pressed);

  await clickSel('[data-ip-group="03-ranked"] [data-ip-view="treemap"]');
  await wait(500);
  var s1 = await state();
  check("Treemap swaps in the treemap", s1.vb === "0 0 660 343" && s1.rects === 11, s1.vb + " · " + s1.rects + " rects");
  check("Treemap swaps the caption too", /^Percentages are of shares outstanding/.test(s1.note), s1.note);
  check("Treemap moves the pressed state", s1.pressed === "false,true", s1.pressed);
  check("⤡ Expand stays visible in treemap view (the prototype keeps it)", s1.chip === true);

  await clickSel('[data-ip-open="03-ranked"]');
  await wait(600);
  var lb = await q(p, () => {
    const l = document.querySelector(".ip-lb");
    return l && { title: l.querySelector(".ip-lb-title").textContent.trim(),
      vb: l.querySelector("svg").getAttribute("viewBox") };
  });
  check("Expand follows the active view (treemap)",
    !!lb && lb.title === "Who holds what", lb ? lb.title + " · " + lb.vb : "no lightbox");
  await p.keyboard.press("Escape");
  await wait(300);

  await clickSel('[data-ip-group="03-ranked"] [data-ip-view="cumulative"]');
  await wait(500);
  var s2 = await state();
  check("Cumulative share swaps back", s2.vb === s0.vb && s2.rects === s0.rects && s2.pressed === s0.pressed);
  check("and restores its own caption", /^Bars are each manager/.test(s2.note), s2.note);

  // ---- 4. the overlap card's second view
  var ov = () => q(p, () => {
    const m = document.querySelector('[data-ip-chart="03-overlap"]');
    const svg = m.querySelector("svg");
    return { vb: svg.getAttribute("viewBox"), rects: svg.querySelectorAll("rect").length,
      rows: m.querySelectorAll(".ip-comb-row").length,
      note: document.querySelector('[data-ip-note="03-overlap"]').textContent.trim().slice(0, 34),
      pressed: [].slice.call(document.querySelectorAll('[data-ip-group="03-overlap"] [data-ip-view]'))
        .map(function (b) { return b.getAttribute("aria-pressed"); }).join(",") };
  });
  var m0 = await ov();
  check("overlap defaults to the peer matrix", m0.vb === "0 0 370 370" && m0.pressed === "true,false", m0.vb);
  await clickSel('[data-ip-group="03-overlap"] [data-ip-view="sets"]');
  await wait(500);
  var m1 = await ov();
  check("Set intersections swaps in the UpSet plot", m1.vb === "0 0 720 270", m1.vb);
  check("...with its eight combination rows", m1.rows === 8, m1.rows + " rows");
  check("...and its own caption", /^Each bar is the number of manage/.test(m1.note), m1.note);
  check("Set intersections moves the pressed state", m1.pressed === "false,true", m1.pressed);
  await clickSel('[data-ip-open="03-matrix"]');
  await wait(600);
  var olb = await q(p, () => {
    const l = document.querySelector(".ip-lb");
    return l && { title: l.querySelector(".ip-lb-title").textContent.trim(),
      vb: l.querySelector("svg").getAttribute("viewBox") };
  });
  check("overlap Expand follows the active view (set intersections)",
    !!olb && olb.title === "Manager set intersections" && olb.vb === "0 0 1316 480",
    olb ? olb.title + " · " + olb.vb : "no lightbox");
  await p.keyboard.press("Escape");
  await wait(300);

  await clickSel('[data-ip-group="03-overlap"] [data-ip-view="matrix"]');
  await wait(500);
  var m2 = await ov();
  check("Peer matrix swaps back", m2.vb === m0.vb && m2.rows === 0 && m2.pressed === m0.pressed);
  await clickSel('[data-ip-open="03-matrix"]');
  await wait(600);
  var olb2 = await q(p, () => {
    const l = document.querySelector(".ip-lb");
    return l && { title: l.querySelector(".ip-lb-title").textContent.trim(),
      vb: l.querySelector("svg").getAttribute("viewBox") };
  });
  check("overlap Expand follows the active view (peer matrix)",
    !!olb2 && olb2.title === "Peer overlap matrix" && olb2.vb === "0 0 936 936",
    olb2 ? olb2.title + " · " + olb2.vb : "no lightbox");
  await p.keyboard.press("Escape");
  await wait(300);

  // ---- 5. the inline trend panels
  for (const [key, title] of [["residual", "Unreported residual"],
                              ["effective", "Effective number of holders"]]) {
    check("trend[" + key + "] starts hidden",
      await q(p, (k) => document.querySelector('[data-ip-trend-for="' + k + '"]').hidden, key));
    await clickSel('[data-ip-trend="' + key + '"]');
    await wait(500);
    var tp = await q(p, (k) => {
      const d = document.querySelector('[data-ip-trend-for="' + k + '"]');
      const c = document.querySelector('[data-ip-trend="' + k + '"]');
      return { hidden: d.hidden, title: d.querySelector(".ip-trend-title").textContent.trim(),
        vb: d.querySelector("svg").getAttribute("viewBox"),
        measures: d.querySelectorAll(".ip-measure").length,
        expanded: c.getAttribute("aria-expanded") };
    }, key);
    check("trend[" + key + "] opens with the prototype's title", !tp.hidden && tp.title === title, tp.title);
    check("trend[" + key + "] chart is the prototype's 632x190", tp.vb === "0 0 632 190", tp.vb);
    check("trend[" + key + "] aria-expanded tracks it", tp.expanded === "true");
    if (key === "effective") check("...and carries the three measures behind it", tp.measures === 3, tp.measures + "");
    await clickSel('[data-ip-trend="' + key + '"]');
    await wait(400);
    check("trend[" + key + "] closes again",
      await q(p, (k) => document.querySelector('[data-ip-trend-for="' + k + '"]').hidden, key));
  }

  // ---- 6. every "↗" is a real link to EDGAR
  var links = await q(p, () => [].slice.call(document.querySelectorAll("#view .ip-card-link")).map(
    (a) => ({ tag: a.tagName.toLowerCase(), href: a.getAttribute("href"), target: a.getAttribute("target"), rel: a.getAttribute("rel") })));
  // §01-§03 link at EDGAR full-text search, §04 at the registrant's own filings by CIK
  // (cgi-bin/browse-edgar). Both are the prototype's own targets.
  check("every ↗ link is a real anchor to sec.gov, opened safely",
    links.length >= 8 && links.every((l) => l.tag === "a" && /^https:\/\/www\.sec\.gov\//.test(l.href || "") &&
      l.target === "_blank" && /noopener/.test(l.rel || "")), links.length + " links");

  // ---- 7. nothing left silently inert
  var inert = await q(p, () => [].slice.call(document.querySelectorAll("#view button")).filter(
    (b) => !b.dataset.ipOpen && !b.dataset.ipDerive && !b.dataset.ipView && !b.dataset.ipTrend &&
           !b.dataset.ipLabel && !b.className.includes("ip-expander-btn") && !b.className.includes("ip-lb-close")
  ).map((b) => (b.innerText || "").trim()));
  for (const key of ["05-turnover", "05-tenure"]) {
    check("§05 derivation[" + key + "] starts hidden",
      await q(p, (k) => document.querySelector('[data-ip-deriv-for="' + k + '"]').hidden, key));
    await clickSel('[data-ip-derive="' + key + '"]');
    await wait(400);
    var d5 = await q(p, (k) => {
      const d = document.querySelector('[data-ip-deriv-for="' + k + '"]');
      const b = document.querySelector('[data-ip-derive="' + k + '"]');
      return { hidden: d.hidden, label: b.textContent.trim(), w: Math.round(d.getBoundingClientRect().width) };
    }, key);
    check("§05 derivation[" + key + "] opens under its own card", !d5.hidden && d5.w > 600,
      d5.w + "px");
    check("§05 derivation[" + key + "] flips its label", d5.label === "ƒ hide", d5.label);
    await clickSel('[data-ip-derive="' + key + '"]');
    await wait(300);
    check("§05 derivation[" + key + "] closes again",
      await q(p, (k) => document.querySelector('[data-ip-deriv-for="' + k + '"]').hidden, key));
  }

  var links04 = await q(p, () => [].slice.call(document.querySelectorAll("#ip-04 .ip-card-link")).map(
    (a) => a.getAttribute("href")));
  check("§04's links point at the registrant's own EDGAR filings (SC 13, 8-K, N-PX)",
    links04.length === 4 && links04.filter((h) => /CIK=0527298/.test(h)).length === 3 &&
    links04.filter((h) => /forms=N-PX/.test(h)).length === 1, JSON.stringify(links04.length));

  check("the only unwired control is §01's label-only badge (the prototype opens nothing there)",
    inert.length === 1 && /DERIVED|HIDE/i.test(inert[0]), JSON.stringify(inert));

  check("no page or console errors during the whole pass", errs.length === 0, errs.join(" | "));
  console.log("\n  " + pass + " passed, " + fail + " failed");
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
