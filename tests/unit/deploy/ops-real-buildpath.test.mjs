import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { resolveDistDir } from "../../../scripts/deploy/ops-real.mjs";

// DE-1 regression. The sandbox engine test injects a fake build op, so it could NOT catch this: the real
// defect was that ops-real passed an ABSOLUTE NEXT_DIST_DIR while next.config joins distDir onto the
// project root, nesting the output. These tests pin the build-path contract at the real-ops boundary.

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

test("DE-1: NEXT_DIST_DIR is RELATIVE and (as Next joins it) resolves to the expected release dir", () => {
  const appDir = "/opt/app";
  const releasesDir = path.join(appDir, "releases");
  const stamp = "20260720T000000Z";
  const { relative, absolute } = resolveDistDir(appDir, releasesDir, stamp);

  // The value handed to the build MUST be relative — an absolute value is the DE-1 defect.
  assert.equal(path.isAbsolute(relative), false, "dist dir passed to the build must be relative");
  assert.equal(relative, path.join("releases", stamp));

  // Next resolves distDir as path.join(projectRoot, distDir). With the RELATIVE value it lands EXACTLY at
  // the absolute release dir that VERIFY_BUILD later checks:
  assert.equal(path.join(appDir, relative), absolute, "relative distDir resolves to releaseAbs");
  assert.equal(absolute, path.join(appDir, "releases", stamp));
});

test("DE-1 negative: an ABSOLUTE NEXT_DIST_DIR would NEST (the exact defect)", () => {
  const appDir = "/opt/app";
  const absolute = path.join(appDir, "releases", "S");
  // How Next would resolve an absolute distDir: path.join(projectRoot, <absolute>) → duplicated root.
  const nested = path.join(appDir, absolute);
  assert.notEqual(nested, absolute, "absolute distDir does NOT land at the release dir");
  assert.match(nested, /\/opt\/app\/opt\/app\//, "absolute distDir nests the project root inside itself");
});

test("DE-1 config coupling: next.config.mjs sources distDir from NEXT_DIST_DIR", () => {
  const cfg = fs.readFileSync(path.join(REPO, "next.config.mjs"), "utf8");
  assert.match(cfg, /distDir:\s*process\.env\.NEXT_DIST_DIR/, "distDir must derive from NEXT_DIST_DIR (the DE-1 coupling)");
});

test("resolveDistDir rejects a releases dir outside appDir (Next cannot build outside the project root)", () => {
  assert.throws(() => resolveDistDir("/opt/app", "/var/other/releases", "s"), /inside appDir/);
});
