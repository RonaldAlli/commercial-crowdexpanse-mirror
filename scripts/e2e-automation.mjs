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
import { recordAutomationActivity } from "../lib/automation/activity.ts";
import { fetchAutomationHealth } from "../lib/automation/job-service.ts";
import { classifyEvent } from "../lib/transaction-timeline.ts";
import { handlers as realHandlers, seeders as realSeeders } from "../lib/automation/registry.ts";
import {
  closingReadinessHandler,
  closingReadinessSeeder,
  CLOSING_READINESS_AUTOMATION_TYPE,
} from "../lib/automation/proof-observer.ts";

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

  // ── Commit 5: Automation Principal + ActivityLog compatibility ────────────────
  console.log("\n[19] Automation ActivityLog attribution (business observation only):");
  const j19 = await enqueueJob(mkInput(a.id, oppA.id, { automationType: "fake_type", occurrenceKey: "f-19" }));
  await markQueued(j19.id, new Date());
  await runExecutorOnce(handler(() => ({ kind: "ALLOW" }), async () => ({ producedDomainEffect: false, observationSummary: "Closing readiness observed" })), new Date());
  const ex19 = (await listJobExecutions(a.id, j19.id))[0];
  const log19 = await prisma.activityLog.findFirst({ where: { organizationId: a.id, automationExecutionId: ex19.id } });
  assert(log19 !== null, "an ActivityLog row is emitted for a business observation");
  assert(log19.actorType === "AUTOMATION" && log19.actorId === null, "attributed to AUTOMATION, never a user (AU-3)");
  assert(log19.automationExecutionId === ex19.id, "linked to the originating execution");
  assert(log19.eventType === "automation.fake_type.observed", "honest automation.* event type");
  assert(log19.opportunityId === oppA.id, "linked to the source opportunity");

  console.log("\n[20] ActivityLog backward compatibility (human + system events unchanged):");
  const user = await prisma.user.create({ data: { organizationId: a.id, name: "H", email: `h-${process.pid}@example.com`, hashedPassword: "x", role: UserRole.ADMIN } });
  const humanRow = await prisma.activityLog.create({ data: { organizationId: a.id, actorId: user.id, eventType: "opportunity.updated", eventLabel: "Updated" } });
  assert(humanRow.actorType === "USER", "a human event defaults to actorType USER (no behavior change)");
  const sysRow = await prisma.activityLog.create({ data: { organizationId: a.id, actorId: null, eventType: "system.note", eventLabel: "System" } });
  assert(sysRow.actorType === "USER" && sysRow.actorId === null, "a null-actor system event keeps existing semantics");
  assert((await prisma.activityLog.findMany({ where: { organizationId: a.id, actorType: "USER" } })).length >= 2, "existing rows query normally by actorType");

  console.log("\n[21] Cross-org ActivityLog linkage is rejected (fail closed):");
  const crossId = await recordAutomationActivity({ organizationId: b.id, execution: { id: ex19.id, organizationId: a.id }, eventType: "automation.x.observed", eventLabel: "x" });
  assert(crossId === null, "linking org B activity to an org A execution is refused");

  console.log("\n[22] Operational mechanics never write ActivityLog (two-ledger separation):");
  const beforeAuto = await prisma.activityLog.count({ where: { organizationId: a.id, actorType: "AUTOMATION" } });
  const j22 = await enqueueJob(mkInput(a.id, oppA.id, { automationType: "fake_type", occurrenceKey: "f-22" }));
  await markQueued(j22.id, new Date());
  await runExecutorOnce(handler(() => ({ kind: "ALLOW" }), async () => ({ producedDomainEffect: false })), new Date());
  assert((await prisma.activityLog.count({ where: { organizationId: a.id, actorType: "AUTOMATION" } })) === beforeAuto, "a job with no business observation writes NO ActivityLog row");
  assert((await listJobExecutions(a.id, j22.id))[0].outcome === "SUCCEEDED", "the job still recorded its operational execution row");

  console.log("\n[23] Transaction Timeline forward-compatibility for automation events:");
  assert(typeof classifyEvent("automation.fake_type.observed") === "string", "an unknown automation.* event classifies without throwing (forward-compatible)");

  // ── Commit 6: the read-only closing-readiness PROOF automation ────────────────
  console.log("\n[24] Registry wires exactly the approved proof automation (handler + seeder):");
  assert(realHandlers[CLOSING_READINESS_AUTOMATION_TYPE]?.automationType === CLOSING_READINESS_AUTOMATION_TYPE, "the registry maps the proof type to its handler");
  assert(typeof realSeeders[CLOSING_READINESS_AUTOMATION_TYPE] === "function", "the registry maps the proof type to its seeder");
  assert(Object.keys(realHandlers).length === 1 && Object.keys(realSeeders).length === 1, "the registry wires EXACTLY one automation — the approved proof job — and nothing else");
  assert(closingReadinessHandler.automationType === CLOSING_READINESS_AUTOMATION_TYPE && closingReadinessHandler.policyVersion === 1, "the handler declares a versioned policy");

  // An in-flight opportunity (in closing scope) and a LEAD opportunity (out of scope).
  const oppIF = await mkOpp(a.id, "In-Flight Deal");
  await prisma.opportunity.update({ where: { id: oppIF.id }, data: { stage: "UNDER_CONTRACT" } });
  const oppLead = await mkOpp(a.id, "Lead Deal"); // stays LEAD (out of closing scope)

  console.log("\n[25] gatherContext is org-scoped + consumes the SHARED closing projection:");
  const jobIF = await enqueueJob(mkInput(a.id, oppIF.id, { occurrenceKey: "proof-if" }));
  const gcIF = await closingReadinessHandler.gatherContext(jobIF);
  assert(gcIF.context.targetPresent === true && gcIF.context.targetInScope === true, "an in-flight opportunity is present and in scope");
  assert(typeof gcIF.fingerprint === "string" && gcIF.fingerprint.length === 64, "a deterministic 64-hex context fingerprint is produced");
  assert(gcIF.observation && gcIF.observation.readiness !== undefined, "the observation IS the shared projectClosingBadges summary (readiness present)");
  const gcIF2 = await closingReadinessHandler.gatherContext(jobIF);
  assert(gcIF2.fingerprint === gcIF.fingerprint, "gatherContext is deterministic (same inputs → same fingerprint)");
  assert(closingReadinessHandler.policy(gcIF.context).kind === "ALLOW", "policy ALLOWs an in-scope, present, permitted observation");

  const jobLead = await enqueueJob(mkInput(a.id, oppLead.id, { occurrenceKey: "proof-lead" }));
  const gcLead = await closingReadinessHandler.gatherContext(jobLead);
  assert(gcLead.context.targetInScope === false, "a LEAD opportunity is out of closing scope");
  assert(closingReadinessHandler.policy(gcLead.context).kind === "NO_ACTION", "policy → NO_ACTION for an out-of-scope target (clean skip)");

  console.log("\n[26] Missing source → NO_ACTION; cross-org source read is refused (fail closed):");
  const jobMissing = await enqueueJob(mkInput(a.id, "does-not-exist", { occurrenceKey: "proof-missing" }));
  const gcMissing = await closingReadinessHandler.gatherContext(jobMissing);
  assert(gcMissing.context.targetPresent === false, "a missing source is not present");
  assert(closingReadinessHandler.policy(gcMissing.context).kind === "NO_ACTION", "policy → NO_ACTION for a missing source");
  const jobCross = await enqueueJob(mkInput(b.id, oppIF.id, { occurrenceKey: "proof-cross" }));
  const gcCross = await closingReadinessHandler.gatherContext(jobCross);
  assert(gcCross.context.targetPresent === false, "org B cannot read org A's opportunity through the proof job (no cross-org read)");
  assert(closingReadinessHandler.policy(gcCross.context).kind === "NO_ACTION", "policy → NO_ACTION for a cross-org source (fail closed)");

  console.log("\n[27] The pure policy detects DENY and STALE_CONTEXT deterministically:");
  assert(closingReadinessHandler.policy({ organizationId: a.id, principalAllowed: false, targetPresent: true, targetInScope: true, currentContextFingerprint: "x" }).kind === "DENY", "a disallowed principal → DENY");
  assert(closingReadinessHandler.policy({ organizationId: a.id, principalAllowed: true, targetPresent: true, targetInScope: true, expectedContextFingerprint: "old", currentContextFingerprint: "new" }).kind === "STALE_CONTEXT", "a changed context fingerprint → STALE_CONTEXT");

  console.log("\n[28] perform() is READ-ONLY: producedDomainEffect=false, no ActivityLog by default:");
  const perfRes = await closingReadinessHandler.perform(jobIF, gcIF.context, gcIF.observation);
  assert(perfRes.producedDomainEffect === false, "perform() always reports producedDomainEffect=false");
  assert(!perfRes.observationSummary, "with AUTOMATION_EMIT_OBSERVATION unset, no ActivityLog observation is emitted");

  console.log("\n[29] End-to-end proof run via the REAL registry mutates NO domain state:");
  // Isolate the run: retire any leftover queued jobs so only the proof job is claimable.
  await prisma.automationJob.updateMany({ where: { status: "QUEUED" }, data: { status: "SUPERSEDED" } });
  const domainSnapshot = async (orgId) => JSON.stringify({
    opportunities: await prisma.opportunity.findMany({ where: { organizationId: orgId }, orderBy: { id: "asc" } }),
    escrow: await prisma.escrowRecord.count({ where: { organizationId: orgId } }),
    financing: await prisma.financingRecord.count({ where: { organizationId: orgId } }),
    assignments: await prisma.assignmentRecord.count({ where: { organizationId: orgId } }),
    checklistItems: await prisma.closingChecklistItem.count({ where: { checklist: { organizationId: orgId } } }),
    activityAutomation: await prisma.activityLog.count({ where: { organizationId: orgId, actorType: "AUTOMATION" } }),
  });
  const jobRun = await enqueueJob(mkInput(a.id, oppIF.id, { occurrenceKey: "proof-run" }));
  await markQueued(jobRun.id, new Date());
  const before = await domainSnapshot(a.id);
  const { processed } = await runExecutorOnce(realHandlers, new Date());
  const after = await domainSnapshot(a.id);
  assert(processed >= 1, "the executor processed the queued proof job through the real registry");
  assert(before === after, "byte-for-byte: no opportunity/escrow/financing/assignment/checklist/AUTOMATION-activity change");
  const runExec = (await listJobExecutions(a.id, jobRun.id))[0];
  assert((await getJob(a.id, jobRun.id)).status === "SUCCEEDED", "the proof job finalized SUCCEEDED");
  assert(runExec.outcome === "SUCCEEDED" && runExec.policyDecision === "ALLOW", "its immutable execution recorded ALLOW/SUCCEEDED");
  assert(runExec.producedDomainEffect === false, "the execution ledger records producedDomainEffect=false");
  assert(runExec.principalKey === "automation:closing_readiness_observation", "the execution is attributed to the AUTOMATION principal (never a user)");

  console.log("\n[30] The seeder enqueues only IN-FLIGHT opportunities, idempotently per hour bucket:");
  const seededN = await closingReadinessSeeder(a.id, new Date("2026-07-16T18:00:00Z"));
  assert(seededN >= 1, "the seeder enqueued the in-flight opportunity");
  const seededJob = await prisma.automationJob.findFirst({ where: { organizationId: a.id, automationType: CLOSING_READINESS_AUTOMATION_TYPE, sourceId: oppIF.id, occurrenceKey: "2026-07-16T18" } });
  assert(seededJob !== null, "the seeded job carries the UTC hour-bucket occurrence key");
  const seededAgain = await closingReadinessSeeder(a.id, new Date("2026-07-16T18:30:00Z"));
  assert(seededAgain === 0, "a second seed in the same hour bucket is idempotent (no duplicate)");
  // The seeder (bucket "2026-07-16T18") must never have enqueued the LEAD opp — only the
  // manual proof-lead job from [25] exists for it, so no job carries the seeder's bucket.
  const leadSeededByScheduler = await prisma.automationJob.count({ where: { organizationId: a.id, sourceId: oppLead.id, automationType: CLOSING_READINESS_AUTOMATION_TYPE, occurrenceKey: "2026-07-16T18" } });
  assert(leadSeededByScheduler === 0, "the out-of-scope LEAD opportunity is never seeded by the scheduler");

  console.log("\n[31] Health projection is organization-scoped (operator visibility):");
  const healthA = await fetchAutomationHealth(a.id, new Date());
  assert(typeof healthA.queueDepth === "number" && typeof healthA.windowExecutions === "number", "the health summary exposes queue + execution counters");
  assert(healthA.windowExecutions >= 1 && healthA.succeeded >= 1, "org A sees its own executions (including the proof job's success)");
  const emptyOrg = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-c` } });
  orgIds.push(emptyOrg.id);
  const healthEmpty = await fetchAutomationHealth(emptyOrg.id, new Date());
  assert(healthEmpty.windowExecutions === 0 && healthEmpty.queueDepth === 0, "a fresh org's health sees NONE of another org's automation (org-scoped read)");
} finally {
  console.log("\nCleaning up throwaway orgs (cascade)...");
  for (const id of orgIds) await prisma.organization.delete({ where: { id } }).catch((e) => console.log(`  cleanup warn: ${e.message}`));
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
