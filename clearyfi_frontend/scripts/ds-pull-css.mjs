#!/usr/bin/env node
/**
 * Pull stylesheet edits made in the design project back into src/.
 *
 * The ONLY round-trippable artifact in this design system: `copy-assets.mjs` copies
 * src/styles/clearyfi.css to dist/ verbatim, and the converter copies that to
 * _ds_bundle.css verbatim — a byte-for-byte chain, so it can be reversed.
 * Component implementations cannot: they are compiled into _ds_bundle.js.
 *
 * Usage (the fetch step needs Claude Code — a plain script can't read the project):
 *   1. /design-sync fetches _ds_bundle.css -> .design-sync/.cache/remote-bundle.css
 *   2. node scripts/ds-pull-css.mjs            # report divergence, exit 2 if diverged
 *   3. node scripts/ds-pull-css.mjs --apply    # back up, then write it to src/
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import { createHash } from "node:crypto";

const REMOTE = ".design-sync/.cache/remote-bundle.css";
const SOURCE = "src/styles/clearyfi.css";
const APPLY = process.argv.includes("--apply");
const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 12);

if (!existsSync(REMOTE)) {
  console.error(`✗ ${REMOTE} not found.`);
  console.error("  /design-sync fetches it from the project first — this script only compares.");
  process.exit(1);
}

const remote = readFileSync(REMOTE, "utf8");
const source = readFileSync(SOURCE, "utf8");

if (sha(remote) === sha(source)) {
  console.log(`✓ stylesheet in sync (${sha(source)}) — nothing to pull back.`);
  process.exit(0);
}

// ---- sanity guards: never clobber source with something that isn't a plausible successor ----
const problems = [];
if (Buffer.byteLength(remote) < Buffer.byteLength(source) * 0.5)
  problems.push(`remote is ${Buffer.byteLength(remote)}B vs source ${Buffer.byteLength(source)}B — less than half; likely truncated`);
if (!remote.includes(":root")) problems.push("remote has no `:root` block — the token definitions are missing");
for (const t of ["--bg-page", "--ink", "--accent", "--font-sans", "--font-mono"])
  if (!remote.includes(t)) problems.push(`core token ${t} absent from remote`);

// Remote content is written by whoever edited the project. A stylesheet can't execute, but it
// CAN pull in external resources — which would then ship in your app. Flag anything new.
const externals = (css) => [
  ...css.matchAll(/@import\s+url\(\s*['"]?(https?:)?\/\/[^)'"]+/gi),
  ...css.matchAll(/url\(\s*['"]?(https?:)?\/\/[^)'"]+/gi),
].map((m) => m[0].slice(0, 90));
const newExternal = externals(remote).filter((u) => !externals(source).includes(u));

// ---- report ----
const rules = (css) => {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");        // strip comments first
  const out = new Set();
  for (const m of bare.matchAll(/(?:^|[};])\s*([^@{};][^{}]*?)\s*\{/g)) {
    const sel = m[1].replace(/\s+/g, " ").trim();
    if (sel) out.add(sel);
  }
  return out;
};
const [rs, rr] = [rules(source), rules(remote)];
const added = [...rr].filter((r) => !rs.has(r));
const removed = [...rs].filter((r) => !rr.has(r));
const tok = (css) => new Set(css.match(/--[a-z0-9-]+(?=\s*:)/g) ?? []);
const [ts, tr] = [tok(source), tok(remote)];

// Which side is ahead? Applying is only ever right when the PROJECT has changes the source
// lacks. If the source is strictly ahead — the normal case after editing clearyfi.css locally —
// applying would silently delete that work, so say so plainly instead of offering it.
const sourceAhead = added.length === 0 && removed.length > 0;
console.log(`⚠ stylesheet diverged\n`);
const B = (s) => Buffer.byteLength(s, "utf8");
console.log(`  source  ${SOURCE.padEnd(28)} ${String(B(source)).padStart(6)}B  ${sha(source)}`);
console.log(`  remote  ${"(the design project)".padEnd(28)} ${String(B(remote)).padStart(6)}B  ${sha(remote)}\n`);
if (added.length)   console.log(`  + ${added.length} selector(s) the project has and src/ does not: ${added.slice(0, 8).join(", ")}${added.length > 8 ? " …" : ""}`);
if (removed.length) console.log(`  − ${removed.length} selector(s) src/ has and the project does not: ${removed.slice(0, 8).join(", ")}${removed.length > 8 ? " …" : ""}`);
const tAdd = [...tr].filter((t) => !ts.has(t));
const tDel = [...ts].filter((t) => !tr.has(t));
if (tAdd.length) console.log(`  + tokens: ${tAdd.join(", ")}`);
if (tDel.length) console.log(`  − tokens: ${tDel.join(", ")}   ← removing a token breaks every var() using it`);

if (newExternal.length) {
  console.log(`\n  ⚠ NEW EXTERNAL RESOURCE(S) — these would ship in your app:`);
  for (const u of newExternal) console.log(`      ${u}`);
}
if (problems.length) {
  console.log(`\n✗ refusing to apply:`);
  for (const p of problems) console.log(`    · ${p}`);
  process.exit(1);
}

if (sourceAhead) {
  console.log(`\n  → src/ is AHEAD of the project: every difference is something src/ has and the`);
  console.log(`    project lacks. Nothing was edited online. Applying would DELETE that local work.`);
  console.log(`    Rebuild and re-sync to push it up instead.`);
  if (!APPLY) process.exit(2);
  console.log(`\n✗ refusing --apply while src/ is strictly ahead — this would only discard work.`);
  console.log(`  If you really mean to revert src/ to the project's copy, restore it from git.`);
  process.exit(1);
}

if (!APPLY) {
  console.log(`\n  Review:  diff ${SOURCE} ${REMOTE}`);
  console.log(`  Apply :  node scripts/ds-pull-css.mjs --apply`);
  process.exit(2);
}

const backup = `${SOURCE}.bak`;
copyFileSync(SOURCE, backup);
writeFileSync(SOURCE, remote);
console.log(`\n✓ wrote ${SOURCE} (backup at ${backup})`);
console.log(`  Next: npm run build && npm run ds:sync`);
console.log(`  The change is in source now — commit it, or restore from the backup.`);
