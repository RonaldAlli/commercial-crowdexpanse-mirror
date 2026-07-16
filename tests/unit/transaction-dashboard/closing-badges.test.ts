import { test } from "node:test";
import assert from "node:assert/strict";

import { closingProgress, blockingItems, type GateItem } from "../../../lib/closing";
import {
  projectClosingBadges,
  isClosingRelevantStage,
  type ClosingBadgeInput,
} from "../../../lib/transaction-dashboard";

const req = (status: GateItem["status"]): GateItem => ({ required: true, status });
const opt = (status: GateItem["status"]): GateItem => ({ required: false, status });

function input(over: Partial<ClosingBadgeInput> = {}): ClosingBadgeInput {
  return { stage: "UNDER_CONTRACT", checklistItems: null, escrow: null, financing: null, assignment: null, ...over };
}

// --- LB-9 stage-aware visibility ---------------------------------------------------------------

test("isClosingRelevantStage: at or beyond UNDER_CONTRACT", () => {
  for (const s of ["UNDER_CONTRACT", "BUYER_MATCHED", "CLOSING", "PAID"] as const) assert.equal(isClosingRelevantStage(s), true);
  for (const s of ["LEAD", "UNDERWRITING", "OFFER_READY", "LOI_SENT"] as const) assert.equal(isClosingRelevantStage(s), false);
});

test("an early-stage deal with no closing activity is NOT visible (stays quiet)", () => {
  const b = projectClosingBadges(input({ stage: "LEAD" }));
  assert.equal(b.visible, false);
  assert.equal(b.checklistStarted, false);
  assert.equal(b.readiness, null);
});

test("an early-stage deal WITH a closing record IS visible (activity overrides stage)", () => {
  const b = projectClosingBadges(input({ stage: "LOI_SENT", escrow: { status: "OPENED" } }));
  assert.equal(b.visible, true);
  assert.ok(b.escrow);
});

test("a closing-relevant stage WITHOUT a checklist → visible + 'Closing not started' signal", () => {
  const b = projectClosingBadges(input({ stage: "UNDER_CONTRACT", checklistItems: null }));
  assert.equal(b.visible, true);
  assert.equal(b.checklistStarted, false);
  assert.equal(b.readiness, null); // UI renders "Closing not started"
});

test("PAID is visible and marked closed", () => {
  const b = projectClosingBadges(input({ stage: "PAID" }));
  assert.equal(b.visible, true);
  assert.equal(b.closed, true);
});

// --- readiness (reuses the authoritative helpers, TX-6) ---------------------------------------

test("a fully-satisfied required checklist → ready, 0 blockers", () => {
  const items = [req("COMPLETE"), req("WAIVED"), opt("PENDING")];
  const b = projectClosingBadges(input({ checklistItems: items }));
  assert.equal(b.checklistStarted, true);
  assert.deepEqual(b.readiness, { ready: true, blockerCount: 0 });
});

test("outstanding required items → not ready, correct blocker count", () => {
  const items = [req("COMPLETE"), req("PENDING"), req("PENDING"), opt("PENDING")];
  const b = projectClosingBadges(input({ checklistItems: items }));
  assert.equal(b.readiness?.ready, false);
  assert.equal(b.readiness?.blockerCount, 2); // only the required PENDING items block
});

test("readiness equals the authoritative closingProgress/blockingItems (no forked logic)", () => {
  const items = [req("COMPLETE"), req("PENDING"), opt("PENDING"), req("WAIVED"), req("PENDING")];
  const b = projectClosingBadges(input({ checklistItems: items }));
  assert.equal(b.readiness?.ready, closingProgress(items).ready);
  assert.equal(b.readiness?.blockerCount, blockingItems(items).length);
});

// --- LB-14: the readiness chip (label + tone) is produced by the projection, not the UI --------

test("the closing chip carries label + tone for every readiness state", () => {
  // Not started → neutral "Closing not started".
  assert.deepEqual(projectClosingBadges(input({ stage: "UNDER_CONTRACT", checklistItems: null })).closing, {
    label: "Closing not started",
    tone: "neutral",
  });
  // Ready → success "Ready".
  assert.deepEqual(projectClosingBadges(input({ checklistItems: [req("COMPLETE")] })).closing, { label: "Ready", tone: "success" });
  // One blocker → danger, singular.
  assert.deepEqual(projectClosingBadges(input({ checklistItems: [req("PENDING")] })).closing, { label: "1 blocker", tone: "danger" });
  // Multiple blockers → danger, plural.
  assert.deepEqual(projectClosingBadges(input({ checklistItems: [req("PENDING"), req("PENDING"), req("PENDING")] })).closing, {
    label: "3 blockers",
    tone: "danger",
  });
});

// --- domain chips (present / absent / labels + tones) -----------------------------------------

test("present domain records project labeled + toned chips", () => {
  const b = projectClosingBadges(input({ escrow: { status: "DEPOSITED" }, financing: { status: "COMMITTED" }, assignment: { status: "DRAFTED" } }));
  assert.equal(b.escrow?.label, "Deposited");
  assert.equal(b.escrow?.tone, "success");
  assert.ok(b.financing?.label && b.financing.tone);
  assert.ok(b.assignment?.label && b.assignment.tone);
});

test("missing domain records degrade to null chips, never an error (LB-4/LB-12)", () => {
  const b = projectClosingBadges(input({ stage: "CLOSING", escrow: null, financing: null, assignment: null }));
  assert.equal(b.escrow, null);
  assert.equal(b.financing, null);
  assert.equal(b.assignment, null);
  assert.equal(b.visible, true); // still visible by stage — a missing record never removes the deal
});

// --- purity ------------------------------------------------------------------------------------

test("projectClosingBadges never mutates its input", () => {
  const items = [req("PENDING"), req("COMPLETE")];
  const inp = input({ checklistItems: items, escrow: { status: "OPENED" } });
  const snapshotItems = items.map((i) => ({ ...i }));
  projectClosingBadges(inp);
  assert.deepEqual(items, snapshotItems);
  assert.equal(inp.escrow?.status, "OPENED");
});
