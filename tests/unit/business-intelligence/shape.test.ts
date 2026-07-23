import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizeKey, rate, orderByValueThenKey } from "../../../lib/business-intelligence/shape";
import { UNKNOWN } from "../../../lib/business-intelligence/types";

test("normalizeKey: null/empty → UNKNOWN, real values pass through", () => {
  assert.equal(normalizeKey(null), UNKNOWN);
  assert.equal(normalizeKey(undefined), UNKNOWN);
  assert.equal(normalizeKey(""), UNKNOWN);
  assert.equal(normalizeKey("OWNER_DIRECT"), "OWNER_DIRECT");
});

test("rate: zero denominator → null (not measurable, not zero performance)", () => {
  assert.equal(rate(0, 0), null);
  assert.equal(rate(5, 0), null);
});

test("rate: normal ratios; zero numerator over a real population is 0, not null", () => {
  assert.equal(rate(3, 10), 0.3);
  assert.equal(rate(0, 5), 0);
  assert.equal(rate(5, 5), 1);
});

test("orderByValueThenKey: highest value first, key asc on ties, nulls LAST", () => {
  const rows = [
    { k: "b", v: 100 },
    { k: "a", v: 100 },
    { k: "c", v: 500 },
    { k: "z", v: null as number | null },
    { k: "y", v: null as number | null },
  ];
  const sorted = orderByValueThenKey(rows, (r) => r.v, (r) => r.k);
  assert.deepEqual(
    sorted.map((r) => r.k),
    ["c", "a", "b", "y", "z"], // 500 first; tie 100 → a before b; nulls last, y before z
  );
});

test("orderByValueThenKey does not mutate the input", () => {
  const rows = [{ k: "a", v: 1 }, { k: "b", v: 2 }];
  const copy = [...rows];
  orderByValueThenKey(rows, (r) => r.v, (r) => r.k);
  assert.deepEqual(rows, copy);
});
