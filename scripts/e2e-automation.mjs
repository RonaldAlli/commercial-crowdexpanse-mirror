// Integration + isolation E2E for the Automation domain (Version 2.0, Phase 2.0.1).
// Runs against the *_test DB with throwaway orgs (auto-discovered by e2e-all.mjs).
// Proves the ratified invariants for the job repository + immutable execution ledger,
// executor/reaper recovery, the read-only proof job (no domain effect), and org isolation.
// Sections grow across Commits 3–7; this file is the phase's behavioral proof.
import { assertTestDatabase } from "./e2e-guard.mjs";

import { UserRole } from "@prisma/client";

import { prisma } from "../lib/prisma.ts";
import { createPropertyRecord } from "../lib/properties.ts";
import {
  enqueueJob,
  markQueued,
  claimDueJobs,
  promoteDueRetries,
  finalizeJob,
  requeueDeadLetteredJob,
  getJob,
  listJobExecutions,
  sourceExistsInOrg,
} from "../lib/automation/job-service.ts";
import { nextStatusAfterFailure, nextAttemptAt } from "../lib/automation/lifecycle.ts";

const TAG = "e2e-automation";
assertTestDatabase();
let ok = 0;
const fail = [];
function assert(cond, msg) { if (cond) { ok++; console.log(`  ✓ ${msg}`); } else { fail.push(msg); console.log(`  ✗ ${msg}`); } }
async function throws(fn, msg) { try { await fn(); assert(false, msg); } catch { assert(true, msg); } }

const op = (name = "Asset") => ({
  name, assetType: "MULTIFAMILY", status: null, addressLine1: "1 Main St", city: "Atlanta", state: "GA",
  postalCode: null, county: null, sellerId: null, unitCount: null, acreage: null, occupancyRate: null,
  noiAnnualUsd: null, askingPriceUsd: null, estimatedValueUsd: null, capRate: null,
});
const mkOpp = async (orgId, title = "Deal") => {
  const prop = await createPropertyRecord(orgId, op(title), {});
  return prisma.opportunity.create({ data: { organizationId: orgId, propertyId: prop.id, title } });
};

const PKEY = "closing_readiness_observation";
const mkInput = (orgId, sourceId, over = {}) => ({
  organizationId: orgId,
  automationType: PKEY,
  sourceType: "opportunity",
  sourceId,
  policyKey: PKEY,
  policyVersion: 1,
  occurrenceKey: "2026-07-16T14",
  ...over,
});

const PRINCIPAL = "automation:closing_readiness_observation";
const finalizeSuccess = (job) =>
  finalizeJob({
    job, attemptNumber: job.runningAttempt, outcome: "SUCCEEDED",
    policyKey: job.policyKey, policyVersion: job.policyVersion, policyDecision: "ALLOW",
    contextFingerprint: "fp", startedAt: new Date(), finishedAt: new Date(), principalKey: PRINCIPAL,
    producedDomainEffect: false, nextStatus: "SUCCEEDED",
  });
const finalizeFail = (job, failureClass) => {
  const ns = nextStatusAfterFailure(failureClass, job.attempts, job.maxAttempts);
  return finalizeJob({
    job, attemptNumber: job.runningAttempt, outcome: "FAILED",
    policyKey: job.policyKey, policyVersion: job.policyVersion, policyDecision: "ALLOW",
    contextFingerprint: "fp", startedAt: new Date(), finishedAt: new Date(), principalKey: PRINCIPAL,
    failureClass, retryAllowed: ns === "RETRY_SCHEDULED",
    nextStatus: ns, nextAttemptAt: ns === "RETRY_SCHEDULED" ? nextAttemptAt(new Date(), job.attempts) : null,
  });
};

const orgIds = [];
try {
  const a = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-a` } });
  orgIds.push(a.id);
  const b = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-b` } });
  orgIds.push(b.id);
  const oppA = await mkOpp(a.id, "Deal A");
  const oppB = await mkOpp(b.id, "Deal B");

  console.log("\n[1] Enqueue is idempotent (sequential): same identity → one job:");
  const j1 = await enqueueJob(mkInput(a.id, oppA.id));
  const j1b = await enqueueJob(mkInput(a.id, oppA.id));
  assert(j1.id === j1b.id, "second enqueue of the same occurrence returns the first job");

  console.log("\n[2] Enqueue is idempotent under concurrency (P2002 race resolved):");
  const oppA2 = await mkOpp(a.id, "Deal A2");
  const [c1, c2, c3] = await Promise.all([
    enqueueJob(mkInput(a.id, oppA2.id)),
    enqueueJob(mkInput(a.id, oppA2.id)),
    enqueueJob(mkInput(a.id, oppA2.id)),
  ]);
  assert(c1.id === c2.id && c2.id === c3.id, "concurrent enqueues converge to one job");

  console.log("\n[3] Cross-org same identity → separate jobs:");
  const jb = await enqueueJob(mkInput(b.id, oppB.id));
  assert(jb.id !== j1.id, "org B's job is distinct from org A's job");

  console.log("\n[4] Claim: QUEUED → RUNNING with lease + attempt 1:");
  await markQueued(j1.id, new Date());
  const claimed = await claimDueJobs(new Date(), 10);
  const rj = claimed.find((j) => j.id === j1.id);
  assert(rj && rj.status === "RUNNING", "claimed job is RUNNING");
  assert(rj.attempts === 1 && rj.runningAttempt === 1, "attempt counter is 1");
  assert(rj.leaseExpiresAt !== null, "a lease is set on claim");

  console.log("\n[5] A RUNNING job is not re-claimed (no two active attempts):");
  const again = await claimDueJobs(new Date(), 10);
  assert(!again.some((j) => j.id === j1.id), "a RUNNING job is not claimed again");

  console.log("\n[6] Two concurrent claims never double-claim one job (SKIP LOCKED):");
  const oppA3 = await mkOpp(a.id, "Deal A3");
  const j3 = await enqueueJob(mkInput(a.id, oppA3.id, { occurrenceKey: "2026-07-16T15" }));
  await markQueued(j3.id, new Date());
  const [p1, p2] = await Promise.all([claimDueJobs(new Date(), 10), claimDueJobs(new Date(), 10)]);
  const claims = [...p1, ...p2].filter((j) => j.id === j3.id);
  assert(claims.length === 1, "exactly one concurrent claim wins the job");

  console.log("\n[7] Retryable failure → RETRY_SCHEDULED; retry creates a NEW immutable attempt:");
  const { job: failed1 } = await finalizeFail(rj, "TRANSIENT_INFRASTRUCTURE");
  assert(failed1.status === "RETRY_SCHEDULED", "a retryable failure schedules a retry");
  const execs1 = await listJobExecutions(a.id, j1.id);
  assert(execs1.length === 1 && execs1[0].attemptNumber === 1 && execs1[0].outcome === "FAILED", "attempt 1 recorded as FAILED");
  const attempt1Snapshot = JSON.stringify(execs1[0]);
  const t1 = new Date(Date.now() + 3600_000);
  await promoteDueRetries(t1);
  const reclaimed = (await claimDueJobs(t1, 10)).find((j) => j.id === j1.id);
  assert(reclaimed && reclaimed.attempts === 2 && reclaimed.runningAttempt === 2, "retry claim is attempt 2");
  const { execution: exec2 } = await finalizeSuccess(reclaimed);
  assert(exec2.attemptNumber === 2 && exec2.outcome === "SUCCEEDED", "attempt 2 recorded as SUCCEEDED (new row)");
  const execs2 = await listJobExecutions(a.id, j1.id);
  assert(execs2.length === 2, "retries create new rows (2 attempts), never overwrite");
  const attempt1After = JSON.stringify(execs2.find((e) => e.attemptNumber === 1));
  assert(attempt1After === attempt1Snapshot, "the prior attempt row is byte-for-byte unchanged (immutable ledger)");

  console.log("\n[8] Execution-attempt uniqueness is enforced (no double-recorded attempt):");
  await throws(
    () => prisma.automationExecution.create({
      data: {
        organizationId: a.id, automationJobId: j1.id, attemptNumber: 1, automationType: PKEY,
        triggerType: "SCHEDULE", policyKey: PKEY, policyVersion: 1, policyDecision: "ALLOW",
        contextFingerprint: "x", startedAt: new Date(), finishedAt: new Date(), durationMs: 0,
        outcome: "SUCCEEDED", principalKey: PRINCIPAL,
      },
    }),
    "a duplicate (jobId, attemptNumber) execution is rejected by the unique constraint",
  );

  console.log("\n[9] Permanent failure → DEAD_LETTERED:");
  const oppA4 = await mkOpp(a.id, "Deal A4");
  const j4 = await enqueueJob(mkInput(a.id, oppA4.id, { occurrenceKey: "2026-07-16T16" }));
  await markQueued(j4.id, new Date());
  const rj4 = (await claimDueJobs(new Date(), 10)).find((j) => j.id === j4.id);
  const { job: dl } = await finalizeFail(rj4, "PERMISSION_FAILURE");
  assert(dl.status === "DEAD_LETTERED", "a permanent failure dead-letters the job");

  console.log("\n[10] Operator requeue: DEAD_LETTERED → QUEUED, new attempt, prior rows untouched:");
  const execsBefore = JSON.stringify(await listJobExecutions(a.id, j4.id));
  const requeued = await requeueDeadLetteredJob(a.id, j4.id, new Date());
  assert(requeued.status === "QUEUED", "requeue returns the job to QUEUED");
  const execsAfter = JSON.stringify(await listJobExecutions(a.id, j4.id));
  assert(execsAfter === execsBefore, "requeue mutates NO prior execution row");
  const rj4b = (await claimDueJobs(new Date(), 10)).find((j) => j.id === j4.id);
  assert(rj4b && rj4b.attempts === 2, "requeued job's next claim is a new attempt");

  console.log("\n[11] Org isolation + source validation fail closed:");
  assert((await getJob(b.id, j1.id)) === null, "org B cannot read org A's job");
  await throws(() => requeueDeadLetteredJob(b.id, j4.id, new Date()), "org B cannot requeue org A's job");
  assert((await sourceExistsInOrg(a.id, "opportunity", oppA.id)) === true, "a same-org opportunity source validates");
  assert((await sourceExistsInOrg(a.id, "opportunity", oppB.id)) === false, "a cross-org source fails closed");
  assert((await sourceExistsInOrg(a.id, "unknown", oppA.id)) === false, "an unknown source type fails closed");
} finally {
  console.log("\nCleaning up throwaway orgs (cascade)...");
  for (const id of orgIds) await prisma.organization.delete({ where: { id } }).catch((e) => console.log(`  cleanup warn: ${e.message}`));
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
