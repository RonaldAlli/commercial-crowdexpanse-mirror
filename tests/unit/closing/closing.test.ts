import { test } from "node:test";
import assert from "node:assert/strict";

import {
  isClosingReady,
  blockingItems,
  closingBlockMessage,
  closingProgress,
  closingReadinessSummary,
  isValidStatusTransition,
  DEFAULT_CLOSING_TEMPLATE,
  type GateItem,
} from "../../../lib/closing";

const item = (required: boolean, status: GateItem["status"]): GateItem => ({ required, status });
const labeled = (label: string, required: boolean, status: GateItem["status"]) => ({ label, required, status });

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

// --- explanatory block message (refinement: explain why PAID is blocked) -----
test("closingBlockMessage is null when nothing required is outstanding (ready)", () => {
  assert.equal(closingBlockMessage([]), null);
  assert.equal(closingBlockMessage([labeled("Title", true, "COMPLETE"), labeled("Env", false, "PENDING")]), null);
});

test("closingBlockMessage lists exactly the outstanding required item labels", () => {
  const msg = closingBlockMessage([
    labeled("Title search", true, "PENDING"),
    labeled("Inspection", true, "COMPLETE"),
    labeled("Financials", true, "PENDING"),
    labeled("Environmental", false, "PENDING"), // optional — never listed
  ]);
  assert.equal(msg, "Cannot move to Paid — 2 required items outstanding: Title search, Financials");
});

test("closingBlockMessage uses the singular noun for a single outstanding item", () => {
  const msg = closingBlockMessage([labeled("Legal review", true, "PENDING")]);
  assert.equal(msg, "Cannot move to Paid — 1 required item outstanding: Legal review");
});

// --- Closing Center readiness header (v1.4, Option C) ------------------------
// The accordion container's persistent header renders EXACTLY this summary, which is a
// pure composition of closingProgress + blockingItems + closingBlockMessage — never a
// second readiness calculation. These tests pin that equivalence so the header can never
// disagree with the PAID gate.
test("closingReadinessSummary composes the authoritative helpers (not-ready case)", () => {
  const items = [
    labeled("Title", true, "PENDING"),
    labeled("Inspection", true, "COMPLETE"),
    labeled("Legal", true, "WAIVED"),
    labeled("Env", false, "PENDING"),
  ];
  const s = closingReadinessSummary(items);
  const progress = closingProgress(items);
  // Numbers are exactly closingProgress's — no independent recount.
  assert.equal(s.ready, progress.ready);
  assert.equal(s.requiredTotal, progress.requiredTotal);
  assert.equal(s.requiredSatisfied, progress.requiredSatisfied);
  assert.equal(s.ready, false);
  assert.equal(s.requiredTotal, 3);
  assert.equal(s.requiredSatisfied, 2);
  // Outstanding count == blockingItems length; message == closingBlockMessage (same source).
  assert.equal(s.outstandingCount, blockingItems(items).length);
  assert.equal(s.outstandingCount, 1);
  assert.equal(s.blockMessage, closingBlockMessage(items));
  assert.ok(s.blockMessage && s.blockMessage.includes("Title"));
});

test("closingReadinessSummary reports ready with a null message when all required are satisfied", () => {
  const items = [labeled("Title", true, "COMPLETE"), labeled("Env", false, "PENDING")];
  const s = closingReadinessSummary(items);
  assert.equal(s.ready, true);
  assert.equal(s.outstandingCount, 0);
  assert.equal(s.blockMessage, null);
  assert.equal(s.blockMessage, closingBlockMessage(items));
});

test("closingReadinessSummary on an empty checklist is ready/zero (empty-state header)", () => {
  const s = closingReadinessSummary([]);
  assert.deepEqual(s, { ready: true, requiredTotal: 0, requiredSatisfied: 0, outstandingCount: 0, blockMessage: null });
});

// --- transition guard (CC-5) -------------------------------------------------
test("a required item cannot be marked NOT_APPLICABLE (must be WAIVED instead)", () => {
  assert.equal(isValidStatusTransition(true, "NOT_APPLICABLE"), false);
  assert.equal(isValidStatusTransition(false, "NOT_APPLICABLE"), true);
  assert.equal(isValidStatusTransition(true, "COMPLETE"), true);
  assert.equal(isValidStatusTransition(true, "WAIVED"), true);
  assert.equal(isValidStatusTransition(true, "PENDING"), true);
});

// --- default template data (CC-G / AS-J) -------------------------------------
test("the default template ships Due Diligence items plus one required Assignment item", () => {
  assert.ok(DEFAULT_CLOSING_TEMPLATE.items.length > 0);
  // Slice 1 seeded DUE_DILIGENCE; Slice 4 (AS-J) adds exactly one required ASSIGNMENT item.
  assert.ok(DEFAULT_CLOSING_TEMPLATE.items.every((i) => ["DUE_DILIGENCE", "ASSIGNMENT"].includes(i.category)));
  const assignmentItems = DEFAULT_CLOSING_TEMPLATE.items.filter((i) => i.category === "ASSIGNMENT");
  assert.equal(assignmentItems.length, 1, "exactly one seeded ASSIGNMENT item (AS-J)");
  assert.ok(assignmentItems[0].required, "the seeded assignment item gates PAID (required)");
  assert.equal(assignmentItems[0].completionEvidenceType, "DOCUMENT", "its evidence is the executed agreement Document");
  assert.ok(DEFAULT_CLOSING_TEMPLATE.items.some((i) => i.required));
  assert.ok(DEFAULT_CLOSING_TEMPLATE.items.every((i) => ["NONE", "DOCUMENT", "TASK", "MANUAL"].includes(i.completionEvidenceType)));
});
