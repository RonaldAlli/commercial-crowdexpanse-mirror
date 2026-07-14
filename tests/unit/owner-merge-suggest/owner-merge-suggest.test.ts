import { test } from "node:test";
import assert from "node:assert/strict";

import { suggestWinner, type MergeSuggestInput } from "../../../lib/intelligence/owner-merge-suggest";

const o = (id: string, sellerCount: number, propertyCount: number, createdAt: string): MergeSuggestInput => ({
  id,
  sellerCount,
  propertyCount,
  createdAt: new Date(createdAt),
});

test("greater total linked-record count wins", () => {
  const a = o("a", 2, 3, "2026-01-01"); // total 5
  const b = o("b", 1, 1, "2020-01-01"); // total 2 (older, but fewer links)
  const s = suggestWinner(a, b);
  assert.equal(s.winnerId, "a");
  assert.equal(s.loserId, "b");
  assert.match(s.reason, /More linked records \(5 vs 2\)/);
});

test("on a linked-count tie, the older record wins", () => {
  const a = o("a", 1, 1, "2026-05-01"); // total 2, newer
  const b = o("b", 0, 2, "2024-05-01"); // total 2, older
  const s = suggestWinner(a, b);
  assert.equal(s.winnerId, "b");
  assert.equal(s.loserId, "a");
  assert.match(s.reason, /older record kept/);
});

test("on a linked-count tie, when the first argument is the older one it wins", () => {
  const a = o("a", 2, 0, "2023-01-01"); // total 2, older
  const b = o("b", 1, 1, "2026-01-01"); // total 2, newer
  const s = suggestWinner(a, b);
  assert.equal(s.winnerId, "a");
  assert.equal(s.loserId, "b");
});

test("on a count AND age tie, the lexicographically smaller id wins", () => {
  const a = o("zzz", 1, 0, "2025-01-01T00:00:00.000Z");
  const b = o("aaa", 0, 1, "2025-01-01T00:00:00.000Z");
  const s = suggestWinner(a, b);
  assert.equal(s.winnerId, "aaa");
  assert.equal(s.loserId, "zzz");
  assert.match(s.reason, /stable id order/);
});

test("suggestion is symmetric — argument order does not change the winner", () => {
  const a = o("a", 3, 0, "2026-01-01");
  const b = o("b", 1, 1, "2020-01-01");
  const s1 = suggestWinner(a, b);
  const s2 = suggestWinner(b, a);
  assert.equal(s1.winnerId, s2.winnerId);
  assert.equal(s1.loserId, s2.loserId);
});

test("provider-neutral: external identifiers are not part of the input and never influence the winner", () => {
  // Two owners identical on every counted dimension → decided purely by id order,
  // regardless of any external/provider evidence (which is intentionally absent).
  const a = o("owner-1", 0, 0, "2025-01-01T00:00:00.000Z");
  const b = o("owner-2", 0, 0, "2025-01-01T00:00:00.000Z");
  assert.equal(suggestWinner(a, b).winnerId, "owner-1");
});
