import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { makeDeployTsconfig, withDeployTsconfig } from "../../../scripts/deploy/ops-real.mjs";
import { STATES } from "../../../scripts/deploy/deploy-engine.mjs";

// DE-4 regression: the deployment build must consume ONLY its own generated types (releases/<stamp>/types),
// never the active release's types via the depth-1 `.next/types` symlink glob. These lock the mechanism.

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

test("deploy tsconfig OMITS the depth-mismatched .next/types + .next-isolated/types globs", () => {
  const cfg = makeDeployTsconfig();
  assert.equal(cfg.extends, "./tsconfig.json", "inherits compilerOptions/plugins from the committed base");
  for (const glob of cfg.include) {
    assert.doesNotMatch(glob, /^\.next(-isolated)?\/types/, `deploy include must not contain ${glob}`);
  }
  assert.ok(!cfg.include.some((g) => g.startsWith(".next")), "no .next* type globs at all");
});

test("deploy tsconfig still type-checks source (so the build's own types ARE validated)", () => {
  const cfg = makeDeployTsconfig();
  // Source globs present → the release's own types (which Next appends here at build time) get checked.
  assert.ok(cfg.include.includes("**/*.ts") && cfg.include.includes("**/*.tsx"), "source is still type-checked");
  assert.ok(cfg.include.includes("next-env.d.ts"));
});

test("the COMMITTED tsconfig deliberately KEEPS .next/types + .next-isolated/types (dev + build:isolated need them)", () => {
  const base = JSON.parse(fs.readFileSync(path.join(REPO, "tsconfig.json"), "utf8"));
  assert.ok(base.include.includes(".next/types/**/*.ts"), "dev build (.next) keeps its route-type glob");
  assert.ok(base.include.includes(".next-isolated/types/**/*.ts"), "build:isolated keeps its route-type glob");
});

test("next.config wires typescript.tsconfigPath from NEXT_TSCONFIG_PATH (officially-supported mechanism)", () => {
  const cfg = fs.readFileSync(path.join(REPO, "next.config.mjs"), "utf8");
  assert.match(cfg, /tsconfigPath:\s*process\.env\.NEXT_TSCONFIG_PATH\s*\|\|\s*["']tsconfig\.json["']/,
    "next.config must derive tsconfigPath from NEXT_TSCONFIG_PATH, defaulting to the committed tsconfig");
});

test("tsconfig.deploy.json is gitignored (generated artifact, never committed)", () => {
  const gi = fs.readFileSync(path.join(REPO, ".gitignore"), "utf8");
  assert.match(gi, /^\/?tsconfig\.deploy\.json$/m, "generated deploy tsconfig must be gitignored");
});

// --- lifecycle hardening: guaranteed cleanup + concurrency ---------------------------------------

test("withDeployTsconfig: creates the file for the build, then REMOVES it on SUCCESS", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "d25tsc-"));
  let sawFileDuringBuild = false, sawRelPath = null;
  const out = await withDeployTsconfig(dir, (rel) => {
    sawRelPath = rel;
    sawFileDuringBuild = fs.existsSync(path.join(dir, "tsconfig.deploy.json"));
    return "built";
  });
  assert.equal(out, "built");
  assert.equal(sawRelPath, "tsconfig.deploy.json", "buildFn receives the relative deploy tsconfig path");
  assert.equal(sawFileDuringBuild, true, "the generated file exists DURING the build");
  assert.equal(fs.existsSync(path.join(dir, "tsconfig.deploy.json")), false, "removed after success");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("withDeployTsconfig: REMOVES the file even when the build THROWS (finally)", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "d25tsc-"));
  await assert.rejects(
    withDeployTsconfig(dir, () => { throw new Error("build failed"); }),
    /build failed/,
  );
  assert.equal(fs.existsSync(path.join(dir, "tsconfig.deploy.json")), false, "removed after failure too");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("concurrency: deploys are SERIALIZED by the atomic lock dir → the generated file can't collide", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "d25lock-"));
  const lock = path.join(dir, ".deploy.lock");
  fs.mkdirSync(lock);                                        // first deploy acquires the lock (PRECHECK)
  assert.throws(() => fs.mkdirSync(lock), /EEXIST/, "a second concurrent deploy is refused by the lock");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("ordering: the lock (PRECHECK) is acquired BEFORE the deploy tsconfig is written (BUILD)", () => {
  assert.ok(STATES.indexOf("PRECHECK") >= 0 && STATES.indexOf("BUILD") > STATES.indexOf("PRECHECK"),
    "PRECHECK (which holds the lock) always precedes BUILD (which writes tsconfig.deploy.json)");
});
