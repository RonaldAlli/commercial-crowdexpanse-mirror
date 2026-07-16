// The stale-lease reaper (Phase 2.0.1, Commit 4). Recovers jobs whose executor died mid-
// attempt: a RUNNING job whose lease has expired is finalized as an ABANDONED attempt (an
// immutable execution row, outcome=FAILED, failureClass=UNKNOWN) and then RETRY_SCHEDULED (if
// attempts remain) or DEAD_LETTERED. Idempotent: a job with no expired lease is never touched,
// and attempt-uniqueness prevents a late executor + the reaper from double-recording an attempt.
// No side effects on import.

import { prisma } from "@/lib/prisma";
import { finalizeJob } from "./job-service";
import { nextStatusAfterFailure, nextAttemptAt } from "./lifecycle";

const ABANDONED_FAILURE = "UNKNOWN" as const;

/** Recover all stale RUNNING jobs (expired lease) as of `now`. Returns the count recovered. */
export async function reapStaleJobs(now: Date): Promise<number> {
  const stale = await prisma.automationJob.findMany({
    where: { status: "RUNNING", leaseExpiresAt: { not: null, lt: now } },
  });
  let recovered = 0;
  for (const job of stale) {
    const attemptNumber = job.runningAttempt ?? job.attempts;
    const ns = nextStatusAfterFailure(ABANDONED_FAILURE, job.attempts, job.maxAttempts);
    try {
      await finalizeJob({
        job, attemptNumber, outcome: "FAILED",
        policyKey: job.policyKey, policyVersion: job.policyVersion, policyDecision: "NO_ACTION",
        contextFingerprint: "", startedAt: job.leaseExpiresAt ?? now, finishedAt: now,
        principalKey: "automation:reaper", producedDomainEffect: false,
        failureClass: ABANDONED_FAILURE, error: "lease expired — attempt abandoned",
        retryAllowed: ns === "RETRY_SCHEDULED",
        nextStatus: ns, nextAttemptAt: ns === "RETRY_SCHEDULED" ? nextAttemptAt(now, job.attempts) : null,
      });
      recovered++;
    } catch {
      // A late executor recorded this attempt first (attempt-uniqueness collision) — the job
      // is already being finalized by its owner; skip it. Never double-record.
    }
  }
  return recovered;
}
