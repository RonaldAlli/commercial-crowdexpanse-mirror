// Pure operational-health projection for the Automation domain (Phase 2.0.1). Plain job +
// execution arrays in → a health summary out. No Prisma, no clock (reference `now` injected),
// never mutates its inputs. The thin read service maps DB rows to these shapes and the
// ADMIN health route renders the result. See Implementation Plan Determination 12.

import type { AutomationJobStatus, AutomationExecutionOutcome } from "@prisma/client";

export type HealthJobInput = {
  status: AutomationJobStatus;
  availableAt: Date;
  leaseExpiresAt: Date | null;
  createdAt: Date;
};

export type HealthExecutionInput = {
  outcome: AutomationExecutionOutcome;
  durationMs: number;
  policyDecision: string;
  failureClass: string | null;
  createdAt: Date;
};

export type HealthSummary = {
  queueDepth: number; // PENDING + QUEUED
  oldestPendingAgeMs: number | null;
  running: number;
  staleLeases: number; // RUNNING with an expired lease
  retryScheduled: number;
  deadLettered: number;
  windowExecutions: number;
  succeeded: number;
  failed: number;
  noop: number;
  successRate: number | null; // succeeded / windowExecutions
  avgDurationMs: number | null;
  p95DurationMs: number | null;
  policyDenials: number;
  orgScopeViolations: number;
};

/**
 * Project a health summary. `jobs` are the current non-terminal + recent jobs; `executions`
 * are the executions within the reporting window. `now` is injected for stale-lease and
 * oldest-pending age. Pure: inputs are read, never mutated; new values are returned.
 */
export function projectHealth(
  jobs: HealthJobInput[],
  executions: HealthExecutionInput[],
  now: Date,
): HealthSummary {
  const nowMs = now.getTime();

  let queueDepth = 0;
  let running = 0;
  let staleLeases = 0;
  let retryScheduled = 0;
  let deadLettered = 0;
  let oldestPendingAgeMs: number | null = null;

  for (const job of jobs) {
    if (job.status === "PENDING" || job.status === "QUEUED") {
      queueDepth++;
      const age = nowMs - job.createdAt.getTime();
      if (oldestPendingAgeMs === null || age > oldestPendingAgeMs) oldestPendingAgeMs = age;
    } else if (job.status === "RUNNING") {
      running++;
      if (job.leaseExpiresAt !== null && job.leaseExpiresAt.getTime() < nowMs) staleLeases++;
    } else if (job.status === "RETRY_SCHEDULED") {
      retryScheduled++;
    } else if (job.status === "DEAD_LETTERED") {
      deadLettered++;
    }
  }

  let succeeded = 0;
  let failed = 0;
  let noop = 0;
  let policyDenials = 0;
  let orgScopeViolations = 0;
  const durations: number[] = [];

  for (const ex of executions) {
    if (ex.outcome === "SUCCEEDED") succeeded++;
    else if (ex.outcome === "FAILED") failed++;
    else if (ex.outcome === "NOOP") noop++;
    if (ex.policyDecision === "DENY") policyDenials++;
    if (ex.failureClass === "ORG_SCOPE_VIOLATION") orgScopeViolations++;
    durations.push(ex.durationMs);
  }

  const windowExecutions = executions.length;
  const successRate = windowExecutions === 0 ? null : succeeded / windowExecutions;
  const avgDurationMs =
    durations.length === 0 ? null : durations.reduce((a, b) => a + b, 0) / durations.length;
  const p95DurationMs = percentile(durations, 95);

  return {
    queueDepth,
    oldestPendingAgeMs,
    running,
    staleLeases,
    retryScheduled,
    deadLettered,
    windowExecutions,
    succeeded,
    failed,
    noop,
    successRate,
    avgDurationMs,
    p95DurationMs,
    policyDenials,
    orgScopeViolations,
  };
}

/** Nearest-rank percentile over a copy of the values (never mutates the input array). */
function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  const idx = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[idx];
}
