import { test } from "node:test";
import assert from "node:assert/strict";

import {
  projectHealth,
  type HealthJobInput,
  type HealthExecutionInput,
} from "../../../lib/automation/health";

const NOW = new Date("2026-07-16T15:00:00.000Z");

function job(over: Partial<HealthJobInput>): HealthJobInput {
  return {
    status: "PENDING",
    availableAt: NOW,
    leaseExpiresAt: null,
    createdAt: NOW,
    ...over,
  };
}

function exec(over: Partial<HealthExecutionInput>): HealthExecutionInput {
  return {
    outcome: "SUCCEEDED",
    durationMs: 100,
    policyDecision: "ALLOW",
    failureClass: null,
    createdAt: NOW,
    ...over,
  };
}

test("empty inputs → zeros and nulls", () => {
  const h = projectHealth([], [], NOW);
  assert.equal(h.queueDepth, 0);
  assert.equal(h.oldestPendingAgeMs, null);
  assert.equal(h.running, 0);
  assert.equal(h.windowExecutions, 0);
  assert.equal(h.successRate, null);
  assert.equal(h.avgDurationMs, null);
  assert.equal(h.p95DurationMs, null);
});

test("job status counters + oldest pending age", () => {
  const older = new Date(NOW.getTime() - 60_000);
  const newer = new Date(NOW.getTime() - 10_000);
  const jobs: HealthJobInput[] = [
    job({ status: "PENDING", createdAt: older }),
    job({ status: "QUEUED", createdAt: newer }),
    job({ status: "RUNNING", leaseExpiresAt: new Date(NOW.getTime() - 1) }), // stale
    job({ status: "RUNNING", leaseExpiresAt: new Date(NOW.getTime() + 60_000) }), // fresh
    job({ status: "RUNNING", leaseExpiresAt: null }), // running, no lease info
    job({ status: "RETRY_SCHEDULED" }),
    job({ status: "DEAD_LETTERED" }),
    job({ status: "SUCCEEDED" }), // ignored by counters
  ];
  const h = projectHealth(jobs, [], NOW);
  assert.equal(h.queueDepth, 2);
  assert.equal(h.oldestPendingAgeMs, 60_000);
  assert.equal(h.running, 3);
  assert.equal(h.staleLeases, 1);
  assert.equal(h.retryScheduled, 1);
  assert.equal(h.deadLettered, 1);
});

test("execution aggregates: outcomes, rate, denials, org-scope violations", () => {
  const execs: HealthExecutionInput[] = [
    exec({ outcome: "SUCCEEDED", durationMs: 100 }),
    exec({ outcome: "SUCCEEDED", durationMs: 200 }),
    exec({ outcome: "FAILED", durationMs: 300, policyDecision: "DENY", failureClass: "ORG_SCOPE_VIOLATION" }),
    exec({ outcome: "NOOP", durationMs: 50, policyDecision: "NO_ACTION" }),
  ];
  const h = projectHealth([], execs, NOW);
  assert.equal(h.windowExecutions, 4);
  assert.equal(h.succeeded, 2);
  assert.equal(h.failed, 1);
  assert.equal(h.noop, 1);
  assert.equal(h.successRate, 0.5);
  assert.equal(h.avgDurationMs, (100 + 200 + 300 + 50) / 4);
  assert.equal(h.policyDenials, 1);
  assert.equal(h.orgScopeViolations, 1);
  assert.equal(typeof h.p95DurationMs, "number");
});

test("p95 nearest-rank", () => {
  const durs = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const execs = durs.map((d) => exec({ durationMs: d }));
  const h = projectHealth([], execs, NOW);
  assert.equal(h.p95DurationMs, 100); // ceil(0.95*10)=10 → index 9
});

test("projectHealth does not mutate inputs", () => {
  const jobs = [job({ status: "PENDING" })];
  const execs = [exec({ durationMs: 5 }), exec({ durationMs: 1 })];
  const jobsCopy = JSON.parse(JSON.stringify(jobs));
  const execDurations = execs.map((e) => e.durationMs);
  projectHealth(jobs, execs, NOW);
  assert.equal(jobs.length, jobsCopy.length);
  assert.deepEqual(execs.map((e) => e.durationMs), execDurations); // order/values untouched
});
