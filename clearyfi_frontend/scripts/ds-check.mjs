#!/usr/bin/env node
/**
 * Warn when the design system has drifted from what was last synced.
 *
 * The claude.ai/design project holds a COMPILED SNAPSHOT of src/components — nothing
 * watches this repo. This compares src/ against the commit recorded at the last sync
 * and tells you when the design agent is building with stale components.
 *
 * Exits 0 always by default (advisory). Pass --strict to exit 1 on drift, e.g. in CI.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const STRICT = process.argv.includes("--strict");
const STATE = ".design-sync/last-sync.json";

if (!existsSync(STATE)) {
  console.log("· no sync recorded yet — run `npm run ds:sync`.");
  process.exit(0);
}

const { commit, projectId } = JSON.parse(readFileSync(STATE, "utf8"));
let changed = "";
try {
  // Tracked edits since the synced commit...
  const tracked = execSync(`git diff --name-only ${commit} -- src/`, { encoding: "utf8" }).trim();
  // ...plus files git does not track yet. A brand-new component is untracked, so `git diff`
  // alone reports "in sync" for exactly the change most likely to matter.
  const untracked = execSync(`git ls-files --others --exclude-standard -- src/`, {
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((f) => `${f}  (untracked)`)
    .join("\n");
  changed = [tracked, untracked].filter(Boolean).join("\n");
} catch {
  console.log(`· cannot compare against ${commit.slice(0, 12)} (unknown commit) — re-sync to reset.`);
  process.exit(0);
}

if (!changed) {
  console.log(`✓ design system in sync (src/ unchanged since ${commit.slice(0, 12)})`);
  process.exit(0);
}

const files = changed.split("\n");
console.log(`⚠ src/ has changed since the last design-system sync (${commit.slice(0, 12)}):\n`);
for (const f of files.slice(0, 15)) console.log(`    ${f}`);
if (files.length > 15) console.log(`    … and ${files.length - 15} more`);
console.log(`\n  The design agent is building with the OLD compiled components.`);
console.log(`  Project: https://claude.ai/design/p/${projectId}`);
console.log(`  Fix:     npm run ds:sync   (then /design-sync in Claude Code to upload)`);
process.exit(STRICT ? 1 : 0);
