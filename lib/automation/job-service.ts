// Organization-scoped repository for AutomationJob (mutable lifecycle / queue) and the
// insert-only AutomationExecution ledger (Phase 2.0.1, Commit 3). This is the ONLY module
// that writes automation rows. It follows the codebase idioms: `prisma`/`tx`, interactive
// `$transaction`, explicit organizationId scoping, fail-closed reads. The queue is the
// AutomationJob table itself, claimed with SELECT ... FOR UPDATE SKIP LOCKED (ADR-0001).
//
// Immutability (A8/AU-8): the ONLY write to AutomationExecution here is `create`. There is
// deliberately no update or delete path — retries create NEW attempt rows; a completed
// attempt is never rewritten. This is proven by the Commit 3/7 integration tests.

import type {
  AutomationExecution,
  AutomationExecutionOutcome,
  AutomationFailureClass,
  AutomationJob,
  AutomationJobStatus,
  AutomationPolicyDecision,
  AutomationTriggerType,
} from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CLAIM_BATCH, DEFAULT_MAX_ATTEMPTS, LEASE_TTL_MS } from "./types";
import { assertTransition, canRequeue } from "./lifecycle";
import { projectHealth, type HealthSummary } from "./health";

type Db = Prisma.TransactionClient | typeof prisma;

const IDEMPOTENCY_UNIQUE = "automation_job_idempotency";

// ── Enqueue (idempotent creation) ────────────────────────────────────────────────
export type EnqueueInput = {
  organizationId: string;
  automationType: string;
  sourceType: string;
  sourceId: string;
  policyKey: string;
  policyVersion: number;
  occurrenceKey: string;
  triggerType?: AutomationTriggerType;
  correlationId?: string | null;
  causationId?: string | null;
  maxAttempts?: number;
  availableAt?: Date;
};

function idempotencyWhere(input: EnqueueInput) {
  return {
    [IDEMPOTENCY_UNIQUE]: {
      organizationId: input.organizationId,
      automationType: input.automationType,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      policyVersion: input.policyVersion,
      occurrenceKey: input.occurrenceKey,
    },
  } as Prisma.AutomationJobWhereUniqueInput;
}

/**
 * Read-check-then-create on the compound unique (RefreshJob precedent). Identical logical
 * occurrences converge to ONE job; the second caller receives the first job. A concurrent
 * create race is caught (P2002) and resolved by re-reading the winner.
 */
export async function enqueueJob(input: EnqueueInput): Promise<AutomationJob> {
  const where = idempotencyWhere(input);
  const existing = await prisma.automationJob.findUnique({ where });
  if (existing) return existing;
  try {
    return await prisma.automationJob.create({
      data: {
        organizationId: input.organizationId,
        automationType: input.automationType,
        status: "PENDING",
        triggerType: input.triggerType ?? "SCHEDULE",
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        policyKey: input.policyKey,
        policyVersion: input.policyVersion,
        occurrenceKey: input.occurrenceKey,
        maxAttempts: input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
        availableAt: input.availableAt ?? new Date(),
        correlationId: input.correlationId ?? null,
        causationId: input.causationId ?? null,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const winner = await prisma.automationJob.findUnique({ where });
      if (winner) return winner;
    }
    throw err;
  }
}

/** Move a freshly-enqueued PENDING job to QUEUED so the executor may claim it. */
export async function markQueued(jobId: string, now: Date): Promise<void> {
  const job = await prisma.automationJob.findUnique({ where: { id: jobId } });
  if (!job) return;
  assertTransition(job.status, "QUEUED");
  await prisma.automationJob.update({
    where: { id: jobId },
    data: { status: "QUEUED", availableAt: now },
  });
}

// ── Claim (atomic, concurrency-safe) ──────────────────────────────────────────────
/**
 * Claim up to `batch` due QUEUED jobs using SELECT ... FOR UPDATE SKIP LOCKED, so two
 * executors never claim the same job. Each claimed job → RUNNING with a fresh lease and an
 * incremented attempt counter (runningAttempt = the attempt number for this execution).
 * Returns the claimed jobs (org carried on each row; the executor never crosses orgs).
 */
export async function claimDueJobs(now: Date, batch: number = CLAIM_BATCH): Promise<AutomationJob[]> {
  const lease = new Date(now.getTime() + LEASE_TTL_MS);
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string; attempts: number }[]>(Prisma.sql`
      SELECT id, attempts
      FROM automation_jobs
      WHERE status::text = 'QUEUED' AND "availableAt" <= ${now}
      ORDER BY "availableAt" ASC
      LIMIT ${batch}
      FOR UPDATE SKIP LOCKED
    `);
    if (rows.length === 0) return [];
    for (const row of rows) {
      const attemptNumber = row.attempts + 1;
      await tx.automationJob.update({
        where: { id: row.id },
        data: {
          status: "RUNNING",
          attempts: attemptNumber,
          runningAttempt: attemptNumber,
          leaseExpiresAt: lease,
        },
      });
    }
    return tx.automationJob.findMany({ where: { id: { in: rows.map((r) => r.id) } } });
  });
}

/** Promote due RETRY_SCHEDULED jobs back to QUEUED (RETRY_SCHEDULED → QUEUED, legal). */
export async function promoteDueRetries(now: Date): Promise<number> {
  const due = await prisma.automationJob.findMany({
    where: { status: "RETRY_SCHEDULED", nextAttemptAt: { not: null, lte: now } },
    select: { id: true },
  });
  for (const { id } of due) {
    await prisma.automationJob.update({
      where: { id },
      data: { status: "QUEUED", availableAt: now, nextAttemptAt: null },
    });
  }
  return due.length;
}

// ── Finalize (one transaction: immutable execution + job status) ───────────────────
export type FinalizeInput = {
  job: AutomationJob;
  attemptNumber: number;
  outcome: AutomationExecutionOutcome;
  policyKey: string;
  policyVersion: number;
  policyDecision: AutomationPolicyDecision;
  contextFingerprint: string;
  startedAt: Date;
  finishedAt: Date;
  principalKey: string;
  triggerRef?: string | null;
  producedDomainEffect?: boolean;
  retryAllowed?: boolean;
  failureClass?: AutomationFailureClass | null;
  error?: string | null;
  correlationId?: string | null;
  causationId?: string | null;
  activityLogId?: string | null;
  nextStatus: AutomationJobStatus;
  nextAttemptAt?: Date | null;
};

/**
 * Insert the immutable execution row AND advance the job's status in ONE transaction. This
 * is the sole writer of AutomationExecution (insert-only). If a future mutating phase adds a
 * domain effect, it joins this same transaction via the tx-or-prisma idiom. In 2.0.1
 * producedDomainEffect defaults to false and is asserted false by tests.
 */
export async function finalizeJob(
  input: FinalizeInput,
): Promise<{ job: AutomationJob; execution: AutomationExecution }> {
  assertTransition(input.job.status, input.nextStatus);
  const durationMs = Math.max(0, input.finishedAt.getTime() - input.startedAt.getTime());
  return prisma.$transaction(async (tx) => {
    const execution = await tx.automationExecution.create({
      data: {
        organizationId: input.job.organizationId,
        automationJobId: input.job.id,
        attemptNumber: input.attemptNumber,
        automationType: input.job.automationType,
        triggerType: input.job.triggerType,
        triggerRef: input.triggerRef ?? input.job.sourceId,
        policyKey: input.policyKey,
        policyVersion: input.policyVersion,
        policyDecision: input.policyDecision,
        contextFingerprint: input.contextFingerprint,
        startedAt: input.startedAt,
        finishedAt: input.finishedAt,
        durationMs,
        outcome: input.outcome,
        producedDomainEffect: input.producedDomainEffect ?? false,
        retryAllowed: input.retryAllowed ?? false,
        failureClass: input.failureClass ?? null,
        error: input.error ?? null,
        principalType: "AUTOMATION",
        principalKey: input.principalKey,
        correlationId: input.correlationId ?? input.job.correlationId,
        causationId: input.causationId ?? input.job.causationId,
        activityLogId: input.activityLogId ?? null,
      },
    });
    const job = await tx.automationJob.update({
      where: { id: input.job.id },
      data: {
        status: input.nextStatus,
        nextAttemptAt: input.nextStatus === "RETRY_SCHEDULED" ? (input.nextAttemptAt ?? null) : null,
        leaseExpiresAt: null,
        runningAttempt: null,
        lastFailureClass: input.failureClass ?? input.job.lastFailureClass,
      },
    });
    return { job, execution };
  });
}

// ── Operator requeue (ADMIN-gated by the CALLER via canRequeueAutomationJob) ───────
/**
 * Requeue a DEAD_LETTERED job. This is a controlled operator exception (not a raw
 * transition): the job returns to QUEUED and a subsequent claim creates a NEW attempt. It
 * NEVER mutates or deletes any prior AutomationExecution row. Grants one more attempt.
 */
export async function requeueDeadLetteredJob(
  organizationId: string,
  jobId: string,
  now: Date,
): Promise<AutomationJob> {
  return prisma.$transaction(async (tx) => {
    const job = await tx.automationJob.findFirst({ where: { id: jobId, organizationId } });
    if (!job) throw new Error("Automation job not found in organization");
    if (!canRequeue(job.status)) throw new Error(`Cannot requeue a job in status ${job.status}`);
    return tx.automationJob.update({
      where: { id: job.id },
      data: {
        status: "QUEUED",
        availableAt: now,
        nextAttemptAt: null,
        leaseExpiresAt: null,
        runningAttempt: null,
        maxAttempts: job.attempts + 1,
      },
    });
  });
}

// ── Organization-scoped reads (fail closed) ────────────────────────────────────────
export async function getJob(organizationId: string, jobId: string): Promise<AutomationJob | null> {
  return prisma.automationJob.findFirst({ where: { id: jobId, organizationId } });
}

export async function listJobExecutions(
  organizationId: string,
  jobId: string,
): Promise<AutomationExecution[]> {
  return prisma.automationExecution.findMany({
    where: { organizationId, automationJobId: jobId },
    orderBy: { attemptNumber: "asc" },
  });
}

/**
 * Org-scoped operational-health read. Loads the org's current non-terminal jobs plus the
 * executions in the trailing `windowMs` and projects them with the pure `projectHealth`.
 * Terminal-but-informative statuses (DEAD_LETTERED) are always included regardless of age so
 * an operator sees outstanding dead letters. No cross-org data is ever read.
 */
export async function fetchAutomationHealth(
  organizationId: string,
  now: Date,
  windowMs: number = 24 * 60 * 60 * 1000,
): Promise<HealthSummary> {
  const windowStart = new Date(now.getTime() - windowMs);
  const [jobs, executions] = await Promise.all([
    prisma.automationJob.findMany({
      where: {
        organizationId,
        OR: [
          { status: { in: ["PENDING", "QUEUED", "RUNNING", "RETRY_SCHEDULED", "DEAD_LETTERED"] } },
          { updatedAt: { gte: windowStart } },
        ],
      },
      select: { status: true, availableAt: true, leaseExpiresAt: true, createdAt: true },
    }),
    prisma.automationExecution.findMany({
      where: { organizationId, createdAt: { gte: windowStart } },
      select: { outcome: true, durationMs: true, policyDecision: true, failureClass: true, createdAt: true },
    }),
  ]);
  return projectHealth(jobs, executions, now);
}

/**
 * Validate that a source entity exists within the organization (fail closed). 2.0.1's only
 * source type is "opportunity"; an unknown type or a cross-org id returns false.
 */
export async function sourceExistsInOrg(
  organizationId: string,
  sourceType: string,
  sourceId: string,
  db: Db = prisma,
): Promise<boolean> {
  if (sourceType !== "opportunity") return false;
  const found = await db.opportunity.findFirst({
    where: { id: sourceId, organizationId },
    select: { id: true },
  });
  return found !== null;
}
