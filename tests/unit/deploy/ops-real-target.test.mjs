import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { assertMigratedTarget } from "../../../scripts/deploy/ops-real.mjs";

// DE-3 regression: target validity (the single-active invariant) over REAL filesystem states. This runs
// in PRECHECK (before build), so an invalid/unmigrated target aborts before any side-effecting build.
function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), "d25tgt-")); }
const clean = (d) => fs.rmSync(d, { recursive: true, force: true });

test("valid migrated target: .next → releases/<stamp> with BUILD_ID → ok", () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, "releases", "r1"), { recursive: true });
  fs.writeFileSync(path.join(dir, "releases", "r1", "BUILD_ID"), "B1");
  fs.symlinkSync("releases/r1", path.join(dir, ".next"));
  assert.deepEqual(assertMigratedTarget(dir, path.join(dir, ".next")), { active: "releases/r1" });
  clean(dir);
});

test("absent .next (fresh/first deploy) → ok (active null)", () => {
  const dir = tmp();
  assert.deepEqual(assertMigratedTarget(dir, path.join(dir, ".next")), { active: null });
  clean(dir);
});

test("REAL-DIRECTORY .next (unmigrated / wrong target — the near-miss state) → THROWS", () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, ".next"));
  fs.writeFileSync(path.join(dir, ".next", "BUILD_ID"), "REAL");
  assert.throws(() => assertMigratedTarget(dir, path.join(dir, ".next")), /real directory, not a symlink/);
  clean(dir);
});

test("dangling / invalid symlink target (no BUILD_ID) → THROWS", () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, "releases", "gone"), { recursive: true }); // exists but no BUILD_ID
  fs.symlinkSync("releases/gone", path.join(dir, ".next"));
  assert.throws(() => assertMigratedTarget(dir, path.join(dir, ".next")), /no BUILD_ID/);
  clean(dir);
});
