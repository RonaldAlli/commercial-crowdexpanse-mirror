// D25a · DE-2 — FAIL-CLOSED deploy-target resolution. A deployment tool must NEVER guess its target, and
// must never silently substitute production. This pure resolver (fs injected for tests) is the single
// gate deploy.mjs runs before the state machine starts.
//
// Contract:
//  - `--app-dir <path>` OR `--app-dir=<path>` OR `--cwd` is REQUIRED. No default. Missing ⇒ abort.
//  - The path must resolve EXACTLY to an existing app checkout (realpath + package.json) ⇒ else abort.
//  - Production sentinel: a target containing `.production-instance` is refused unless `--production`;
//    and `--production` against a target WITHOUT the sentinel is refused (wrong target).
//  - Any non-dry-run (mutating) operation requires explicit `--yes`.
import fs from "node:fs";
import path from "node:path";

/** Read a `--flag value` OR `--flag=value` argument. Returns undefined if absent or value-less. */
export function argValue(argv, flag) {
  const eq = argv.find((a) => a.startsWith(flag + "="));
  if (eq) return eq.slice(flag.length + 1);
  const i = argv.indexOf(flag);
  if (i < 0) return undefined;
  const v = argv[i + 1];
  return v == null || v.startsWith("--") ? undefined : v; // guard: `--app-dir --dry-run` has no value
}

export function resolveDeployContext(argv, deps = {}) {
  const exists = deps.exists ?? ((p) => fs.existsSync(p));
  const realpath = deps.realpath ?? ((p) => fs.realpathSync(p));
  const cwd = deps.cwd ?? (() => process.cwd());

  const has = (f) => argv.includes(f);
  const dryRun = has("--dry-run");
  const force = has("--force");
  const isProduction = has("--production");
  const assumeYes = has("--yes");

  // 1) FAIL-CLOSED target — never default to production.
  const explicit = argValue(argv, "--app-dir");
  const useCwd = has("--cwd");
  let raw;
  if (explicit != null && explicit !== "") raw = explicit;
  else if (useCwd) raw = cwd();
  else throw new Error("no deploy target: pass --app-dir <path> (or --cwd). Refusing to default — deploy tooling fails closed.");

  // 2) Resolve EXACTLY or abort (no fuzzy/partial substitution).
  let appDir;
  try { appDir = realpath(raw); }
  catch { throw new Error(`--app-dir does not resolve to an existing directory: ${raw}`); }
  if (!exists(path.join(appDir, "package.json"))) throw new Error(`target is not an app checkout (no package.json): ${appDir}`);

  // 3) Production sentinel — defense in depth (wrong path ⇒ immediate abort, not build-then-fail).
  const isMarkedProduction = exists(path.join(appDir, ".production-instance"));
  if (isMarkedProduction && !isProduction) {
    throw new Error(`target is marked PRODUCTION (.production-instance present) — refusing without explicit --production: ${appDir}`);
  }
  if (isProduction && !isMarkedProduction) {
    throw new Error(`--production was given but target is NOT marked production (.production-instance missing) — wrong target?: ${appDir}`);
  }

  // 4) Mutating ops require explicit confirmation.
  if (!dryRun && !assumeYes) {
    throw new Error("non-dry-run (mutating) operation requires explicit --yes confirmation");
  }

  return { appDir, dryRun, force, isProduction, assumeYes, isMarkedProduction };
}
