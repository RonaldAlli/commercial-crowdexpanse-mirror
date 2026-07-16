import { test } from "node:test";
import assert from "node:assert/strict";

import {
  isTerminalFinancingStatus,
  isValidFinancingTransition,
  buildFinancingSnapshot,
  financingStatusLabel,
  financingStatusTone,
  TERMINAL_FINANCING_STATUSES,
} from "../../../lib/financing";

// --- terminal classification (FC-6) ------------------------------------------
test("terminal statuses are exactly FUNDED/DENIED/WITHDRAWN", () => {
  assert.deepEqual([...TERMINAL_FINANCING_STATUSES].sort(), ["DENIED", "FUNDED", "WITHDRAWN"]);
  for (const s of ["FUNDED", "DENIED", "WITHDRAWN"] as const) assert.equal(isTerminalFinancingStatus(s), true);
  for (const s of ["NOT_STARTED", "APPLIED", "COMMITTED", "CLEARED"] as const) assert.equal(isTerminalFinancingStatus(s), false);
});

// --- transition guard (FC-B/FC-10) -------------------------------------------
test("the happy-path lifecycle edges are legal", () => {
  assert.equal(isValidFinancingTransition("NOT_STARTED", "APPLIED"), true);
  assert.equal(isValidFinancingTransition("APPLIED", "COMMITTED"), true);
  assert.equal(isValidFinancingTransition("COMMITTED", "CLEARED"), true);
  assert.equal(isValidFinancingTransition("CLEARED", "FUNDED"), true);
});

test("DENIED/WITHDRAWN off-ramps are reachable from active non-terminal states", () => {
  assert.equal(isValidFinancingTransition("NOT_STARTED", "WITHDRAWN"), true);
  assert.equal(isValidFinancingTransition("APPLIED", "DENIED"), true);
  assert.equal(isValidFinancingTransition("COMMITTED", "WITHDRAWN"), true);
  assert.equal(isValidFinancingTransition("CLEARED", "DENIED"), true);
  // DENIED is not reachable from NOT_STARTED (nothing applied yet).
  assert.equal(isValidFinancingTransition("NOT_STARTED", "DENIED"), false);
});

test("skipping stages is rejected", () => {
  assert.equal(isValidFinancingTransition("NOT_STARTED", "COMMITTED"), false);
  assert.equal(isValidFinancingTransition("APPLIED", "CLEARED"), false);
  assert.equal(isValidFinancingTransition("COMMITTED", "FUNDED"), false);
});

test("a terminal status is frozen — no outgoing transition (FC-6)", () => {
  for (const from of ["FUNDED", "DENIED", "WITHDRAWN"] as const) {
    for (const to of ["APPLIED", "COMMITTED", "CLEARED", "FUNDED", "DENIED", "WITHDRAWN", "NOT_STARTED"] as const) {
      assert.equal(isValidFinancingTransition(from, to), false, `${from} -> ${to}`);
    }
  }
});

test("no-op / backward transitions are rejected", () => {
  assert.equal(isValidFinancingTransition("APPLIED", "APPLIED"), false);
  assert.equal(isValidFinancingTransition("COMMITTED", "APPLIED"), false);
  assert.equal(isValidFinancingTransition("CLEARED", "COMMITTED"), false);
});

// --- FC-J snapshot builder ---------------------------------------------------
test("buildFinancingSnapshot copies lender + commitment + appraisal at resolution time", () => {
  const snap = buildFinancingSnapshot(
    { lenderName: "Acme Bank", commitmentLetterDocumentId: "doc_c", appraisalDocumentId: "doc_a" },
    "user_1",
    "Loan funded at closing",
  );
  assert.deepEqual(snap, {
    resolutionLenderNameSnapshot: "Acme Bank",
    resolutionCommitmentDocumentIdSnapshot: "doc_c",
    resolutionAppraisalDocumentIdSnapshot: "doc_a",
    resolvedById: "user_1",
    resolutionReason: "Loan funded at closing",
  });
});

test("buildFinancingSnapshot trims a reason and nulls a blank/absent one; preserves null fields", () => {
  const blank = buildFinancingSnapshot({ lenderName: null, commitmentLetterDocumentId: null, appraisalDocumentId: null }, "u2", "   ");
  assert.equal(blank.resolutionReason, null);
  assert.equal(blank.resolutionLenderNameSnapshot, null);
  assert.equal(blank.resolutionCommitmentDocumentIdSnapshot, null);
  assert.equal(blank.resolutionAppraisalDocumentIdSnapshot, null);

  assert.equal(buildFinancingSnapshot({ lenderName: "X", commitmentLetterDocumentId: null, appraisalDocumentId: null }, "u3", "  denied  ").resolutionReason, "denied");
  assert.equal(buildFinancingSnapshot({ lenderName: "X", commitmentLetterDocumentId: null, appraisalDocumentId: null }, "u4", null).resolutionReason, null);
});

// --- display helpers ----------------------------------------------------------
test("status labels and tones cover every status", () => {
  assert.equal(financingStatusLabel("NOT_STARTED"), "Not started");
  assert.equal(financingStatusLabel("CLEARED"), "Clear to close");
  assert.equal(financingStatusLabel("WITHDRAWN"), "Withdrawn");
  assert.equal(financingStatusLabel("weird"), "weird");
  assert.equal(financingStatusTone("FUNDED"), "success");
  assert.equal(financingStatusTone("CLEARED"), "success");
  assert.equal(financingStatusTone("COMMITTED"), "info");
  assert.equal(financingStatusTone("APPLIED"), "info");
  assert.equal(financingStatusTone("DENIED"), "danger");
  assert.equal(financingStatusTone("WITHDRAWN"), "warning");
  assert.equal(financingStatusTone("NOT_STARTED"), "neutral");
});
