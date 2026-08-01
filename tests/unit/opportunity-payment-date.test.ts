import { test } from "node:test";
import assert from "node:assert/strict";

import { effectiveExpectedPaymentDate } from "../../lib/opportunity-payment-date";

const CLOSE = new Date("2026-09-01T00:00:00.000Z");
const EXPLICIT = new Date("2026-09-20T00:00:00.000Z");

test("explicit value wins and is reported as the owned source (FD-2)", () => {
  const v = effectiveExpectedPaymentDate({ expectedPaymentDate: EXPLICIT, targetCloseDate: CLOSE });
  assert.deepEqual(v.effective, EXPLICIT);
  assert.equal(v.source, "explicit");
});

test("derived default = targetCloseDate when no explicit value", () => {
  const v = effectiveExpectedPaymentDate({ expectedPaymentDate: null, targetCloseDate: CLOSE });
  assert.deepEqual(v.effective, CLOSE);
  assert.equal(v.source, "derived");
});

test("no basis at all → none (honest, never fabricated)", () => {
  const v = effectiveExpectedPaymentDate({ expectedPaymentDate: null, targetCloseDate: null });
  assert.equal(v.effective, null);
  assert.equal(v.source, "none");
});

test("clearing the explicit value reverts to the derived default", () => {
  // (service sets expectedPaymentDate = null) → resolver falls back to targetCloseDate
  const v = effectiveExpectedPaymentDate({ expectedPaymentDate: null, targetCloseDate: CLOSE });
  assert.equal(v.source, "derived");
});
