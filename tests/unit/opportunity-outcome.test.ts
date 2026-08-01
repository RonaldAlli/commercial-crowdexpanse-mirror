import { test } from "node:test";
import assert from "node:assert/strict";

import { decideOutcomeTransition, isTerminalOutcome } from "../../lib/opportunity-outcome";

test("marking Lost or Dead requires an explicit reason (never inferred)", () => {
  assert.equal(decideOutcomeTransition({ current: "ACTIVE", target: "LOST", reason: null, isAdmin: false }).ok, false);
  assert.equal(decideOutcomeTransition({ current: "ACTIVE", target: "DEAD", reason: "   ", isAdmin: false }).ok, false);
  assert.equal(decideOutcomeTransition({ current: "ACTIVE", target: "LOST", reason: "financing failed", isAdmin: false }).ok, true);
  assert.equal(decideOutcomeTransition({ current: "ACTIVE", target: "DEAD", reason: "property sold elsewhere", isAdmin: false }).ok, true);
});

test("reactivating a LOST deal is an ordinary (audited) transition — no admin needed", () => {
  assert.equal(decideOutcomeTransition({ current: "LOST", target: "ACTIVE", reason: null, isAdmin: false }).ok, true);
});

test("reactivating a DEAD deal requires an administrator (FD-1)", () => {
  const denied = decideOutcomeTransition({ current: "DEAD", target: "ACTIVE", reason: null, isAdmin: false });
  assert.equal(denied.ok, false);
  assert.match(denied.ok === false ? denied.reason : "", /administrator/i);
  assert.equal(decideOutcomeTransition({ current: "DEAD", target: "ACTIVE", reason: null, isAdmin: true }).ok, true);
});

test("a no-op transition (already in the target state) is rejected", () => {
  assert.equal(decideOutcomeTransition({ current: "LOST", target: "LOST", reason: "x", isAdmin: true }).ok, false);
});

test("LOST → DEAD is permitted with a reason", () => {
  assert.equal(decideOutcomeTransition({ current: "LOST", target: "DEAD", reason: "withdrawn permanently", isAdmin: false }).ok, true);
});

test("isTerminalOutcome", () => {
  assert.equal(isTerminalOutcome("ACTIVE"), false);
  assert.equal(isTerminalOutcome("LOST"), true);
  assert.equal(isTerminalOutcome("DEAD"), true);
});
