import { test } from "node:test";
import assert from "node:assert/strict";

import { computeFingerprint, findDuplicatePairs, pairKey, type DuplicateOwnerInput } from "../../../lib/intelligence/owner-duplicates";

const o = (id: string, matchKey: string, aliases: string[] = []): DuplicateOwnerInput => ({ id, matchKey, aliasNormalizedValues: aliases });

test("pairKey is order-independent (canonical unordered pair)", () => {
  assert.deepEqual(pairKey("a", "b"), ["a", "b"]);
  assert.deepEqual(pairKey("b", "a"), ["a", "b"]);
});

test("computeFingerprint is order-independent and deterministic", () => {
  const a = { matchKey: "ACME LLC", aliasNormalizedValues: ["ACME"] };
  const b = { matchKey: "ACME HOLDINGS", aliasNormalizedValues: ["ACME CO"] };
  assert.equal(computeFingerprint(a, b), computeFingerprint(b, a));
});

test("computeFingerprint changes when matchKey changes (material change)", () => {
  const a = { matchKey: "ACME LLC", aliasNormalizedValues: [] };
  const b = { matchKey: "ACME HOLDINGS", aliasNormalizedValues: [] };
  const before = computeFingerprint(a, b);
  const after = computeFingerprint({ ...a, matchKey: "ACME GROUP LLC" }, b);
  assert.notEqual(before, after);
});

test("computeFingerprint changes when an alias changes (material change)", () => {
  const a = { matchKey: "ACME LLC", aliasNormalizedValues: ["ACME"] };
  const b = { matchKey: "OTHER LLC", aliasNormalizedValues: [] };
  const before = computeFingerprint(a, b);
  const after = computeFingerprint({ ...a, aliasNormalizedValues: ["ACME", "ACME CORP"] }, b);
  assert.notEqual(before, after);
});

test("exact matchKey → one canonical pair at 0.9", () => {
  const pairs = findDuplicatePairs([o("b1", "RIVERSTONE LLC"), o("a1", "RIVERSTONE LLC")]);
  assert.equal(pairs.length, 1);
  assert.deepEqual([pairs[0].ownerIdA, pairs[0].ownerIdB], ["a1", "b1"]);
  assert.equal(pairs[0].reason, "exact-match-key");
  assert.equal(pairs[0].identityConfidence, 0.9);
});

test("three owners with the same matchKey → all three pairs", () => {
  const pairs = findDuplicatePairs([o("a", "X"), o("b", "X"), o("c", "X")]);
  assert.equal(pairs.length, 3);
});

test("alias overlap: one owner's matchKey is the other's alias → 0.6", () => {
  const pairs = findDuplicatePairs([o("a", "ACME LLC", []), o("b", "ACME HOLDINGS", ["ACME LLC"])]);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].reason, "alias-match");
  assert.equal(pairs[0].identityConfidence, 0.6);
});

test("alias overlap: a shared normalized alias", () => {
  const pairs = findDuplicatePairs([o("a", "AAA", ["SHARED"]), o("b", "BBB", ["SHARED"])]);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].reason, "alias-match");
});

test("a pair found by BOTH reasons keeps the stronger (exact) reason", () => {
  // same matchKey AND a shared alias
  const pairs = findDuplicatePairs([o("a", "X", ["SHARED"]), o("b", "X", ["SHARED"])]);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].reason, "exact-match-key");
  assert.equal(pairs[0].identityConfidence, 0.9);
});

test("distinct owners with no overlap → no pairs, and no self-pairs", () => {
  assert.deepEqual(findDuplicatePairs([o("a", "AAA"), o("b", "BBB")]), []);
  assert.deepEqual(findDuplicatePairs([o("a", "AAA")]), []);
});

test("output is deterministic (sorted by canonical pair)", () => {
  const pairs = findDuplicatePairs([o("z", "X"), o("m", "X"), o("a", "X")]);
  const keys = pairs.map((p) => `${p.ownerIdA}|${p.ownerIdB}`);
  assert.deepEqual(keys, [...keys].sort());
});
