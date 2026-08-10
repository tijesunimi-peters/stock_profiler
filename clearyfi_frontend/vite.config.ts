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
    /*
     * The API seam — same-origin here, so no CORS.
     *
     * `changeOrigin` is deliberately OFF. The API ungates first-party browser calls
     * (`api/auth.py::_is_first_party_browser`): it takes `Sec-Fetch-Site`, and where a browser
     * does not send that it falls back to checking `Origin`/`Referer` against the request's
     * `Host`. `changeOrigin: true` rewrites Host to the TARGET (127.0.0.1:8000) while the
     * referer still names the dev server, so the two can never match and every auth-gated
     * endpoint 401s — the whole institutional view, which is the first view built on them.
     *
     * Preserving Host costs nothing here (the target is a plain local API, not a vhost) and
     * makes the fallback work, so the view loads whether or not the browser sends Sec-Fetch-*.
     */
    proxy: {
      "/v1": {
        target: process.env.CLEARYFI_API ?? "http://127.0.0.1:8000",
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: resolve(ROOT, "app-dist"),
    emptyOutDir: true,
  },
});
