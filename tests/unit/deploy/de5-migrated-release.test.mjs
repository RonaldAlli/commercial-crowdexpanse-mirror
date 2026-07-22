import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { makeDeployTsconfig } from "../../../scripts/deploy/ops-real.mjs";

// DE-5 regression (reproduces the exact scenario): a "migrated" sibling release (the D25b migration copied
// the in-place-built .next, whose generated route-types have a DIFFERENT relative-path depth) must NOT break
// the deploy build's type-check. Self-contained: a minimal temp project + a sibling release with a
// depth-mismatched (unresolvable) generated type. Proves the OLD config fails (reproduction) and the DE-5
// exclude makes it pass while source is still checked.

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const TSC = path.join(REPO, "node_modules", ".bin", "tsc");

function runTsc(dir, configName) {
  // Run tsc with a CLEAN env — the unit runner sets NODE_OPTIONS=--import tsx, which the child tsc must not
  // inherit (it would re-hook the tsc process and change its behavior).
  const env = { ...process.env, NODE_OPTIONS: "" };
  try { execFileSync(TSC, ["--noEmit", "-p", configName], { cwd: dir, stdio: "pipe", env }); return { ok: true, out: "" }; }
  catch (e) { return { ok: false, out: `${e.stdout ?? ""}${e.stderr ?? ""}` }; }
}

test("DE-5: deploy tsconfig excludes sibling migrated-release types (repro OLD fails, fix passes; source still checked)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "de5-"));
  fs.writeFileSync(path.join(dir, "tsconfig.json"), JSON.stringify({ compilerOptions: { noEmit: true, skipLibCheck: true, moduleResolution: "node", strict: false } }));
  fs.writeFileSync(path.join(dir, "src.ts"), "export const x = 1;\n");
  // a migrated sibling release with a depth-mismatched generated type (unresolvable import)
  fs.mkdirSync(path.join(dir, "releases", "mig", "types"), { recursive: true });
  fs.writeFileSync(path.join(dir, "releases", "mig", "types", "page.ts"), "import * as e from '../../../../../nope/page.js';\nexport const _e: typeof e = e;\n");

  // OLD (no exclude) → the sibling release's broken type IS checked → fails (reproduces the prod failure)
  fs.writeFileSync(path.join(dir, "tsconfig.deploy.old.json"), JSON.stringify({ extends: "./tsconfig.json", include: ["**/*.ts"] }));
  const oldRun = runTsc(dir, "tsconfig.deploy.old.json");
  assert.equal(oldRun.ok, false, "reproduction: without the exclude, a sibling migrated release breaks the build");
  assert.match(oldRun.out, /releases[/\\]mig/, "the reproduced failure is in the sibling release's generated types");

  // NEW (makeDeployTsconfig's exclude) → sibling release excluded → passes; src.ts is still type-checked
  const cfg = makeDeployTsconfig();
  fs.writeFileSync(path.join(dir, "tsconfig.deploy.new.json"), JSON.stringify({ extends: "./tsconfig.json", include: cfg.include, exclude: cfg.exclude }));
  const newRun = runTsc(dir, "tsconfig.deploy.new.json");
  assert.equal(newRun.ok, true, `fix: with the exclude the deploy build passes; got:\n${newRun.out}`);

  fs.rmSync(dir, { recursive: true, force: true });
});
