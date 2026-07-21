#!/usr/bin/env node
// D25 Deployment Engine — CLI entry point. Wires the real host operations into the state-machine engine.
//
//   deploy.mjs --dry-run --app-dir <path>            validate build + targets + invariants, no live change
//   deploy.mjs --app-dir <path> --yes                full atomic deploy (mutating ⇒ requires --yes)
//   deploy.mjs --app-dir <prod> --production --yes    deploy to a sentinel-marked production target
//
// DE-2 (fail-closed): the target is NEVER defaulted. `--app-dir <path>` (or `--app-dir=<path>`, or --cwd)
// is REQUIRED; it must resolve exactly to an app checkout; a `.production-instance`-marked target is
// refused without `--production`; and any non-dry-run needs `--yes`. The resolved context is printed
// BEFORE the state machine starts. See resolve-context.mjs.
import fs from "node:fs";
import path from "node:path";
import { runDeploy, STATES } from "./deploy-engine.mjs";
import { makeRealOps, recoverHost } from "./ops-real.mjs";
import { resolveDeployContext, argValue } from "./resolve-context.mjs";

const argv = process.argv.slice(2);
const jsonOut = argv.includes("--json");

// FAIL-CLOSED resolution first — aborts before anything else if the target is missing/ambiguous/production.
let cliCtx;
try {
  cliCtx = resolveDeployContext(argv);
} catch (e) {
  console.error(`\n✋ refusing to run — ${e.message}\n`);
  process.exit(2);
}
const { appDir, dryRun, force, isProduction, isMarkedProduction } = cliCtx;

// A sortable release stamp. `date -u +%Y%m%dT%H%M%SZ` is preferable on the host; accept --stamp override.
function releaseStamp() {
  const explicit = argValue(argv, "--stamp");
  if (explicit) return explicit;
  const [s, ns] = process.hrtime();
  return `r${s}${String(ns).padStart(9, "0")}-${process.pid}`;
}

const config = {
  appDir,
  pm2App: argValue(argv, "--pm2-app") || "crowdexpanse-commercial",
  port: Number(argValue(argv, "--port") || 3030),
  healthPath: "/api/health",
  buildScript: "build",
  distDirEnv: "NEXT_DIST_DIR",
  keepReleases: Number(argValue(argv, "--keep") || 5),
  releaseId: argValue(argv, "--release-id"), // explicit identity override; else derived from git HEAD
  stamp: releaseStamp(),
};

/** Best-effort DB name (redacted creds) from the target's env, for the context banner. */
function targetDbName(dir) {
  for (const f of [".env", ".env.local", ".env.test"]) {
    try {
      const m = fs.readFileSync(path.join(dir, f), "utf8").match(/DATABASE_URL="?postgres[^"\n]*\/([A-Za-z0-9_]+)/);
      if (m) return m[1];
    } catch { /* try next */ }
  }
  return "(per target .env)";
}

// D26: `deploy --recover` — explicit, auditable recovery of an INTERRUPTED deploy (never silent). Assesses
// the lock evidence, executes the recommended action (clean / rollback / finalize / manual), writes a
// recover-report. Same fail-closed target + sentinel + --yes gating as a deploy (recovery can roll back prod).
if (argv.includes("--recover")) {
  console.log(`\n── Deployment Engine · RECOVER ──\n  Application : ${appDir}${isMarkedProduction ? "   [PRODUCTION sentinel]" : ""}\n  PM2         : ${config.pm2App}\n`);
  const r = await recoverHost(config);
  if (jsonOut) console.log(JSON.stringify(r.report, null, 2));
  else {
    console.log(`── recovery ──\n  classification : ${r.classification}\n  recommendation : ${r.recommendation}\n  reason         : ${r.reason}\n  actions        : ${r.actions.length ? r.actions.join(", ") : "(none)"}\n  result         : ${r.ok ? "✅ ok" : "❌ " + r.error}`);
    if (r.recommendation === "MANUAL") console.log("  ⚠️  manual review required — no automatic action taken.");
    if (r.recommendation === "REFUSE_BUSY") console.log("  ⏳ a live deployment holds the lock — not recovering.");
  }
  process.exit(r.ok ? 0 : 1);
}

const ops = makeRealOps(config);
const ctx = { config };

// DE-2: print the FULLY RESOLVED execution context before the state machine starts — mistakes are easy to
// spot here, hard to spot mid-run.
const mode = dryRun ? "dry-run (no live change)" : `DEPLOY${isProduction ? " · PRODUCTION" : ""}${force ? " · --force" : ""}`;
console.log("\n── D25 Deployment Engine · resolved execution context ──");
console.log(`  Application : ${appDir}${isMarkedProduction ? "   [PRODUCTION sentinel]" : ""}`);
console.log(`  Mode        : ${mode}`);
console.log(`  Release     : ${config.stamp}`);
console.log(`  Database    : ${targetDbName(appDir)}`);
console.log(`  PM2         : ${config.pm2App}`);
console.log(`  Port        : ${config.port}`);
console.log(`  States      : ${STATES.join(" → ")}${dryRun ? "   (stops before SWAP)" : ""}\n`);

const result = await runDeploy(ctx, ops, { dryRun, force });

if (jsonOut) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log("\n── trace ──");
  for (const t of result.trace) console.log(`  ${t.state.padEnd(22)} ${t.status}${t.detail ? "  " + t.detail : ""}`);
  console.log("\n── result ──");
  if (result.ok && result.noop) console.log(`  ✅ NO-OP — release ${result.releaseId} already active; nothing changed (use --force to redeploy)`);
  else if (result.ok) console.log(dryRun ? "  ✅ DRY RUN OK — build + targets validated, live server unchanged" : `  ✅ DEPLOYED — serving ${result.buildId}`);
  else {
    console.log(`  ❌ FAILED at: ${result.error}`);
    console.log(result.rolledBack ? "  ↩︎  auto-rolled back to the previous release" : "  live release never changed (failure before swap)");
    if (result.rollbackFailed) console.log("  ⚠️  ROLLBACK ITSELF FAILED — MANUAL OPERATOR ACTION REQUIRED");
  }
}
process.exit(result.ok ? 0 : (result.rollbackFailed ? 2 : 1));
