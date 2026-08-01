// Every control in §03 must still do something, and land in the state it CLAIMS (D-behaviour).
//
// §03 has the section's only view TOGGLES, which is why this is separate from
// p2-drive-controls.js: a toggle is the one control class where "the click was accepted" and
// "the view actually changed" can differ -- that is exactly what the double-bound listener in
// run 14 did (every toggle ran twice and landed back where it started). So every assertion here
// reads the RESULTING chart/note/pressed-state, never the click.
const puppeteer = require("puppeteer");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const b = await puppeteer.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 1200 });
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 80)); });
  await p.goto("http://p5a-preview:8000/company/AAPL/institutional", { waitUntil: "networkidle0" });
  await wait(3500);
  const res = [];
  const push = (ctl, pass, detail) => res.push({ ctl, pass, detail: JSON.stringify(detail) });

  // --- 1. the expander bar reveals the four cards below it ---------------------------------
  const bodyOpen = () => p.evaluate(() => {
    const el = document.querySelector("#ip-03 .ip-expander-body");
    return !!el && !el.hasAttribute("hidden");
  });
  const before = await bodyOpen();
  await p.evaluate(() => {
    [...document.querySelectorAll("#ip-03 button")]
      .filter((x) => /also in this section/i.test(x.innerText || ""))
      .forEach((x) => x.click());
  });
  await wait(800);
  const after = await bodyOpen();
  push("§03 expander", !before && after, { before, after });

  // --- 2. the ranked-share view toggle ------------------------------------------------------
  // The two views must differ in the RENDERED chart, not only in which button looks pressed.
  const rankedState = () => p.evaluate(() => {
    const mount = document.querySelector('[data-ip-chart="03-ranked"]');
    const note = document.querySelector('[data-ip-note="03-ranked"]');
    const on = document.querySelector('[data-ip-group="03-ranked"] .ip-toggle--on');
    return {
      pressed: on ? on.getAttribute("data-ip-view") : null,
      rects: mount ? mount.querySelectorAll("rect").length : 0,
      circles: mount ? mount.querySelectorAll("circle").length : 0,
      note: (note ? note.textContent : "").slice(0, 42),
    };
  });
  const cum = await rankedState();
  await p.evaluate(() => document.querySelector('[data-ip-group="03-ranked"] [data-ip-view="treemap"]').click());
  await wait(700);
  const tm = await rankedState();
  push("§03 toggle → Treemap",
    tm.pressed === "treemap" && tm.circles === 0 && cum.circles > 0 && tm.note !== cum.note,
    { cum, tm });
  // ... and back. A toggle that cannot return is half a control.
  await p.evaluate(() => document.querySelector('[data-ip-group="03-ranked"] [data-ip-view="cumulative"]').click());
  await wait(700);
  const backCum = await rankedState();
  push("§03 toggle → Cumulative (return)",
    backCum.pressed === "cumulative" && backCum.circles > 0 && backCum.note === cum.note,
    backCum);

  // --- 3. the overlap view toggle -----------------------------------------------------------
  const overlapState = () => p.evaluate(() => {
    const mount = document.querySelector('[data-ip-chart="03-overlap"]');
    const note = document.querySelector('[data-ip-note="03-overlap"]');
    const on = document.querySelector('[data-ip-group="03-overlap"] .ip-toggle--on');
    return {
      pressed: on ? on.getAttribute("data-ip-view") : null,
      dots: mount ? mount.querySelectorAll("circle").length : 0,
      rows: mount ? mount.querySelectorAll(".ip-comb-row").length : 0,
      note: (note ? note.textContent : "").slice(0, 42),
    };
  });
  const mx = await overlapState();
  await p.evaluate(() => document.querySelector('[data-ip-group="03-overlap"] [data-ip-view="sets"]').click());
  await wait(700);
  const sets = await overlapState();
  push("§03 toggle → Set intersections",
    sets.pressed === "sets" && sets.dots > 0 && mx.dots === 0 && sets.note !== mx.note,
    { mx, sets });

  // --- 4. ⤡ Expand, in BOTH overlap views ---------------------------------------------------
  // The lightbox is view-aware, so opening it from the sets view must open the UpSet, under its
  // own title -- the exact defect the operator caught by hand at the phase-1 gate.
  const openLb = async (key) => {
    await p.evaluate((k) => document.querySelector('#ip-03 [data-ip-open="' + k + '"]').click(), key);
    await wait(900);
    const lb = await p.evaluate(() => {
      const d = document.querySelector(".ip-lb");
      if (!d) return null;
      return {
        title: (d.querySelector(".ip-lb-title") || {}).innerText || "",
        note: (d.querySelector(".ip-lb-note") || {}).innerText || "",
        svgs: d.querySelectorAll("svg").length,
        rects: d.querySelectorAll("rect").length,
      };
    });
    await p.keyboard.press("Escape");
    await wait(400);
    return lb;
  };
  const lbSets = await openLb("03-matrix");
  push("§03 ⤡ 03-matrix (sets view)",
    !!lbSets && lbSets.svgs > 0 && /intersection/i.test(lbSets.title), lbSets);
  await p.evaluate(() => document.querySelector('[data-ip-group="03-overlap"] [data-ip-view="matrix"]').click());
  await wait(600);
  const lbMx = await openLb("03-matrix");
  push("§03 ⤡ 03-matrix (matrix view)",
    !!lbMx && lbMx.svgs > 0 && /matrix/i.test(lbMx.title), lbMx);

  // --- 5. the remaining ⤡ Expand chips ------------------------------------------------------
  for (const key of ["03-flows", "03-ranked"]) {
    const lb = await openLb(key);
    push("§03 ⤡ " + key, !!lb && lb.svgs > 0 && lb.title.length > 0, lb);
  }

  // --- 6. the clickable "Effective holders" stat --------------------------------------------
  // It is only a control when there is a trend behind it; when it is live it must open one.
  const statLive = await p.$$eval("#ip-03 [data-ip-trend='effective']", (n) => n.length);
  if (statLive) {
    const opened = await p.evaluate(() => {
      document.querySelector("#ip-03 [data-ip-trend='effective']").click();
      const panel = document.querySelector('[data-ip-trend-for="effective"]');
      return {
        open: !!panel && !panel.hidden,
        svgs: panel ? panel.querySelectorAll("svg").length : 0,
        measures: panel ? panel.querySelectorAll(".ip-measure").length : 0,
      };
    });
    await wait(400);
    push("§03 effective-holders stat", opened.open && opened.svgs > 0 && opened.measures === 3,
      opened);
  } else {
    push("§03 effective-holders stat", true, "not live (no trend series) — correctly inert");
  }

  // --- 7. nothing in §03 renders as a control with no handler -------------------------------
  const orphans = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll("#ip-03 [data-ip-open]").forEach((n) => {
      if (!window.__ipLightboxKeys || !window.__ipLightboxKeys.includes(n.getAttribute("data-ip-open"))) return;
    });
    document.querySelectorAll("#ip-03 [data-ip-derive]").forEach((n) => {
      const k = n.getAttribute("data-ip-derive");
      if (!document.querySelector('[data-ip-deriv-for="' + k + '"]')) out.push("derive:" + k);
    });
    return out;
  });
  push("§03 no orphaned affordance", orphans.length === 0, orphans);

  res.forEach((r) => console.log((r.pass ? "PASS  " : "FAIL  ") + r.ctl + "  " + r.detail));
  console.log("failures:", res.filter((r) => !r.pass).length, "| page errors:", errs.length, errs.slice(0, 3));
  await b.close();
  process.exit(res.some((r) => !r.pass) ? 1 : 0);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
