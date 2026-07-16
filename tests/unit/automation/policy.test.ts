import { test } from "node:test";
import assert from "node:assert/strict";

import {
  evaluatePolicy,
  POLICY_VERSION,
  CLOSING_READINESS_POLICY_KEY,
  type PolicyContext,
} from "../../../lib/automation/policy";
import { decisionToPersisted } from "../../../lib/automation/types";

function ctx(over: Partial<PolicyContext> = {}): PolicyContext {
  return {
    organizationId: "org-1",
    principalAllowed: true,
    targetPresent: true,
    targetInScope: true,
    currentContextFingerprint: "fp-current",
    ...over,
  };
}

test("policy constants are stable", () => {
  assert.equal(POLICY_VERSION, 1);
  assert.equal(CLOSING_READINESS_POLICY_KEY, "closing_readiness_observation");
});

test("DENY when principal lacks capability", () => {
  const d = evaluatePolicy(ctx({ principalAllowed: false }));
  assert.equal(d.kind, "DENY");
  assert.equal(decisionToPersisted(d), "DENY");
});

test("NO_ACTION when target absent", () => {
  assert.equal(evaluatePolicy(ctx({ targetPresent: false })).kind, "NO_ACTION");
});

test("NO_ACTION when target out of scope", () => {
  assert.equal(evaluatePolicy(ctx({ targetInScope: false })).kind, "NO_ACTION");
});

test("STALE_CONTEXT when expected fingerprint differs", () => {
  const d = evaluatePolicy(ctx({ expectedContextFingerprint: "fp-old", currentContextFingerprint: "fp-new" }));
  assert.equal(d.kind, "STALE_CONTEXT");
});

test("ALLOW when fingerprints match", () => {
  const d = evaluatePolicy(ctx({ expectedContextFingerprint: "fp-x", currentContextFingerprint: "fp-x" }));
  assert.equal(d.kind, "ALLOW");
});

test("ALLOW when no expected fingerprint provided", () => {
  assert.equal(evaluatePolicy(ctx()).kind, "ALLOW");
});

test("decision is deterministic for identical input", () => {
  const c = ctx({ principalAllowed: false });
  assert.deepEqual(evaluatePolicy(c), evaluatePolicy(c));
});
