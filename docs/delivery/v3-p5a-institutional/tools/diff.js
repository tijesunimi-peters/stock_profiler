// Pixel diff of two PNG captures, computed inside Chromium's own canvas (no image deps).
//
//   A=/gt/proto-i2-open.png B=/gt/ours-ip-02-open.png OUT=/gt/diff-i02-open.png node diff.js
//
// Prints: dimensions, differing-pixel counts at three thresholds, the contiguous ROW BANDS where
// the difference is structural (not rasterisation noise), and the worst rows inside each band.
// Writes an amplified (x6) diff PNG. Bands are what matter -- scattered pixels are antialiasing,
// a band is a layout difference.
const fs = require("fs");
const puppeteer = require("puppeteer");
const { A, B, OUT, BAND_MIN_PX = "20", BAND_MIN_ROWS = "2", THRESH = "32" } = process.env;

const b64 = (p) => "data:image/png;base64," + fs.readFileSync(p).toString("base64");

(async () => {
  const browser = await puppeteer.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const page = await browser.newPage();
  const res = await page.evaluate(
    async (aSrc, bSrc, bandMinPx, bandMinRows, thresh) => {
      const load = (src) =>
        new Promise((ok, no) => {
          const i = new Image();
          i.onload = () => ok(i);
          i.onerror = no;
          i.src = src;
        });
      const [ia, ib] = await Promise.all([load(aSrc), load(bSrc)]);
      const w = Math.min(ia.width, ib.width);
      const h = Math.min(ia.height, ib.height);
      const px = (img) => {
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const x = c.getContext("2d", { willReadFrequently: true });
        x.drawImage(img, 0, 0);
        return x.getImageData(0, 0, w, h).data;
      };
      const da = px(ia);
      const db = px(ib);

      const outC = document.createElement("canvas");
      outC.width = w;
      outC.height = h;
      const outX = outC.getContext("2d");
      const out = outX.createImageData(w, h);

      let any = 0,
        gt8 = 0,
        gtT = 0;
      const rowsT = new Int32Array(h);
      const colsT = new Int32Array(w);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const d = Math.max(
            Math.abs(da[i] - db[i]),
            Math.abs(da[i + 1] - db[i + 1]),
            Math.abs(da[i + 2] - db[i + 2])
          );
          if (d > 0) any++;
          if (d > 8) gt8++;
          if (d > thresh) {
            gtT++;
            rowsT[y]++;
            colsT[x]++;
          }
          const v = Math.min(255, d * 6);
          out.data[i] = 255 - v;
          out.data[i + 1] = 255 - v;
          out.data[i + 2] = 255;
          out.data[i + 3] = 255;
        }
      }
      outX.putImageData(out, 0, 0);

      // contiguous row bands
      const bands = [];
      let start = -1;
      for (let y = 0; y <= h; y++) {
        const hot = y < h && rowsT[y] >= bandMinPx;
        if (hot && start < 0) start = y;
        if (!hot && start >= 0) {
          if (y - start >= bandMinRows) {
            let peak = 0,
              peakY = start,
              sum = 0;
            for (let k = start; k < y; k++) {
              sum += rowsT[k];
              if (rowsT[k] > peak) {
                peak = rowsT[k];
                peakY = k;
              }
            }
            bands.push({ y0: start, y1: y - 1, rows: y - start, peak, peakY, px: sum });
          }
          start = -1;
        }
      }
      // hottest columns, bucketed by 10px, for locating a band horizontally
      const buckets = [];
      for (let x = 0; x < w; x += 10) {
        let s = 0;
        for (let k = x; k < Math.min(w, x + 10); k++) s += colsT[k];
        if (s) buckets.push([x, s]);
      }
      buckets.sort((p, q) => q[1] - p[1]);

      return {
        w,
        h,
        aw: ia.width,
        ah: ia.height,
        bw: ib.width,
        bh: ib.height,
        total: w * h,
        any,
        gt8,
        gtT,
        bands,
        hotCols: buckets.slice(0, 12),
        png: outC.toDataURL("image/png"),
      };
    },
    b64(A),
    b64(B),
    +BAND_MIN_PX,
    +BAND_MIN_ROWS,
    +THRESH
  );

  if (OUT) fs.writeFileSync(OUT, Buffer.from(res.png.split(",")[1], "base64"));
  const pct = (n) => ((n / res.total) * 100).toFixed(3) + "%";
  console.log(`A ${res.aw}x${res.ah}   B ${res.bw}x${res.bh}   compared ${res.w}x${res.h}`);
  if (res.ah !== res.bh) console.log(`!! HEIGHT DIFFERS by ${(res.bh - res.ah).toFixed(1)}px`);
  console.log(`any>0  ${res.any} (${pct(res.any)})`);
  console.log(`  >8   ${res.gt8} (${pct(res.gt8)})`);
  console.log(` >${THRESH}   ${res.gtT} (${pct(res.gtT)})`);
  console.log(`bands (>=${BAND_MIN_PX}px on >=${BAND_MIN_ROWS} consecutive rows): ${res.bands.length}`);
  res.bands.forEach((b) =>
    console.log(`  y ${b.y0}-${b.y1}  (${b.rows} rows)  peak ${b.peak}px @ y${b.peakY}  total ${b.px}px`)
  );
  console.log("hot columns (x, px):", JSON.stringify(res.hotCols));
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
