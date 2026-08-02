import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = dirname(fileURLToPath(import.meta.url));

/**
 * The prototype app that renders the SEC Sector Analytics designs on top of the
 * `@clearyfi/design-prototype` component library.
 *
 * Two aliases, both deliberate:
 *   `@ds`            -> the library SOURCE, so editing a component hot-reloads the app.
 *   `@ds/styles.css` -> the BUILT stylesheet, because `src/styles/clearyfi.css` @imports
 *                       `./fonts/fonts.css`, and the vendored faces only land next to it
 *                       under `dist/` (see scripts/copy-assets.mjs). `npm run dev` re-copies
 *                       them first so the two never drift.
 */
export default defineConfig({
  root: resolve(ROOT, "app"),
  plugins: [react()],
  resolve: {
    alias: [
      { find: "@ds/styles.css", replacement: resolve(ROOT, "dist/clearyfi.css") },
      { find: "@ds", replacement: resolve(ROOT, "src/index.ts") },
    ],
  },
  server: {
    port: 5174,
    strictPort: true,
    // The API seam. Nothing calls it yet — every figure in this app is synthetic
    // (see app/data/README.md) — but when the real endpoints are plumbed in, they
    // are same-origin here and need no CORS.
    proxy: {
      "/v1": {
        target: process.env.CLEARYFI_API ?? "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: resolve(ROOT, "app-dist"),
    emptyOutDir: true,
  },
});
