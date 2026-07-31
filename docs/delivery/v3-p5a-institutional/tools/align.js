// Find the (dx, dy) device-pixel shift that best aligns a REGION of B onto A.
// Answers the question a band cannot: "is this a layout difference, or the same pixels drawn a
// fraction off?" A best shift of (0,0) that still differs means the content itself differs.
//
//   A=/gt/proto-i3-open.png B=/gt/ours-ip-03-open.png Y=3460 H=120 R=3 node align.js
const fs = require("fs");
const puppeteer = require("puppeteer");
const { A, B, X = "0", Y = "0", W = "0", H = "200", R = "3" } = process.env;
const b64 = (p) => "data:image/png;base64," + fs.readFileSync(p).toString("base64");

(async () => {
  const browser = await puppeteer.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const page = await browser.newPage();
  const res = await page.evaluate(
    async (aSrc, bSrc, x0, y0, w0, h0, r) => {
      const load = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
      const [ia, ib] = await Promise.all([load(aSrc), load(bSrc)]);
      const W = Math.min(ia.width, ib.width), H = Math.min(ia.height, ib.height);
      const px = (img) => {
        const c = document.createElement("canvas");
        c.width = W; c.height = H;
        const g = c.getContext("2d", { willReadFrequently: true });
        g.drawImage(img, 0, 0);
        return g.getImageData(0, 0, W, H).data;
      };
      const da = px(ia), db = px(ib);
      const w = w0 || W - x0;
      const out = [];
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          let sum = 0, n = 0;
          for (let y = y0; y < y0 + h0; y++) {
            const yb = y + dy;
            if (yb < 0 || yb >= H) continue;
            for (let x = x0; x < x0 + w; x++) {
              const xb = x + dx;
              if (xb < 0 || xb >= W) continue;
              const i = (y * W + x) * 4, j = (yb * W + xb) * 4;
              sum += Math.abs(da[i] - db[j]) + Math.abs(da[i + 1] - db[j + 1]) + Math.abs(da[i + 2] - db[j + 2]);
              n++;
            }
          }
          out.push({ dx, dy, mean: +(sum / n).toFixed(4) });
        }
      }
      out.sort((p, q) => p.mean - q.mean);
      return out;
    },
    b64(A), b64(B), +X, +Y, +W, +H, +R
  );
  console.log("best shifts (mean abs channel difference per pixel):");
  res.slice(0, 6).forEach((o) => console.log(`  dx ${o.dx}  dy ${o.dy}  ->  ${o.mean}`));
  const zero = res.find((o) => o.dx === 0 && o.dy === 0);
  console.log(`  (0,0) -> ${zero.mean}`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
