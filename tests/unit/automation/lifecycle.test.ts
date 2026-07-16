import { test } from "node:test";
import assert from "node:assert/strict";

import {
  isTerminal,
  TERMINAL_STATUSES,
  canTransition,
  assertTransition,
  canCancel,
  canRequeue,
  failureDisposition,
  nextStatusAfterFailure,
  backoffMs,
  nextAttemptAt,
} from "../../../lib/automation/lifecycle";
import { BACKOFF_BASE_MS, BACKOFF_CAP_MS } from "../../../lib/automation/types";

test("isTerminal: terminal vs non-terminal", () => {
  for (const s of TERMINAL_STATUSES) assert.equal(isTerminal(s), true);
  for (const s of ["PENDING", "QUEUED", "RUNNING", "RETRY_SCHEDULED"] as const) {
    assert.equal(isTerminal(s), false);
  }
});

test("canTransition: legal transitions", () => {
  assert.equal(canTransition("PENDING", "QUEUED"), true);
  assert.equal(canTransition("QUEUED", "RUNNING"), true);
  assert.equal(canTransition("RUNNING", "SUCCEEDED"), true);
  assert.equal(canTransition("RUNNING", "RETRY_SCHEDULED"), true);
  assert.equal(canTransition("RUNNING", "DEAD_LETTERED"), true);
  assert.equal(canTransition("RETRY_SCHEDULED", "QUEUED"), true);
  assert.equal(canTransition("PENDING", "CANCELLED"), true);
  assert.equal(canTransition("QUEUED", "SUPERSEDED"), true);
});

test("canTransition: illegal transitions fail closed", () => {
  assert.equal(canTransition("RUNNING", "QUEUED"), false);
  assert.equal(canTransition("SUCCEEDED", "RUNNING"), false);
  assert.equal(canTransition("DEAD_LETTERED", "QUEUED"), false);
  assert.equal(canTransition("CANCELLED", "PENDING"), false);
  assert.equal(canTransition("PENDING", "RUNNING"), false);
  // Unknown/invalid source status exercises the nullish-coalesce guard.
  assert.equal(canTransition("BOGUS" as never, "QUEUED"), false);
});

test("assertTransition: throws on illegal, passes on legal", () => {
  assert.doesNotThrow(() => assertTransition("QUEUED", "RUNNING"));
  assert.throws(() => assertTransition("RUNNING", "QUEUED"), /Illegal automation job transition/);
});

test("canCancel: only non-running pre-terminal states", () => {
  assert.equal(canCancel("PENDING"), true);
  assert.equal(canCancel("QUEUED"), true);
  assert.equal(canCancel("RETRY_SCHEDULED"), true);
  assert.equal(canCancel("RUNNING"), false);
  assert.equal(canCancel("SUCCEEDED"), false);
  assert.equal(canCancel("DEAD_LETTERED"), false);
});

test("canRequeue: only DEAD_LETTERED", () => {
  assert.equal(canRequeue("DEAD_LETTERED"), true);
  assert.equal(canRequeue("SUCCEEDED"), false);
  assert.equal(canRequeue("RUNNING"), false);
});

test("failureDisposition: retryable classes", () => {
  for (const c of ["TRANSIENT_INFRASTRUCTURE", "DATABASE_CONTENTION", "DEPENDENCY_UNAVAILABLE"] as const) {
    assert.deepEqual(failureDisposition(c), { retryable: true, alert: false });
  }
  assert.deepEqual(failureDisposition("UNKNOWN"), { retryable: true, alert: true });
});

test("failureDisposition: non-retryable classes", () => {
  assert.deepEqual(failureDisposition("POLICY_DENIED"), { retryable: false, alert: false });
  assert.deepEqual(failureDisposition("STALE_CONTEXT"), { retryable: false, alert: false });
  for (const c of ["VALIDATION_FAILURE", "PERMISSION_FAILURE", "ORG_SCOPE_VIOLATION", "INVARIANT_VIOLATION"] as const) {
    assert.deepEqual(failureDisposition(c), { retryable: false, alert: true });
  }
});

test("nextStatusAfterFailure: retry vs dead-letter", () => {
  assert.equal(nextStatusAfterFailure("TRANSIENT_INFRASTRUCTURE", 1, 5), "RETRY_SCHEDULED");
  assert.equal(nextStatusAfterFailure("TRANSIENT_INFRASTRUCTURE", 5, 5), "DEAD_LETTERED");
  assert.equal(nextStatusAfterFailure("TRANSIENT_INFRASTRUCTURE", 6, 5), "DEAD_LETTERED");
  assert.equal(nextStatusAfterFailure("PERMISSION_FAILURE", 1, 5), "DEAD_LETTERED");
  assert.equal(nextStatusAfterFailure("VALIDATION_FAILURE", 0, 5), "DEAD_LETTERED");
});

test("backoffMs: exponential with cap and floor", () => {
  assert.equal(backoffMs(1), BACKOFF_BASE_MS);
  assert.equal(backoffMs(2), BACKOFF_BASE_MS * 2);
  assert.equal(backoffMs(3), BACKOFF_BASE_MS * 4);
  assert.equal(backoffMs(0), BACKOFF_BASE_MS); // floor: attempt<1 → n=0
  assert.equal(backoffMs(-5), BACKOFF_BASE_MS);
  assert.equal(backoffMs(100), BACKOFF_CAP_MS); // capped
});

test("nextAttemptAt: now + backoff, deterministic", () => {
  const now = new Date("2026-07-16T14:00:00.000Z");
  assert.equal(nextAttemptAt(now, 1).getTime(), now.getTime() + BACKOFF_BASE_MS);
  assert.equal(nextAttemptAt(now, 3).getTime(), now.getTime() + BACKOFF_BASE_MS * 4);
  // pure: repeated calls identical
  assert.equal(nextAttemptAt(now, 2).getTime(), nextAttemptAt(now, 2).getTime());
});
