// Every control in §04 must still do something (D-behaviour).
//
// §04 has the FEWEST controls and the MOST empty space, which is its own risk: two of its four
// cards are honest empty states (D-voting), and an empty state must not quietly keep a control
// its data can no longer feed. So this asserts the empty cards have no orphaned affordance AND
// that the two remaining live controls still work.
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

  // --- 1. the expander reveals vote-weighted ownership + the activism trail ----------------
  const bodyOpen = () => p.evaluate(() => {
    const el = document.querySelector("#ip-04 .ip-expander-body");
    return !!el && !el.hasAttribute("hidden");
  });
  const before = await bodyOpen();
  await p.evaluate(() => {
    [...document.querySelectorAll("#ip-04 button")]
      .filter((x) => /also in this section/i.test(x.innerText || ""))
      .forEach((x) => x.click());
  });
  await wait(800);
  const after = await bodyOpen();
  push("§04 expander", !before && after, { before, after });

  // --- 2. the lane chart's ⤡ Expand ---------------------------------------------------------
  const chips = await p.$$eval("#ip-04 .ip-chip", (ns) => ns.map((n) => n.getAttribute("data-ip-open")));
  for (const key of chips) {
    await p.evaluate((k) => document.querySelector('#ip-04 [data-ip-open="' + k + '"]').click(), key);
    await wait(900);
    const lb = await p.evaluate(() => {
      const d = document.querySelector(".ip-lb");
      if (!d) return null;
      return {
        title: (d.querySelector(".ip-lb-title") || {}).innerText || "",
        svgs: d.querySelectorAll("svg").length,
        // Re-authored at the dialog's width, not scaled -- so it must have real filing dots.
        dots: d.querySelectorAll("circle").length,
      };
    });
    push("§04 ⤡ " + key, !!lb && lb.svgs > 0 && lb.dots > 0, lb);
    await p.keyboard.press("Escape");
    await wait(400);
  }

  // --- 3. the ↗ links are real anchors, and follow the VIEWED issuer ------------------------
  const links = await p.$$eval("#ip-04 a.ip-card-link", (ns) =>
    ns.map((n) => ({
      text: n.textContent.trim(),
      href: n.getAttribute("href"),
      target: n.getAttribute("target"),
      rel: n.getAttribute("rel"),
    })));
  const badLinks = links.filter((l) =>
    !/^https:\/\/(www\.)?sec\.gov\//.test(l.href || "") ||
    l.target !== "_blank" ||
    !/noopener/.test(l.rel || "") ||
    !/AAPL/.test(decodeURIComponent(l.href || "")));
  push("§04 ↗ links (" + links.length + ")",
    links.length > 0 && badLinks.length === 0,
    badLinks.length ? badLinks : links.map((l) => l.text));

  // --- 4. an empty card keeps NO affordance its data can no longer feed ---------------------
  const orphans = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll("#ip-04 .ip-card").forEach((card) => {
      if (!card.querySelector(".ip-rr-empty")) return;
      const title = ((card.querySelector(".ip-card-title") || {}).textContent || "").trim();
      card.querySelectorAll(".ip-chip, .ip-toggle, [data-ip-derive], [data-ip-trend]")
        .forEach((n) => out.push(title + " → " + (n.className || n.tagName)));
    });
    document.querySelectorAll("#ip-04 [data-ip-derive]").forEach((n) => {
      const k = n.getAttribute("data-ip-derive");
      if (!document.querySelector('[data-ip-deriv-for="' + k + '"]')) out.push("derive:" + k);
    });
    return out;
  });
  push("§04 no orphaned affordance on an empty card", orphans.length === 0, orphans);

  // --- 5. the two empty states must say DIFFERENT things (D-voting) -------------------------
  // Item 5.07 is a SCOPE decision ("we do not parse HTML"); N-PX is a COVERAGE gap ("not yet").
  // Collapsing them into one "not available" would misreport the first as a backlog item.
  const reasons = await p.$$eval("#ip-04 .ip-rr-empty p", (ns) => ns.map((n) => n.textContent));
  const htmlScope = reasons.some((r) => /narrative HTML|does not parse HTML/i.test(r));
  const npxGap = reasons.some((r) => /not ingested yet/i.test(r));
  push("§04 the two empty states differ in KIND", htmlScope && npxGap,
    { htmlScope, npxGap, count: reasons.length });

  res.forEach((r) => console.log((r.pass ? "PASS  " : "FAIL  ") + r.ctl + "  " + r.detail));
  console.log("failures:", res.filter((r) => !r.pass).length, "| page errors:", errs.length, errs.slice(0, 3));
  await b.close();
  process.exit(res.some((r) => !r.pass) ? 1 : 0);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
