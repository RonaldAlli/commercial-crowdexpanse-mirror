import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveDeployContext, argValue } from "../../../scripts/deploy/resolve-context.mjs";

// DE-2 regression. The near-miss root cause: `--app-dir=<v>` wasn't parsed AND appDir fell back to the
// PRODUCTION default. These tests pin the fail-closed contract so it can never regress.

// Injected fs: `dirs` = set of existing dirs (realpath is identity here); `files` = set of existing files.
function deps(dirs, files) {
  return {
    realpath: (p) => { if (!dirs.has(p)) throw new Error("ENOENT"); return p; },
    exists: (p) => files.has(p),
    cwd: () => "/cwd/app",
  };
}
const D = (...d) => new Set(d);
const F = (...f) => new Set(f);

test("argValue parses BOTH --flag value and --flag=value (the DE-2 miss)", () => {
  assert.equal(argValue(["--app-dir", "/x"], "--app-dir"), "/x");
  assert.equal(argValue(["--app-dir=/x"], "--app-dir"), "/x");
  assert.equal(argValue(["--other", "--app-dir=/y", "--z"], "--app-dir"), "/y");
  assert.equal(argValue(["--app-dir", "--dry-run"], "--app-dir"), undefined, "value-less flag returns undefined");
  assert.equal(argValue(["--nope"], "--app-dir"), undefined);
});

test("FAIL-CLOSED: missing target aborts (NEVER defaults to production)", () => {
  assert.throws(() => resolveDeployContext(["--dry-run"], deps(D(), F())), /fails closed|no deploy target/i);
});

test("resolves --app-dir=<path> to an existing app checkout", () => {
  const ctx = resolveDeployContext(["--dry-run", "--app-dir=/opt/staging"],
    deps(D("/opt/staging"), F("/opt/staging/package.json")));
  assert.equal(ctx.appDir, "/opt/staging");
  assert.equal(ctx.dryRun, true);
  assert.equal(ctx.isMarkedProduction, false);
});

test("aborts if the target does not resolve exactly (no fuzzy substitution)", () => {
  assert.throws(() => resolveDeployContext(["--dry-run", "--app-dir", "/nope"], deps(D(), F())),
    /does not resolve/);
});

test("aborts if the target is not an app checkout (no package.json)", () => {
  assert.throws(() => resolveDeployContext(["--dry-run", "--app-dir", "/opt/x"], deps(D("/opt/x"), F())),
    /not an app checkout/);
});

test("production sentinel: refuses a marked target without --production", () => {
  assert.throws(() => resolveDeployContext(["--dry-run", "--app-dir", "/opt/prod"],
    deps(D("/opt/prod"), F("/opt/prod/package.json", "/opt/prod/.production-instance"))),
    /marked PRODUCTION/);
});

test("production sentinel: --production allows a marked target", () => {
  const ctx = resolveDeployContext(["--app-dir", "/opt/prod", "--production", "--yes"],
    deps(D("/opt/prod"), F("/opt/prod/package.json", "/opt/prod/.production-instance")));
  assert.equal(ctx.isProduction, true);
  assert.equal(ctx.isMarkedProduction, true);
});

test("production sentinel: --production against an UNMARKED target aborts (wrong target guard)", () => {
  assert.throws(() => resolveDeployContext(["--app-dir", "/opt/staging", "--production", "--yes"],
    deps(D("/opt/staging"), F("/opt/staging/package.json"))),
    /NOT marked production/);
});

test("mutating op requires --yes; dry-run does not", () => {
  const files = F("/opt/staging/package.json");
  assert.throws(() => resolveDeployContext(["--app-dir", "/opt/staging"], deps(D("/opt/staging"), files)),
    /requires explicit --yes/);
  const ok = resolveDeployContext(["--app-dir", "/opt/staging", "--yes"], deps(D("/opt/staging"), files));
  assert.equal(ok.assumeYes, true);
  const dry = resolveDeployContext(["--app-dir", "/opt/staging", "--dry-run"], deps(D("/opt/staging"), files));
  assert.equal(dry.dryRun, true);
});

test("--cwd uses the working directory as an explicit target", () => {
  const ctx = resolveDeployContext(["--dry-run", "--cwd"], deps(D("/cwd/app"), F("/cwd/app/package.json")));
  assert.equal(ctx.appDir, "/cwd/app");
});
