// Sequential runner for the focused E2E suite.
//
// Discovers every scripts/e2e-*.mjs (except itself), runs each in its own tsx
// child process, and FAILS FAST on the first non-zero exit. Each E2E already
// creates + cascade-cleans its own throwaway orgs, so a mid-run failure still
// leaves the DB clean. Exit code is 0 only if all scripts pass — suitable for
// `npm test` locally and, later, for CI.
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

import { assertTestDatabase } from "./e2e-guard.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
// Not tests: the runner itself and the shared guard module.
const IGNORE = new Set(["e2e-all.mjs", "e2e-guard.mjs"]);

// Refuse to run the whole suite unless we target a *_test database.
assertTestDatabase({ log: true });

const scripts = readdirSync(here)
  .filter((f) => /^e2e-.*\.mjs$/.test(f) && !IGNORE.has(f))
  .sort();

if (scripts.length === 0) {
  console.error("No scripts/e2e-*.mjs found — nothing to run.");
  process.exit(1);
}

const tsx = join(repoRoot, "node_modules", ".bin", "tsx");
console.log(`Running ${scripts.length} E2E script(s) sequentially (fail-fast):`);

const passed = [];
for (const script of scripts) {
  console.log(`\n──────── ${script} ────────`);
  const res = spawnSync(tsx, [join("scripts", script)], { cwd: repoRoot, stdio: "inherit" });
  if (res.error) {
    console.error(`\n✗ ${script} could not start: ${res.error.message}`);
    process.exit(1);
  }
  if (res.status !== 0) {
    const how = res.status != null ? `exit ${res.status}` : `signal ${res.signal}`;
    console.error(`\n✗ ${script} failed (${how}). Stopping.`);
    console.error(`Passed before failure: ${passed.length}/${scripts.length}`);
    process.exit(1);
  }
  passed.push(script);
}

console.log(`\n✓ All ${scripts.length} E2E scripts passed.`);
