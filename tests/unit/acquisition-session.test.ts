import { test } from "node:test";
import assert from "node:assert/strict";

import { deriveSessionProgress, formatElapsed, clampGoal, DEFAULT_SESSION_GOAL } from "../../lib/acquisition-session";

const H = 3_600_000;

test("clampGoal bounds and defaults", () => {
  assert.equal(clampGoal(100), 100);
  assert.equal(clampGoal(0), 1);
  assert.equal(clampGoal(99999), 1000);
  assert.equal(clampGoal(NaN), DEFAULT_SESSION_GOAL);
  assert.equal(clampGoal(37.6), 38);
});

test("remaining never goes negative; goalReached flips at the goal", () => {
  const over = deriveSessionProgress({ goalCalls: 100, completed: 120, appointments: 4, qualified: 9, startedAtMs: 0, nowMs: 2 * H });
  assert.equal(over.remaining, 0);
  assert.equal(over.goalReached, true);
  const under = deriveSessionProgress({ goalCalls: 100, completed: 37, appointments: 4, qualified: 9, startedAtMs: 0, nowMs: 1.7 * H });
  assert.equal(under.remaining, 63);
  assert.equal(under.goalReached, false);
});

test("callsPerHour is suppressed in the first 5 minutes, then realized", () => {
  const early = deriveSessionProgress({ goalCalls: 100, completed: 3, appointments: 0, qualified: 0, startedAtMs: 0, nowMs: 2 * 60 * 1000 });
  assert.equal(early.callsPerHour, null);
  const paced = deriveSessionProgress({ goalCalls: 100, completed: 37, appointments: 4, qualified: 9, startedAtMs: 0, nowMs: 1.7 * H });
  assert.equal(paced.callsPerHour, Math.round(37 / 1.7)); // ~22/hr
});

test("negative/garbage counts floor at zero", () => {
  const p = deriveSessionProgress({ goalCalls: 100, completed: -5, appointments: -2, qualified: -1, startedAtMs: 100, nowMs: 50 });
  assert.equal(p.completed, 0);
  assert.equal(p.appointments, 0);
  assert.equal(p.qualified, 0);
  assert.equal(p.elapsedMs, 0);
});

test("formatElapsed", () => {
  assert.equal(formatElapsed(0), "0h 00m");
  assert.equal(formatElapsed(7 * 60 * 1000), "0h 07m");
  assert.equal(formatElapsed(1 * H + 42 * 60 * 1000), "1h 42m");
});
