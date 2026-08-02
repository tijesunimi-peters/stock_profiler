// tsc only emits JS/.d.ts — the stylesheet and the vendored brand faces are copied here so
// dist/ is a complete, self-contained package entry.
import { cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");

await mkdir(DIST, { recursive: true });
await cp(join(ROOT, "src", "styles", "clearyfi.css"), join(DIST, "clearyfi.css"));
await cp(join(ROOT, "fonts"), join(DIST, "fonts"), { recursive: true });

console.log("copied clearyfi.css + fonts/ -> dist/");
