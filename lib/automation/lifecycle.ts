// Pure job-lifecycle logic for the Automation domain (Phase 2.0.1): legal status
// transitions, failure-class disposition, and exponential retry backoff. No Prisma, no
// clock (the reference `now` is always injected), no I/O — unit-tested directly.
//
// Job status is the MUTABLE lifecycle (AutomationJob); a failed *attempt* is an immutable
// AutomationExecution outcome. FAILED is deliberately an attempt-grain concept, not a job
// status: a job that can no longer succeed terminates at DEAD_LETTERED (operator-actionable).
// See Implementation Plan Determinations 2, 3, 8.

import type { AutomationJobStatus, AutomationFailureClass } from "@prisma/client";
import { BACKOFF_BASE_MS, BACKOFF_CAP_MS } from "./types";

export const TERMINAL_STATUSES: AutomationJobStatus[] = [
  "SUCCEEDED",
  "DEAD_LETTERED",
  "CANCELLED",
  "SUPERSEDED",
];

export function isTerminal(status: AutomationJobStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

// Legal raw transitions. Requeue of a DEAD_LETTERED job is NOT a raw transition — it is a
// controlled operator operation (canRequeue) that creates a NEW attempt, never rewriting a
// prior one. Everything else fails closed.
const LEGAL_TRANSITIONS: Record<AutomationJobStatus, AutomationJobStatus[]> = {
  PENDING: ["QUEUED", "CANCELLED", "SUPERSEDED"],
  QUEUED: ["RUNNING", "CANCELLED", "SUPERSEDED"],
  RUNNING: ["SUCCEEDED", "RETRY_SCHEDULED", "DEAD_LETTERED"],
  RETRY_SCHEDULED: ["QUEUED", "CANCELLED", "SUPERSEDED"],
  SUCCEEDED: [],
  DEAD_LETTERED: [],
  CANCELLED: [],
  SUPERSEDED: [],
};

export function canTransition(from: AutomationJobStatus, to: AutomationJobStatus): boolean {
  return LEGAL_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Throw (fail closed) on an illegal transition — callers use this before any status write. */
export function assertTransition(from: AutomationJobStatus, to: AutomationJobStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal automation job transition: ${from} -> ${to}`);
  }
}

/** Cancellation is allowed only from a non-running, non-terminal state (Determination 3). */
export function canCancel(status: AutomationJobStatus): boolean {
  return status === "PENDING" || status === "QUEUED" || status === "RETRY_SCHEDULED";
}

/** A dead-lettered job is the only requeue target; requeue creates a new attempt. */
export function canRequeue(status: AutomationJobStatus): boolean {
  return status === "DEAD_LETTERED";
}

// ── Failure disposition ──────────────────────────────────────────────────────────
export type FailureDisposition = {
  retryable: boolean;
  alert: boolean;
};

// Per-class policy (Implementation Plan §9). POLICY_DENIED / STALE_CONTEXT are decision
// outcomes rather than genuine failures — non-retryable and non-alerting. ORG_SCOPE_VIOLATION,
// PERMISSION_FAILURE, INVARIANT_VIOLATION, VALIDATION_FAILURE are permanent and alert.
const FAILURE_POLICY: Record<AutomationFailureClass, FailureDisposition> = {
  TRANSIENT_INFRASTRUCTURE: { retryable: true, alert: false },
  DATABASE_CONTENTION: { retryable: true, alert: false },
  DEPENDENCY_UNAVAILABLE: { retryable: true, alert: false },
  POLICY_DENIED: { retryable: false, alert: false },
  STALE_CONTEXT: { retryable: false, alert: false },
  VALIDATION_FAILURE: { retryable: false, alert: true },
  PERMISSION_FAILURE: { retryable: false, alert: true },
  ORG_SCOPE_VIOLATION: { retryable: false, alert: true },
  INVARIANT_VIOLATION: { retryable: false, alert: true },
  UNKNOWN: { retryable: true, alert: true },
};

export function failureDisposition(failureClass: AutomationFailureClass): FailureDisposition {
  return FAILURE_POLICY[failureClass];
}

/**
 * The job status a RUNNING job moves to after a failed attempt: RETRY_SCHEDULED while the
 * class is retryable AND attempts remain, otherwise DEAD_LETTERED (terminal, operator-actionable).
 */
export function nextStatusAfterFailure(
  failureClass: AutomationFailureClass,
  attempts: number,
  maxAttempts: number,
): AutomationJobStatus {
  const { retryable } = failureDisposition(failureClass);
  return retryable && attempts < maxAttempts ? "RETRY_SCHEDULED" : "DEAD_LETTERED";
}

// ── Exponential backoff (pure; `now` injected) ─────────────────────────────────────
/** Backoff delay for the given attempt number (1-based): base * 2^(attempt-1), capped. */
export function backoffMs(attempt: number): number {
  const n = Math.max(0, Math.floor(attempt) - 1);
  const raw = BACKOFF_BASE_MS * 2 ** n;
  return Math.min(BACKOFF_CAP_MS, raw);
}

/** The next-attempt timestamp for a retry, from an injected reference `now`. */
export function nextAttemptAt(now: Date, attempt: number): Date {
  return new Date(now.getTime() + backoffMs(attempt));
}
