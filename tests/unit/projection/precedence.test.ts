import { test } from "node:test";
import assert from "node:assert/strict";

import { compareSignals, selectWinner, type PrecedenceSignal } from "../../../lib/intelligence/projection-precedence";

const sig = (o: Partial<PrecedenceSignal> & { id: string }): PrecedenceSignal => ({
  isOverride: false,
  asOf: "2026-01-01",
  confidence: 1,
  sourceCategory: "USER_ENTERED",
  ...o,
});

test("empty set has no winner", () => {
  assert.equal(selectWinner([]), null);
});

test("a single signal wins", () => {
  assert.equal(selectWinner([sig({ id: "a" })])?.id, "a");
});

test("tier 1 — an override pin beats everything, even a fresher non-override", () => {
  const pin = sig({ id: "pin", isOverride: true, asOf: "2026-01-01" });
  const fresh = sig({ id: "fresh", asOf: "2026-12-01", confidence: 1 });
  assert.equal(selectWinner([fresh, pin])?.id, "pin");
});

test("tier 2 — latest asOf wins among non-overrides", () => {
  const older = sig({ id: "old", asOf: "2026-01-01" });
  const newer = sig({ id: "new", asOf: "2026-06-01" });
  assert.equal(selectWinner([older, newer])?.id, "new");
});

test("tier 3 — higher confidence breaks an asOf tie", () => {
  const lo = sig({ id: "lo", asOf: "2026-06-01", confidence: 0.4 });
  const hi = sig({ id: "hi", asOf: "2026-06-01", confidence: 0.9 });
  assert.equal(selectWinner([lo, hi])?.id, "hi");
});

test("tier 4 — source-category precedence (USER_ENTERED > LICENSED > PUBLIC > CALCULATION > AI_DERIVED)", () => {
  const common = { asOf: "2026-06-01", confidence: 1 };
  const pub = sig({ id: "pub", sourceCategory: "PUBLIC", ...common });
  const usr = sig({ id: "usr", sourceCategory: "USER_ENTERED", ...common });
  const lic = sig({ id: "lic", sourceCategory: "LICENSED", ...common });
  assert.equal(selectWinner([pub, lic, usr])?.id, "usr");
  assert.equal(selectWinner([pub, lic])?.id, "lic");
});

test("tier 5 — signal id is the final deterministic tiebreak (total order)", () => {
  const common = { asOf: "2026-06-01", confidence: 1, sourceCategory: "PUBLIC" };
  const a = sig({ id: "aaa", ...common });
  const b = sig({ id: "bbb", ...common });
  assert.equal(selectWinner([b, a])?.id, "aaa");
  assert.equal(selectWinner([a, b])?.id, "aaa"); // order-independent → deterministic
});

test("unknown source category ranks last, then falls to the id tiebreak", () => {
  const common = { asOf: "2026-06-01", confidence: 1 };
  const known = sig({ id: "known", sourceCategory: "PUBLIC", ...common });
  const unknown = sig({ id: "zzz-unknown", sourceCategory: "MYSTERY", ...common });
  assert.equal(selectWinner([unknown, known])?.id, "known"); // known rank 2 beats unknown rank 99
  const u1 = sig({ id: "aaa", sourceCategory: "MYSTERY", ...common });
  const u2 = sig({ id: "bbb", sourceCategory: "MYSTERY", ...common });
  assert.equal(selectWinner([u2, u1])?.id, "aaa"); // both rank 99 → id tiebreak
});

test("determinism — comparator is a strict total order (no zero except identity)", () => {
  const a = sig({ id: "x", asOf: "2026-06-01", confidence: 0.5, sourceCategory: "PUBLIC" });
  const b = sig({ id: "y", asOf: "2026-06-01", confidence: 0.5, sourceCategory: "PUBLIC" });
  assert.ok(compareSignals(a, b) < 0 && compareSignals(b, a) > 0);
  assert.equal(compareSignals(a, a), 0);
});
