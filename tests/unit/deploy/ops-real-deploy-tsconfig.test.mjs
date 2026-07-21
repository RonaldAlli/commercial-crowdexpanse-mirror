import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { makeDeployTsconfig } from "../../../scripts/deploy/ops-real.mjs";

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
