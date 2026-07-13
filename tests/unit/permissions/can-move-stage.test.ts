import { test } from "node:test";
import assert from "node:assert/strict";
import { OpportunityStage, UserRole } from "@prisma/client";

import { canMoveStage } from "../../../lib/permissions";

const { ADMIN, ACQUISITIONS, ANALYST, DISPOSITIONS } = UserRole;
const S = OpportunityStage;

// The seven required pipeline cases (segment ownership by BOTH current and target).
test("ADMIN may move any direction, including backward", () => {
  assert.equal(canMoveStage(ADMIN, S.LEAD, S.PAID), true);
  assert.equal(canMoveStage(ADMIN, S.CLOSING, S.LEAD), true); // regression allowed for ADMIN only
});

test("ANALYST may never move a stage", () => {
  assert.equal(canMoveStage(ANALYST, S.LEAD, S.SELLER_CONTACTED), false);
  assert.equal(canMoveStage(ANALYST, S.UNDER_CONTRACT, S.CLOSING), false);
});

test("ACQUISITIONS own LEAD…UNDER_CONTRACT, forward only", () => {
  assert.equal(canMoveStage(ACQUISITIONS, S.LEAD, S.UNDERWRITING), true);
  assert.equal(canMoveStage(ACQUISITIONS, S.OFFER_READY, S.UNDER_CONTRACT), true);
  // target beyond UNDER_CONTRACT is out of their segment
  assert.equal(canMoveStage(ACQUISITIONS, S.UNDER_CONTRACT, S.CLOSING), false);
});

test("DISPOSITIONS own UNDER_CONTRACT…PAID, forward only", () => {
  assert.equal(canMoveStage(DISPOSITIONS, S.UNDER_CONTRACT, S.CLOSING), true);
  assert.equal(canMoveStage(DISPOSITIONS, S.BUYER_MATCHED, S.PAID), true);
  // current before UNDER_CONTRACT is out of their segment
  assert.equal(canMoveStage(DISPOSITIONS, S.LEAD, S.UNDER_CONTRACT), false);
});

test("cross-segment jumps are rejected for non-admins", () => {
  assert.equal(canMoveStage(ACQUISITIONS, S.LEAD, S.PAID), false);
  assert.equal(canMoveStage(DISPOSITIONS, S.LEAD, S.PAID), false);
});

test("backward moves are rejected for workflow-owning roles", () => {
  assert.equal(canMoveStage(ACQUISITIONS, S.UNDERWRITING, S.LEAD), false);
  assert.equal(canMoveStage(DISPOSITIONS, S.PAID, S.CLOSING), false);
});

test("UNDER_CONTRACT is the shared handoff both segments can touch", () => {
  assert.equal(canMoveStage(ACQUISITIONS, S.LOI_SENT, S.UNDER_CONTRACT), true);
  assert.equal(canMoveStage(DISPOSITIONS, S.UNDER_CONTRACT, S.BUYER_MATCHED), true);
});

test("a no-op (same stage) is allowed for owning roles, denied for ANALYST", () => {
  assert.equal(canMoveStage(ACQUISITIONS, S.UNDERWRITING, S.UNDERWRITING), true);
  assert.equal(canMoveStage(ANALYST, S.UNDERWRITING, S.UNDERWRITING), false);
});

test("an unrecognized stage is rejected outright (even for ADMIN)", () => {
  assert.equal(canMoveStage(ADMIN, "BOGUS" as unknown as typeof S.LEAD, S.LEAD), false);
  assert.equal(canMoveStage(ACQUISITIONS, S.LEAD, "BOGUS" as unknown as typeof S.LEAD), false);
});
