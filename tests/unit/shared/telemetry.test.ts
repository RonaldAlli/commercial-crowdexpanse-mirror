import { test } from "node:test";
import assert from "node:assert/strict";

// Force instrumentation OFF for a clean, silent test run (and to exercise the
// gated path). NODE_ENV is read at call time by instrumentEnabled(). Cast around
// the readonly NODE_ENV type augmentation.
const mutableEnv = process.env as Record<string, string | undefined>;
mutableEnv.NODE_ENV = "production";
delete mutableEnv.INSTRUMENT;

import { instrumentEnabled, percentiles, withTiming } from "../../../lib/telemetry";

test("instrumentEnabled respects NODE_ENV and the INSTRUMENT flag", () => {
  assert.equal(instrumentEnabled(), false); // production + no flag
  process.env.INSTRUMENT = "1";
  assert.equal(instrumentEnabled(), true);
  delete process.env.INSTRUMENT;
});

test("withTiming returns the wrapped result UNCHANGED", async () => {
  const value = { id: 7, items: [1, 2, 3] };
  const out = await withTiming("t", async () => value);
  assert.equal(out, value); // same reference, not a copy
});

test("withTiming re-throws the wrapped error", async () => {
  await assert.rejects(() => withTiming("t", async () => { throw new Error("boom"); }), /boom/);
});

test("percentiles computes nearest-rank stats", () => {
  const p = percentiles([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  assert.equal(p.count, 10);
  assert.equal(p.min, 10);
  assert.equal(p.max, 100);
  assert.equal(p.mean, 55);
  assert.equal(p.p50, 50); // ceil(0.5*10)=5 -> 5th value
  assert.equal(p.p95, 100); // ceil(0.95*10)=10 -> 10th value
});

test("percentiles handles an empty sample set", () => {
  assert.deepEqual(percentiles([]), { count: 0, min: 0, p50: 0, p95: 0, p99: 0, max: 0, mean: 0 });
});
