import { test } from "node:test";
import assert from "node:assert/strict";

import {
  isTerminalAssignmentStatus,
  isValidAssignmentTransition,
  canExecuteFrom,
  buildAssignmentExecutionSnapshot,
  assignmentStatusLabel,
  assignmentStatusTone,
  TERMINAL_ASSIGNMENT_STATUSES,
  type AssignmentSnapshotSource,
} from "../../../lib/assignment";

// --- terminal classification (AS-4) ------------------------------------------
test("terminal statuses are exactly EXECUTED/CANCELLED", () => {
  assert.deepEqual([...TERMINAL_ASSIGNMENT_STATUSES].sort(), ["CANCELLED", "EXECUTED"]);
  for (const s of ["EXECUTED", "CANCELLED"] as const) assert.equal(isTerminalAssignmentStatus(s), true);
  for (const s of ["NOT_STARTED", "DRAFTED"] as const) assert.equal(isTerminalAssignmentStatus(s), false);
});

// --- transition guard (AS-B/AS-9) --------------------------------------------
test("the happy-path lifecycle edges are legal", () => {
  assert.equal(isValidAssignmentTransition("NOT_STARTED", "DRAFTED"), true);
  assert.equal(isValidAssignmentTransition("DRAFTED", "EXECUTED"), true);
});

test("CANCELLED off-ramp is reachable from either active state", () => {
  assert.equal(isValidAssignmentTransition("NOT_STARTED", "CANCELLED"), true);
  assert.equal(isValidAssignmentTransition("DRAFTED", "CANCELLED"), true);
});

test("execution requires a drafted agreement first (AS-B)", () => {
  // EXECUTED is reachable ONLY from DRAFTED — never straight from NOT_STARTED.
  assert.equal(isValidAssignmentTransition("NOT_STARTED", "EXECUTED"), false);
  assert.equal(canExecuteFrom("DRAFTED"), true);
  assert.equal(canExecuteFrom("NOT_STARTED"), false);
  assert.equal(canExecuteFrom("EXECUTED"), false);
  assert.equal(canExecuteFrom("CANCELLED"), false);
});

test("a terminal status is frozen — no outgoing transition (AS-4)", () => {
  for (const from of ["EXECUTED", "CANCELLED"] as const) {
    for (const to of ["NOT_STARTED", "DRAFTED", "EXECUTED", "CANCELLED"] as const) {
      assert.equal(isValidAssignmentTransition(from, to), false, `${from} -> ${to}`);
    }
  }
});

test("no-op / backward transitions are rejected", () => {
  assert.equal(isValidAssignmentTransition("NOT_STARTED", "NOT_STARTED"), false);
  assert.equal(isValidAssignmentTransition("DRAFTED", "DRAFTED"), false);
  assert.equal(isValidAssignmentTransition("DRAFTED", "NOT_STARTED"), false);
});

test("an unknown source status is total-safe — no edges, never throws (AS-9)", () => {
  // The guard must be total: a status outside the enum has no allowed edges (the `?.`/`?? false`
  // nullish path), rather than crashing on an undefined transition list.
  assert.equal(isValidAssignmentTransition("BOGUS" as never, "DRAFTED"), false);
  assert.equal(canExecuteFrom("BOGUS" as never), false);
});

// --- execution snapshot builder (AS-D/AS-H) ----------------------------------
test("buildAssignmentExecutionSnapshot copies fee/value/parties/doc at execution time", () => {
  const source: AssignmentSnapshotSource = {
    assignmentFeeUsd: 45_000,
    contractValueUsd: 1_200_000,
    assignorName: "Jane Seller",
    assigneeName: "Acme Capital LLC",
    agreementDocumentId: "doc_exec",
  };
  assert.deepEqual(buildAssignmentExecutionSnapshot(source), {
    executedFeeUsdSnapshot: 45_000,
    executedContractValueUsdSnapshot: 1_200_000,
    executedAssignorNameSnapshot: "Jane Seller",
    executedAssigneeNameSnapshot: "Acme Capital LLC",
    executedAgreementDocumentIdSnapshot: "doc_exec",
  });
});

test("buildAssignmentExecutionSnapshot preserves nulls without substituting defaults", () => {
  const snap = buildAssignmentExecutionSnapshot({
    assignmentFeeUsd: null,
    contractValueUsd: null,
    assignorName: null,
    assigneeName: null,
    agreementDocumentId: null,
  });
  assert.deepEqual(snap, {
    executedFeeUsdSnapshot: null,
    executedContractValueUsdSnapshot: null,
    executedAssignorNameSnapshot: null,
    executedAssigneeNameSnapshot: null,
    executedAgreementDocumentIdSnapshot: null,
  });
});

test("a zero fee is captured as 0, not coerced to null", () => {
  const snap = buildAssignmentExecutionSnapshot({
    assignmentFeeUsd: 0,
    contractValueUsd: 0,
    assignorName: "A",
    assigneeName: "B",
    agreementDocumentId: null,
  });
  assert.equal(snap.executedFeeUsdSnapshot, 0);
  assert.equal(snap.executedContractValueUsdSnapshot, 0);
});

// --- display helpers ----------------------------------------------------------
test("status labels and tones cover every status", () => {
  assert.equal(assignmentStatusLabel("NOT_STARTED"), "Not started");
  assert.equal(assignmentStatusLabel("DRAFTED"), "Drafted");
  assert.equal(assignmentStatusLabel("EXECUTED"), "Executed");
  assert.equal(assignmentStatusLabel("CANCELLED"), "Cancelled");
  assert.equal(assignmentStatusLabel("weird"), "weird");

  assert.equal(assignmentStatusTone("EXECUTED"), "success");
  assert.equal(assignmentStatusTone("DRAFTED"), "info");
  assert.equal(assignmentStatusTone("CANCELLED"), "warning");
  assert.equal(assignmentStatusTone("NOT_STARTED"), "neutral");
  assert.equal(assignmentStatusTone("weird"), "neutral");
});
