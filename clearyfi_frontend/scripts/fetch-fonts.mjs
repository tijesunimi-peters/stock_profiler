// Vendors the two ClearyFi brand families (STYLE_GUIDE §2) into fonts/ as local woff2 +
// an @font-face stylesheet, so a rendered design never falls back to a system face.
//
// Only the `latin` and `latin-ext` subsets are kept — the product is English-only SEC data,
// and shipping cyrillic/greek/vietnamese would triple the payload for nothing.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FONT_DIR = join(HERE, "..", "fonts");

// A modern desktop UA is required: Google serves woff2 only to browsers it recognizes,
// and the default node/curl UA gets legacy truetype instead.
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const FAMILIES = [
  {
    css: "https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700;800;900&display=swap",
    slug: "hanken-grotesk",
  },
  {
    css: "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap",
    slug: "ibm-plex-mono",
  },
];

const KEEP_SUBSETS = new Set(["latin", "latin-ext"]);

async function get(url, asBuffer = false) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return asBuffer ? Buffer.from(await res.arrayBuffer()) : res.text();
}

/** Split a Google Fonts stylesheet into { subset, block } pairs. */
function parseFaces(css) {
  const out = [];
  // Each @font-face is preceded by a `/* subset */` comment naming its unicode range group.
  const re = /\/\*\s*([a-z-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/g;
  let m;
  while ((m = re.exec(css))) out.push({ subset: m[1], block: m[2] });
  return out;
}

const rules = [];
await mkdir(FONT_DIR, { recursive: true });

for (const family of FAMILIES) {
  const css = await get(family.css);
  const faces = parseFaces(css).filter((f) => KEEP_SUBSETS.has(f.subset));
  if (!faces.length) throw new Error(`no latin faces parsed for ${family.slug}`);

  for (const face of faces) {
    const weight = /font-weight:\s*(\d+)/.exec(face.block)?.[1] ?? "400";
    const url = /src:\s*url\(([^)]+)\)/.exec(face.block)?.[1];
    if (!url) throw new Error(`no src url in ${family.slug} ${weight}`);

    const file = `${family.slug}-${weight}-${face.subset}.woff2`;
    await writeFile(join(FONT_DIR, file), await get(url, true));

    rules.push(face.block.replace(/src:\s*url\([^)]+\)/, `src: url("./${file}")`));
    console.log(`  ${file}`);
  }
}

const header = `/* ClearyFi brand faces, vendored from Google Fonts (latin + latin-ext only).
 * Regenerate with: node scripts/fetch-fonts.mjs
 * Hanken Grotesk = human copy; IBM Plex Mono = every number, tag and caption (STYLE_GUIDE §2). */\n\n`;

await writeFile(join(FONT_DIR, "fonts.css"), header + rules.join("\n\n") + "\n");
console.log(`\n${rules.length} faces -> fonts/fonts.css`);
