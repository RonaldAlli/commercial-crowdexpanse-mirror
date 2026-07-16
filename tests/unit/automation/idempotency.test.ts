import { test } from "node:test";
import assert from "node:assert/strict";

import {
  canonicalJson,
  contextFingerprint,
  hourBucket,
  jobIdentityKey,
  sanitizeError,
} from "../../../lib/automation/idempotency";
import type { JobIdentity } from "../../../lib/automation/types";

test("canonicalJson: key order independent, array order preserved", () => {
  assert.equal(canonicalJson({ b: 1, a: 2 }), canonicalJson({ a: 2, b: 1 }));
  assert.equal(canonicalJson({ a: { y: 1, x: 2 } }), '{"a":{"x":2,"y":1}}');
  assert.notEqual(canonicalJson([1, 2, 3]), canonicalJson([3, 2, 1]));
  assert.equal(canonicalJson(null), "null");
  assert.equal(canonicalJson(5), "5");
  assert.equal(canonicalJson("s"), '"s"');
});

test("contextFingerprint: deterministic, order-independent, 64-hex", () => {
  const a = contextFingerprint({ x: 1, y: 2 });
  const b = contextFingerprint({ y: 2, x: 1 });
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(contextFingerprint({ x: 1 }), contextFingerprint({ x: 2 }));
});

test("hourBucket: UTC hour bucket format", () => {
  assert.equal(hourBucket(new Date("2026-07-16T14:37:59.123Z")), "2026-07-16T14");
  assert.equal(hourBucket(new Date("2026-07-16T14:02:00.000Z")), "2026-07-16T14");
  assert.notEqual(hourBucket(new Date("2026-07-16T14:00:00Z")), hourBucket(new Date("2026-07-16T15:00:00Z")));
});

test("jobIdentityKey: joins all six components", () => {
  const id: JobIdentity = {
    organizationId: "org-1",
    automationType: "closing_readiness_observation",
    sourceType: "opportunity",
    sourceId: "opp-9",
    policyVersion: 1,
    occurrenceKey: "2026-07-16T14",
  };
  const key = jobIdentityKey(id);
  assert.ok(key.includes("org-1"));
  assert.ok(key.includes("opp-9"));
  assert.ok(key.includes("2026-07-16T14"));
  // stable
  assert.equal(jobIdentityKey(id), jobIdentityKey(id));
});

test("sanitizeError: Error, string, and unknown", () => {
  assert.equal(sanitizeError(new Error("boom")), "Error: boom");
  assert.equal(sanitizeError("plain"), "plain");
  assert.equal(sanitizeError(42), "Unknown error");
  assert.equal(sanitizeError({ weird: true }), "Unknown error");
});

test("sanitizeError: redacts connection strings and secrets", () => {
  const out = sanitizeError(new Error("connect postgres://user:pw@host:5432/db failed"));
  assert.ok(!out.includes("pw@host"));
  assert.ok(out.includes("[redacted]"));
  const out2 = sanitizeError("password=hunter2 token: abc123");
  assert.ok(!out2.includes("hunter2"));
  assert.ok(!out2.includes("abc123"));
});

test("sanitizeError: truncates long messages", () => {
  const long = "x".repeat(1000);
  const out = sanitizeError(new Error(long), 100);
  assert.ok(out.length <= 101 + "Error: ".length);
  assert.ok(out.endsWith("…"));
});
