// Crop the SAME region out of the prototype capture and ours, and stack them (proto on top,
// ours below, amplified diff at the bottom) into one PNG small enough to actually look at.
//
//   A=/gt/proto-i2-open.png B=/gt/ours-ip-02-open.png OUT=/gt/crop.png \
//   X=0 Y=378 W=694 H=70 DPR=2 node crop.js
//
// X/Y/W/H are CSS px; DPR scales them to the capture's device pixels.
const fs = require("fs");
const puppeteer = require("puppeteer");
const { A, B, OUT, X = "0", Y = "0", W = "694", H = "100", DPR = "2", ZOOM = "1" } = process.env;
const b64 = (p) => "data:image/png;base64," + fs.readFileSync(p).toString("base64");

(async () => {
  const browser = await puppeteer.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const page = await browser.newPage();
  const png = await page.evaluate(
    async (aSrc, bSrc, x, y, w, h, dpr, zoom) => {
      const load = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
      const [ia, ib] = await Promise.all([load(aSrc), load(bSrc)]);
      const sx = x * dpr, sy = y * dpr, sw = w * dpr, sh = h * dpr;
      const cw = Math.round(sw * zoom), ch = Math.round(sh * zoom);
      const grab = (img) => {
        const c = document.createElement("canvas");
        c.width = cw; c.height = ch;
        const g = c.getContext("2d", { willReadFrequently: true });
        g.imageSmoothingEnabled = false;
        g.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
        return c;
      };
      const ca = grab(ia), cb = grab(ib);
      const pa = ca.getContext("2d").getImageData(0, 0, cw, ch);
      const pb = cb.getContext("2d").getImageData(0, 0, cw, ch);
      const cd = document.createElement("canvas");
      cd.width = cw; cd.height = ch;
      const gd = cd.getContext("2d");
      const im = gd.createImageData(cw, ch);
      for (let i = 0; i < pa.data.length; i += 4) {
        const d = Math.max(
          Math.abs(pa.data[i] - pb.data[i]),
          Math.abs(pa.data[i + 1] - pb.data[i + 1]),
          Math.abs(pa.data[i + 2] - pb.data[i + 2])
        );
        const v = Math.min(255, d * 6);
        im.data[i] = 255; im.data[i + 1] = 255 - v; im.data[i + 2] = 255 - v; im.data[i + 3] = 255;
      }
      gd.putImageData(im, 0, 0);

      const gap = 6;
      const out = document.createElement("canvas");
      out.width = cw;
      out.height = ch * 3 + gap * 2;
      const g = out.getContext("2d");
      g.fillStyle = "#000"; g.fillRect(0, 0, out.width, out.height);
      g.drawImage(ca, 0, 0);
      g.drawImage(cb, 0, ch + gap);
      g.drawImage(cd, 0, (ch + gap) * 2);
      return out.toDataURL("image/png");
    },
    b64(A), b64(B), +X, +Y, +W, +H, +DPR, +ZOOM
  );
  fs.writeFileSync(OUT, Buffer.from(png.split(",")[1], "base64"));
  console.log("wrote", OUT, "(proto / ours / diff, top to bottom)");
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
