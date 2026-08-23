#!/usr/bin/env node
/**
 * Re-sync the design system to claude.ai/design.
 *
 * Rebuilds the package, then runs the design-sync driver. The driver diffs the project's
 * `_ds_sync.json` anchor against the fresh build and reports what changed — so the cost
 * scales with what you edited, not with the size of the library.
 *
 * The UPLOAD itself is not automated: it needs an approved plan on an authenticated
 * session. Run this, then ask Claude Code to "/design-sync" to push what it reports.
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

const run = (cmd) => execSync(cmd, { stdio: "inherit" });

if (!existsSync(".ds-sync/package-build.mjs")) {
  console.error("✗ .ds-sync/ is missing — the converter scripts are staged by the /design-sync skill.");
  console.error("  Run /design-sync in Claude Code; it stages them and drives the whole flow.");
  process.exit(1);
}

console.log("→ building the package");
run("npm run build");

console.log("\n→ running the design-sync driver");
const remote = existsSync(".design-sync/.cache/remote-sync.json")
  ? " --remote .design-sync/.cache/remote-sync.json"
  : "";
if (!remote) {
  console.log("  (no cached anchor — every component will re-verify. Fetch the project's");
  console.log("   _ds_sync.json into .design-sync/.cache/remote-sync.json to scope it.)");
}
run(
  "node .ds-sync/resync.mjs --config .design-sync/config.json" +
    " --node-modules ./node_modules --entry ./dist/index.js --out ./ds-bundle" +
    remote,
);

console.log("\n✓ build + verify done. Read ds-bundle/.resync-verdict.json:");
console.log("  · upload.any === false → the project already matches; nothing to push.");
console.log("  · otherwise → run /design-sync in Claude Code to grade and upload.");
