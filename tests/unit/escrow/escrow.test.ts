import { test } from "node:test";
import assert from "node:assert/strict";

import {
  isTerminalEscrowStatus,
  isValidEscrowTransition,
  escrowEventTypeFor,
  buildEscrowSnapshot,
  escrowStatusLabel,
  escrowStatusTone,
  TERMINAL_ESCROW_STATUSES,
} from "../../../lib/escrow";

// --- terminal classification (EC-11) -----------------------------------------
test("terminal statuses are exactly RELEASED/REFUNDED/FORFEITED", () => {
  assert.deepEqual([...TERMINAL_ESCROW_STATUSES].sort(), ["FORFEITED", "REFUNDED", "RELEASED"]);
  for (const s of ["RELEASED", "REFUNDED", "FORFEITED"] as const) assert.equal(isTerminalEscrowStatus(s), true);
  for (const s of ["NOT_OPENED", "OPENED", "DEPOSITED"] as const) assert.equal(isTerminalEscrowStatus(s), false);
});

// --- transition guard (EC-B/EC-8) --------------------------------------------
test("the only legal forward transitions are the lifecycle edges", () => {
  assert.equal(isValidEscrowTransition("NOT_OPENED", "OPENED"), true);
  assert.equal(isValidEscrowTransition("OPENED", "DEPOSITED"), true);
  assert.equal(isValidEscrowTransition("DEPOSITED", "RELEASED"), true);
  assert.equal(isValidEscrowTransition("DEPOSITED", "REFUNDED"), true);
  assert.equal(isValidEscrowTransition("DEPOSITED", "FORFEITED"), true);
});

test("skipping stages is rejected", () => {
  assert.equal(isValidEscrowTransition("NOT_OPENED", "DEPOSITED"), false);
  assert.equal(isValidEscrowTransition("OPENED", "RELEASED"), false);
  assert.equal(isValidEscrowTransition("NOT_OPENED", "FORFEITED"), false);
});

test("a terminal status is frozen — no outgoing transition (EC-11)", () => {
  for (const from of ["RELEASED", "REFUNDED", "FORFEITED"] as const) {
    for (const to of ["OPENED", "DEPOSITED", "RELEASED", "REFUNDED", "FORFEITED", "NOT_OPENED"] as const) {
      assert.equal(isValidEscrowTransition(from, to), false, `${from} -> ${to}`);
    }
  }
});

test("no-op / backward transitions are rejected", () => {
  assert.equal(isValidEscrowTransition("OPENED", "OPENED"), false);
  assert.equal(isValidEscrowTransition("DEPOSITED", "OPENED"), false);
  assert.equal(isValidEscrowTransition("OPENED", "NOT_OPENED"), false);
});

// --- terminal event type mapping ---------------------------------------------
test("escrowEventTypeFor maps terminal statuses to their event type, else null", () => {
  assert.equal(escrowEventTypeFor("RELEASED"), "RELEASED");
  assert.equal(escrowEventTypeFor("REFUNDED"), "REFUNDED");
  assert.equal(escrowEventTypeFor("FORFEITED"), "FORFEITED");
  assert.equal(escrowEventTypeFor("NOT_OPENED"), null);
  assert.equal(escrowEventTypeFor("OPENED"), null);
  assert.equal(escrowEventTypeFor("DEPOSITED"), null);
});

// --- immutable snapshot builder (EC-I) ---------------------------------------
test("buildEscrowSnapshot copies amount/holder/proof at resolution time", () => {
  const snap = buildEscrowSnapshot(
    { earnestAmountUsd: 50000, escrowHolderName: "First Title Co.", proofOfDepositDocumentId: "doc_1" },
    "RELEASED",
    "user_1",
    "Applied at closing",
  );
  assert.deepEqual(snap, {
    type: "RELEASED",
    amountUsdSnapshot: 50000,
    holderNameSnapshot: "First Title Co.",
    proofDocumentIdSnapshot: "doc_1",
    actorId: "user_1",
    reason: "Applied at closing",
  });
});

test("buildEscrowSnapshot trims a reason and nulls a blank/absent one; preserves null fields", () => {
  const blank = buildEscrowSnapshot(
    { earnestAmountUsd: null, escrowHolderName: null, proofOfDepositDocumentId: null },
    "FORFEITED",
    "user_2",
    "   ",
  );
  assert.equal(blank.reason, null);
  assert.equal(blank.amountUsdSnapshot, null);
  assert.equal(blank.holderNameSnapshot, null);
  assert.equal(blank.proofDocumentIdSnapshot, null);

  const trimmed = buildEscrowSnapshot(
    { earnestAmountUsd: 1, escrowHolderName: "H", proofOfDepositDocumentId: null },
    "REFUNDED",
    "user_3",
    "  buyer withdrew  ",
  );
  assert.equal(trimmed.reason, "buyer withdrew");

  const nullReason = buildEscrowSnapshot(
    { earnestAmountUsd: 1, escrowHolderName: "H", proofOfDepositDocumentId: null },
    "REFUNDED",
    "user_4",
    null,
  );
  assert.equal(nullReason.reason, null);
});

// --- display helpers ----------------------------------------------------------
test("status labels and tones cover every status", () => {
  assert.equal(escrowStatusLabel("NOT_OPENED"), "Not opened");
  assert.equal(escrowStatusLabel("DEPOSITED"), "Deposited");
  assert.equal(escrowStatusLabel("FORFEITED"), "Forfeited");
  assert.equal(escrowStatusLabel("weird"), "weird");
  assert.equal(escrowStatusTone("DEPOSITED"), "success");
  assert.equal(escrowStatusTone("RELEASED"), "success");
  assert.equal(escrowStatusTone("REFUNDED"), "warning");
  assert.equal(escrowStatusTone("FORFEITED"), "danger");
  assert.equal(escrowStatusTone("OPENED"), "info");
  assert.equal(escrowStatusTone("NOT_OPENED"), "neutral");
});
