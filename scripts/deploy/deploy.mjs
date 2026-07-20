#!/usr/bin/env node
// D25 Deployment Engine — CLI entry point. Wires the real host operations into the state-machine engine.
//
//   node scripts/deploy/deploy.mjs --dry-run     validate build + swap/rollback targets + disk +
//                                                retention, WITHOUT changing the live server
//   node scripts/deploy/deploy.mjs               full atomic deploy (build → swap → restart → smoke),
//                                                auto-rollback on any post-swap failure
//
// Safe by construction: this does nothing until run ON the host, AND the host must first be migrated to
// the symlink+releases/ model (separate, reversible, operator-authorized runbook). Until then `.next` is
// a real directory and PRECHECK's previous-release read simply reports "(none)". No production execution
// is performed as part of the D25 implementation phase — first host use is `--dry-run` under review.
import path from "node:path";
import { runDeploy, STATES } from "./deploy-engine.mjs";
import { makeRealOps } from "./ops-real.mjs";

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const force = argv.includes("--force"); // bypass the "release already active" idempotency no-op
const jsonOut = argv.includes("--json");

// A sortable, collision-free release stamp WITHOUT Date.now()/Math.random() (both unavailable/discouraged
// in this codebase's scripting sandbox for determinism): derive from the process high-res clock + pid.
// On the real host `date -u +%Y%m%dT%H%M%SZ` is preferable; accept an explicit --stamp override for that.
function releaseStamp() {
  const explicit = argFor("--stamp");
  if (explicit) return explicit;
  const [s, ns] = process.hrtime();
  return `r${s}${String(ns).padStart(9, "0")}-${process.pid}`;
}
function argFor(flag) { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : undefined; }

const config = {
  appDir: argFor("--app-dir") || "/opt/crowdexpanse/commercial",
  pm2App: argFor("--pm2-app") || "crowdexpanse-commercial",
  port: Number(argFor("--port") || 3030),
  healthPath: "/api/health",
  buildScript: "build",
  distDirEnv: "NEXT_DIST_DIR",
  keepReleases: Number(argFor("--keep") || 5),
  releaseId: argFor("--release-id"), // explicit identity override; else derived from git HEAD
  stamp: releaseStamp(),
};

const ops = makeRealOps(config);
const ctx = { config };

console.log(`\nD25 Deployment Engine — ${dryRun ? "DRY RUN (no live change)" : force ? "DEPLOY (--force)" : "DEPLOY"}`);
console.log(`  app=${config.appDir}  pm2=${config.pm2App}  release=${config.stamp}`);
console.log(`  states: ${STATES.join(" → ")}${dryRun ? "  (stops before SWAP)" : ""}\n`);

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
