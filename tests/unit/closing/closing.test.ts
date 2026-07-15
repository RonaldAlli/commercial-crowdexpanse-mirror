import { test } from "node:test";
import assert from "node:assert/strict";

import {
  isClosingReady,
  blockingItems,
  closingProgress,
  isValidStatusTransition,
  DEFAULT_CLOSING_TEMPLATE,
  type GateItem,
} from "../../../lib/closing";

const item = (required: boolean, status: GateItem["status"]): GateItem => ({ required, status });

// --- the gate predicate (CC-2/CC-C) ------------------------------------------
test("an empty checklist is ready (nothing required blocks)", () => {
  assert.equal(isClosingReady([]), true);
});

test("a required PENDING item blocks the gate", () => {
  assert.equal(isClosingReady([item(true, "PENDING")]), false);
});

test("required items satisfy the gate when COMPLETE or WAIVED", () => {
  assert.equal(isClosingReady([item(true, "COMPLETE"), item(true, "WAIVED")]), true);
});

test("non-required items never block, whatever their status", () => {
  assert.equal(isClosingReady([item(false, "PENDING"), item(false, "NOT_APPLICABLE"), item(true, "COMPLETE")]), true);
});

test("a required NOT_APPLICABLE item still blocks (N/A is not a valid satisfy for required — use WAIVE)", () => {
  assert.equal(isClosingReady([item(true, "NOT_APPLICABLE")]), false);
});

test("one unsatisfied required item among satisfied ones blocks", () => {
  assert.equal(isClosingReady([item(true, "COMPLETE"), item(true, "PENDING"), item(false, "PENDING")]), false);
});

// --- blocking items + progress -----------------------------------------------
test("blockingItems returns only the unsatisfied required items", () => {
  const items = [item(true, "COMPLETE"), item(true, "PENDING"), item(false, "PENDING"), item(true, "WAIVED")];
  const blocked = blockingItems(items);
  assert.equal(blocked.length, 1);
  assert.equal(blocked[0].status, "PENDING");
  assert.equal(blocked[0].required, true);
});

test("closingProgress counts required satisfaction and readiness", () => {
  const items = [item(true, "COMPLETE"), item(true, "WAIVED"), item(true, "PENDING"), item(false, "PENDING")];
  assert.deepEqual(closingProgress(items), { requiredTotal: 3, requiredSatisfied: 2, ready: false });

  const done = [item(true, "COMPLETE"), item(false, "PENDING")];
  assert.deepEqual(closingProgress(done), { requiredTotal: 1, requiredSatisfied: 1, ready: true });
});

// --- transition guard (CC-5) -------------------------------------------------
test("a required item cannot be marked NOT_APPLICABLE (must be WAIVED instead)", () => {
  assert.equal(isValidStatusTransition(true, "NOT_APPLICABLE"), false);
  assert.equal(isValidStatusTransition(false, "NOT_APPLICABLE"), true);
  assert.equal(isValidStatusTransition(true, "COMPLETE"), true);
  assert.equal(isValidStatusTransition(true, "WAIVED"), true);
  assert.equal(isValidStatusTransition(true, "PENDING"), true);
});

// --- default template data (CC-G) --------------------------------------------
test("the default template ships Due Diligence items with declared evidence types", () => {
  assert.ok(DEFAULT_CLOSING_TEMPLATE.items.length > 0);
  assert.ok(DEFAULT_CLOSING_TEMPLATE.items.every((i) => i.category === "DUE_DILIGENCE"));
  assert.ok(DEFAULT_CLOSING_TEMPLATE.items.some((i) => i.required));
  assert.ok(DEFAULT_CLOSING_TEMPLATE.items.every((i) => ["NONE", "DOCUMENT", "TASK", "MANUAL"].includes(i.completionEvidenceType)));
});
