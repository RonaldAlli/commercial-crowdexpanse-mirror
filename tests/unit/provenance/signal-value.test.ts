import { test } from "node:test";
import assert from "node:assert/strict";

import {
  LEDGER_SCHEMA_VERSION,
  NORMALIZATION_VERSION,
  PROJECTION_VERSION,
  valueEnvelope,
} from "../../../lib/intelligence/signal-value";

test("version stamps are positive integers", () => {
  for (const v of [LEDGER_SCHEMA_VERSION, NORMALIZATION_VERSION, PROJECTION_VERSION]) {
    assert.equal(Number.isInteger(v), true);
    assert.ok(v >= 1);
  }
});

test("valueEnvelope tags a string value and carries the normalized form", () => {
  assert.deepEqual(valueEnvelope("Smith Holdings LLC", "SMITH HOLDINGS LLC"), {
    valueType: "string",
    valueRaw: "Smith Holdings LLC",
    valueNormalized: "SMITH HOLDINGS LLC",
  });
});

test("valueEnvelope defaults normalized to null when omitted", () => {
  assert.deepEqual(valueEnvelope("LLC"), { valueType: "string", valueRaw: "LLC", valueNormalized: null });
});
