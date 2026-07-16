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
import { runExecutorOnce, startExecutorLoop } from "../lib/automation/executor.ts";
import { reapStaleJobs } from "../lib/automation/reaper.ts";
import { runSchedulerOnce, supersedeOlderOccurrences } from "../lib/automation/scheduler.ts";

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

  // ── Commit 4: executor / reaper / scheduler ──────────────────────────────────
  const handler = (policy, perform) => ({
    fake_type: {
      automationType: "fake_type", policyKey: "fake", policyVersion: 1,
      gatherContext: async () => ({ context: {}, fingerprint: "fp" }),
      policy, perform,
    },
  });

  console.log("\n[12] Importing the executor/reaper/scheduler starts NO loop (no side effects):");
  const jSide = await enqueueJob(mkInput(a.id, "src-side", { automationType: "sidecheck_type", occurrenceKey: "f-side" }));
  await markQueued(jSide.id, new Date());
  await new Promise((r) => setTimeout(r, 30));
  assert((await getJob(a.id, jSide.id)).status === "QUEUED", "a queued job is untouched until an executor is explicitly run");

  console.log("\n[13] Executor runs an ALLOW handler → SUCCEEDED, producedDomainEffect=false:");
  let performed = 0;
  const jf1 = await enqueueJob(mkInput(a.id, "src-13", { automationType: "fake_type", occurrenceKey: "f-13" }));
  await markQueued(jf1.id, new Date());
  await runExecutorOnce(handler(() => ({ kind: "ALLOW" }), async () => { performed++; return { producedDomainEffect: false }; }), new Date());
  const jf1ex = (await listJobExecutions(a.id, jf1.id))[0];
  assert((await getJob(a.id, jf1.id)).status === "SUCCEEDED", "ALLOW job finalizes SUCCEEDED");
  assert(performed === 1, "perform() ran exactly once on ALLOW");
  assert(jf1ex.outcome === "SUCCEEDED" && jf1ex.producedDomainEffect === false && jf1ex.policyDecision === "ALLOW", "execution: SUCCEEDED, no domain effect, decision ALLOW");
  assert((await getJob(a.id, jSide.id)).status === "DEAD_LETTERED", "the unknown-type side job dead-lettered (no handler)");

  console.log("\n[14] Policy gate: DENY/NO_ACTION/STALE_CONTEXT → NOOP, perform() never called:");
  for (const [kind, occ] of [["DENY", "f-14a"], ["NO_ACTION", "f-14b"], ["STALE_CONTEXT", "f-14c"]]) {
    let gated = 0;
    const j = await enqueueJob(mkInput(a.id, "src-" + occ, { automationType: "fake_type", occurrenceKey: occ }));
    await markQueued(j.id, new Date());
    await runExecutorOnce(handler(() => ({ kind, reason: "r" }), async () => { gated++; return { producedDomainEffect: false }; }), new Date());
    const ex = (await listJobExecutions(a.id, j.id))[0];
    assert((await getJob(a.id, j.id)).status === "SUCCEEDED" && ex.outcome === "NOOP", `${kind} → job SUCCEEDED, execution NOOP`);
    assert(ex.policyDecision === kind, `${kind} decision recorded`);
    assert(gated === 0, `${kind}: perform() was NOT called (policy gate)`);
  }

  console.log("\n[15] Handler error → classified failure (retry vs dead-letter):");
  const errH = (msg) => handler(() => ({ kind: "ALLOW" }), async () => { throw new Error(msg); });
  const jt = await enqueueJob(mkInput(a.id, "src-15a", { automationType: "fake_type", occurrenceKey: "f-15a", maxAttempts: 3 }));
  await markQueued(jt.id, new Date());
  await runExecutorOnce(errH("transient boom"), new Date());
  const jtEx = (await listJobExecutions(a.id, jt.id))[0];
  assert((await getJob(a.id, jt.id)).status === "RETRY_SCHEDULED", "a transient (UNKNOWN) error schedules a retry");
  assert(jtEx.outcome === "FAILED" && jtEx.failureClass === "UNKNOWN" && jtEx.error.length > 0, "attempt FAILED, UNKNOWN, error recorded");
  const jp = await enqueueJob(mkInput(a.id, "src-15b", { automationType: "fake_type", occurrenceKey: "f-15b" }));
  await markQueued(jp.id, new Date());
  await runExecutorOnce(errH("invalid input"), new Date());
  assert((await getJob(a.id, jp.id)).status === "DEAD_LETTERED", "a validation error dead-letters");
  const jo = await enqueueJob(mkInput(a.id, "src-15c", { automationType: "fake_type", occurrenceKey: "f-15c" }));
  await markQueued(jo.id, new Date());
  await runExecutorOnce(errH("organization mismatch"), new Date());
  assert((await listJobExecutions(a.id, jo.id))[0].failureClass === "ORG_SCOPE_VIOLATION", "org-scope error classified ORG_SCOPE_VIOLATION");

  console.log("\n[16] Reaper recovers a stale RUNNING lease (crash recovery), idempotently:");
  const jr = await enqueueJob(mkInput(a.id, "src-16", { automationType: "fake_type", occurrenceKey: "f-16", maxAttempts: 3 }));
  await markQueued(jr.id, new Date());
  const claimedR = (await claimDueJobs(new Date(), 10)).find((j) => j.id === jr.id);
  assert(claimedR.status === "RUNNING", "job claimed RUNNING (simulated in-flight)");
  await prisma.automationJob.update({ where: { id: jr.id }, data: { leaseExpiresAt: new Date(Date.now() - 1000) } });
  assert((await reapStaleJobs(new Date())) >= 1, "reaper recovered the stale job");
  assert((await getJob(a.id, jr.id)).status === "RETRY_SCHEDULED", "stale RUNNING → RETRY_SCHEDULED (attempts remain)");
  const jrEx = (await listJobExecutions(a.id, jr.id)).find((e) => e.error && e.error.includes("lease expired"));
  assert(jrEx && jrEx.outcome === "FAILED" && jrEx.failureClass === "UNKNOWN", "an abandoned execution row was recorded");
  assert((await reapStaleJobs(new Date())) === 0, "a second reaper pass is a no-op (idempotent)");
  const jr2 = await enqueueJob(mkInput(a.id, "src-16b", { automationType: "fake_type", occurrenceKey: "f-16b" }));
  await markQueued(jr2.id, new Date());
  await claimDueJobs(new Date(), 10);
  await reapStaleJobs(new Date());
  assert((await getJob(a.id, jr2.id)).status === "RUNNING", "a job with a valid (fresh) lease is not reaped");

  console.log("\n[17] Scheduler enumerates orgs, seeds per org, and supersedes stale occurrences:");
  const seededOrgs = new Set();
  const sched = await runSchedulerOnce({ fake_type: async (orgId) => { seededOrgs.add(orgId); return 1; } }, new Date());
  assert(sched.orgs >= 2 && seededOrgs.has(a.id) && seededOrgs.has(b.id), "scheduler ran the seeder once per org (single-org scoping)");
  const s1 = await enqueueJob(mkInput(a.id, "src-17", { automationType: "fake_type", occurrenceKey: "occ-old" }));
  const s2 = await enqueueJob(mkInput(a.id, "src-17", { automationType: "fake_type", occurrenceKey: "occ-new" }));
  assert((await supersedeOlderOccurrences(a.id, "fake_type", "opportunity", "src-17", "occ-new")) === 1, "an older non-terminal occurrence is superseded");
  assert((await getJob(a.id, s1.id)).status === "SUPERSEDED", "the old occurrence is SUPERSEDED");
  assert((await getJob(a.id, s2.id)).status !== "SUPERSEDED", "the kept occurrence is untouched");

  console.log("\n[18] Executor loop: explicit start, processes work, graceful stop halts claiming:");
  let loopPerformed = 0;
  const jl = await enqueueJob(mkInput(a.id, "src-18", { automationType: "fake_type", occurrenceKey: "f-18" }));
  await markQueued(jl.id, new Date());
  const loop = startExecutorLoop(handler(() => ({ kind: "ALLOW" }), async () => { loopPerformed++; return { producedDomainEffect: false }; }), { idleMs: 20 });
  for (let i = 0; i < 50 && (await getJob(a.id, jl.id)).status !== "SUCCEEDED"; i++) await new Promise((r) => setTimeout(r, 20));
  await loop.stop();
  assert((await getJob(a.id, jl.id)).status === "SUCCEEDED" && loopPerformed >= 1, "the loop processed a queued job via the handler");
  const jl2 = await enqueueJob(mkInput(a.id, "src-18b", { automationType: "fake_type", occurrenceKey: "f-18b" }));
  await markQueued(jl2.id, new Date());
  await new Promise((r) => setTimeout(r, 60));
  assert((await getJob(a.id, jl2.id)).status === "QUEUED", "after stop() the loop claims no new work");
} finally {
  console.log("\nCleaning up throwaway orgs (cascade)...");
  for (const id of orgIds) await prisma.organization.delete({ where: { id } }).catch((e) => console.log(`  cleanup warn: ${e.message}`));
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
