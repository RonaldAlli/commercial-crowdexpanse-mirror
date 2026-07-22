// D19 — Automation RUNTIME acceptance (the process, not just the lib).
//
// e2e-automation.mjs proves the automation *spine* by calling lib functions directly. This
// harness proves the DEFECT D19 actually fixed: that the PM2 entrypoint
// `node --import tsx scripts/automation-runtime.mjs` boots under a production-style command,
// its in-process executor loop drains a real queue, terminal work is not reprocessed across a
// restart, and bad input never terminates the process. Scheduler stays OFF throughout — this
// harness seeds the queue by hand; it never enables the production scheduler.
//
// Run:  node --env-file=.env.test --import tsx scripts/d19-runtime-acceptance.mjs
// Safety: refuses to run unless DATABASE_URL is the *_test DB; uses a throwaway org (pid-slug),
// cascade-cleaned in finally. Prod DB / prod PM2 are never touched.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { assertTestDatabase } from "./e2e-guard.mjs";
import { prisma } from "../lib/prisma.ts";
import { createPropertyRecord } from "../lib/properties.ts";
import { enqueueJob, markQueued, getJob, listJobExecutions } from "../lib/automation/job-service.ts";
import { CLOSING_READINESS_AUTOMATION_TYPE } from "../lib/automation/proof-observer.ts";

const TAG = "d19-runtime";
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
assertTestDatabase();

let ok = 0;
const fail = [];
const assert = (cond, msg) => { if (cond) { ok++; console.log(`  ✓ ${msg}`); } else { fail.push(msg); console.log(`  ✗ ${msg}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const op = (name) => ({
  name, assetType: "MULTIFAMILY", status: null, addressLine1: "1 Main St", city: "Atlanta", state: "GA",
  postalCode: null, county: null, sellerId: null, unitCount: null, acreage: null, occupancyRate: null,
  noiAnnualUsd: null, askingPriceUsd: null, estimatedValueUsd: null, capRate: null,
});
const mkOpp = async (orgId, title, stage) => {
  const prop = await createPropertyRecord(orgId, op(title), {});
  return prisma.opportunity.create({ data: { organizationId: orgId, propertyId: prop.id, title, ...(stage ? { stage } : {}) } });
};
const mkInput = (orgId, sourceId, over = {}) => ({
  organizationId: orgId, automationType: CLOSING_READINESS_AUTOMATION_TYPE, sourceType: "opportunity",
  sourceId, policyKey: CLOSING_READINESS_AUTOMATION_TYPE, policyVersion: 1, occurrenceKey: "d19-run", ...over,
});
const enqueueQueued = async (input) => { const j = await enqueueJob(input); await markQueued(j.id, new Date()); return j; };
const statusOf = async (orgId, id) => (await getJob(orgId, id))?.status;

// Spawn the REAL runtime entrypoint exactly as PM2 would (node_args "--import tsx"), scheduler OFF,
// short executor idle so the queue drains quickly. Returns a handle with the captured output + a
// graceful SIGTERM stop that asserts a clean exit.
function startRuntime(label) {
  let out = "";
  const child = spawn(process.execPath, ["--import", "tsx", "scripts/automation-runtime.mjs"], {
    cwd: REPO_ROOT,
    // Short executor idle + reaper interval so the queue drains and the graceful-stop loops wake
    // quickly. (The reaper's sleep is not interruptible; the default 30s interval is fine in prod but
    // would make this harness wait — see the shutdown-latency note in the D19 doc.)
    env: {
      ...process.env, NODE_ENV: "production", AUTOMATION_SCHEDULER_ENABLED: "0",
      AUTOMATION_EXECUTOR_IDLE_MS: "400", AUTOMATION_REAPER_INTERVAL_MS: "400",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (d) => { out += d.toString(); });
  child.stderr.on("data", (d) => { out += d.toString(); });
  let exited = null;
  child.on("exit", (code, signal) => { exited = { code, signal }; });
  return {
    label,
    get output() { return out; },
    get exited() { return exited; },
    async waitForStartup(timeoutMs = 8000) {
      const t0 = Date.now();
      while (Date.now() - t0 < timeoutMs) { if (out.includes("runtime starting")) return true; if (exited) return false; await sleep(50); }
      return false;
    },
    async stopGraceful(timeoutMs = 8000) {
      child.kill("SIGTERM");
      const t0 = Date.now();
      while (Date.now() - t0 < timeoutMs && !exited) await sleep(50);
      return exited;
    },
  };
}

const waitFor = async (fn, timeoutMs = 12000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) { if (await fn()) return true; await sleep(200); }
  return false;
};

const orgIds = [];
let rt = null;
try {
  const org = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}` } });
  orgIds.push(org.id);
  const inFlight = await mkOpp(org.id, "D19 In-Flight", "UNDER_CONTRACT"); // in closing scope → policy ALLOW

  // Three synthetic, clearly-tagged QUEUED jobs: a success, a missing-source (malformed input),
  // and an unknown automation type (no handler).
  const jSuccess = await enqueueQueued(mkInput(org.id, inFlight.id, { occurrenceKey: "d19-success" }));
  const jMissing = await enqueueQueued(mkInput(org.id, "does-not-exist", { occurrenceKey: "d19-missing" }));
  const jUnknown = await enqueueQueued(mkInput(org.id, inFlight.id, { automationType: "d19_unknown_type", occurrenceKey: "d19-unknown" }));

  console.log("\n[1] The runtime starts under the production command `node --import tsx …`:");
  rt = startRuntime("run-1");
  const started = await rt.waitForStartup();
  assert(started, "process boots — no ERR_UNKNOWN_FILE_EXTENSION (the D19 crash)");
  assert(/scheduler=off/.test(rt.output), "banner confirms scheduler=OFF (kill-switch honored)");
  assert(rt.exited === null, "process stays online after startup (does not exit)");

  console.log("\n[2] The in-process executor loop drains the queue end-to-end:");
  const drained = await waitFor(async () =>
    (await statusOf(org.id, jSuccess.id)) === "SUCCEEDED" &&
    (await statusOf(org.id, jMissing.id)) === "SUCCEEDED" &&
    (await statusOf(org.id, jUnknown.id)) === "DEAD_LETTERED");
  assert(drained, "all three synthetic jobs reached a terminal state");

  console.log("\n[3] Success is persisted correctly (SUCCEEDED, read-only, ALLOW):");
  const exSuccess = (await listJobExecutions(org.id, jSuccess.id))[0];
  assert(exSuccess?.outcome === "SUCCEEDED", "success job recorded an execution with outcome SUCCEEDED");
  assert(exSuccess?.policyDecision === "ALLOW", "policy decision persisted as ALLOW");
  assert(exSuccess?.producedDomainEffect === false, "producedDomainEffect=false (read-only proof automation)");
  assert(exSuccess?.principalKey === "automation:closing_readiness_observation", "attributed to the AUTOMATION principal");

  console.log("\n[4] A failed job (unknown type) is dead-lettered WITHOUT crashing the worker:");
  assert((await statusOf(org.id, jUnknown.id)) === "DEAD_LETTERED", "unknown automationType → DEAD_LETTERED");
  assert(rt.exited === null, "the process is still alive after handling the failed job");

  console.log("\n[5] Missing/malformed input is a clean NOOP, not a termination:");
  const exMissing = (await listJobExecutions(org.id, jMissing.id))[0];
  assert(exMissing?.outcome === "NOOP", "missing-source job finalized as a NOOP (policy NO_ACTION)");
  assert(rt.exited === null, "the process did not terminate on malformed input");

  console.log("\n[6] Graceful shutdown on SIGTERM (drain, then clean exit):");
  const exit1 = await rt.stopGraceful();
  assert(exit1 && exit1.code === 0, "SIGTERM → exit code 0");
  assert(/stopped cleanly/.test(rt.output), "logged a clean drain-and-stop");

  console.log("\n[7] Restart does NOT reprocess terminal work (idempotent across restarts):");
  const execCountsBefore = {
    success: (await listJobExecutions(org.id, jSuccess.id)).length,
    missing: (await listJobExecutions(org.id, jMissing.id)).length,
    unknown: (await listJobExecutions(org.id, jUnknown.id)).length,
  };
  // A NEW job proves the restarted process resumes real work (not merely idle).
  const jAfter = await enqueueQueued(mkInput(org.id, inFlight.id, { occurrenceKey: "d19-after-restart" }));
  rt = startRuntime("run-2");
  assert(await rt.waitForStartup(), "the runtime restarts cleanly under the same command");
  const resumed = await waitFor(async () => (await statusOf(org.id, jAfter.id)) === "SUCCEEDED");
  assert(resumed, "the restarted process claims and completes a freshly-queued job");
  const execCountsAfter = {
    success: (await listJobExecutions(org.id, jSuccess.id)).length,
    missing: (await listJobExecutions(org.id, jMissing.id)).length,
    unknown: (await listJobExecutions(org.id, jUnknown.id)).length,
  };
  assert(JSON.stringify(execCountsBefore) === JSON.stringify(execCountsAfter),
    "no NEW execution rows for the already-terminal jobs (terminal work is never re-run)");
  const exit2 = await rt.stopGraceful();
  assert(exit2 && exit2.code === 0, "second run also shuts down cleanly");
  rt = null;

  console.log("\n[8] Same-identity re-enqueue converges to one job (idempotency key holds):");
  const reSuccess = await enqueueJob(mkInput(org.id, inFlight.id, { occurrenceKey: "d19-success" }));
  assert(reSuccess.id === jSuccess.id, "re-enqueuing the same occurrence returns the original job (no duplicate)");
} finally {
  if (rt && !rt.exited) await rt.stopGraceful();
  console.log("\nCleaning up throwaway org (cascade)…");
  for (const id of orgIds) await prisma.organization.delete({ where: { id } }).catch((e) => console.log(`  cleanup warn: ${e.message}`));
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
