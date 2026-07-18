import { test } from "node:test";
import assert from "node:assert/strict";
import { OpportunityDiligenceStatus, OpportunityStage } from "@prisma/client";

import {
  PRECONTRACT_DILIGENCE_TEMPLATE,
  diligenceStatusLabel,
  diligenceStatusTone,
  isPostContractStage,
  diligenceFocusForStage,
  summarizeDiligence,
} from "../../../lib/opportunity-diligence";

// Tests the EXISTING intended behavior of the pure diligence logic — no invented lifecycle/rules.

test("PRECONTRACT_DILIGENCE_TEMPLATE includes the three core documents", () => {
  const keys: string[] = PRECONTRACT_DILIGENCE_TEMPLATE.map((i) => i.key);
  for (const core of ["t12", "rent_roll", "offering_memo"]) assert.ok(keys.includes(core), `has ${core}`);
  // positions are unique + ascending (as the template defines display order)
  const positions = PRECONTRACT_DILIGENCE_TEMPLATE.map((i) => i.position);
  assert.equal(new Set(positions).size, positions.length, "positions unique");
});

test("diligenceStatusLabel + tone: every status maps to a defined value", () => {
  const tones = new Set(["neutral", "warning", "info", "success", "danger"]);
  for (const s of Object.values(OpportunityDiligenceStatus)) {
    assert.ok(diligenceStatusLabel(s).length > 0, `${s} label`);
    assert.ok(tones.has(diligenceStatusTone(s)), `${s} tone`);
  }
  assert.equal(diligenceStatusTone(OpportunityDiligenceStatus.MISSING), "danger");
  assert.equal(diligenceStatusTone(OpportunityDiligenceStatus.REVIEWED), "success");
});

test("isPostContractStage: true only at/after UNDER_CONTRACT", () => {
  for (const s of [OpportunityStage.UNDER_CONTRACT, OpportunityStage.BUYER_MATCHED, OpportunityStage.CLOSING, OpportunityStage.PAID]) {
    assert.equal(isPostContractStage(s), true, `${s} is post-contract`);
  }
  for (const s of [OpportunityStage.LEAD, OpportunityStage.UNDERWRITING, OpportunityStage.OFFER_READY, OpportunityStage.LOI_SENT]) {
    assert.equal(isPostContractStage(s), false, `${s} is pre-contract`);
  }
});

test("diligenceFocusForStage: returns guidance for every stage; post-contract defers to the Closing Center", () => {
  for (const s of Object.values(OpportunityStage)) {
    assert.ok(diligenceFocusForStage(s).length > 0, `${s} has guidance`);
  }
  // Boundary language: post-contract stages defer to the Closing Center (no Closing ownership).
  assert.match(diligenceFocusForStage(OpportunityStage.UNDER_CONTRACT), /Closing Center/);
  assert.match(diligenceFocusForStage(OpportunityStage.PAID), /Closing Center/);
});

// --- summarizeDiligence: the readyForUnderwriting rule (missing===0 && >=3 core received/reviewed) ---
const item = (key: string, status: OpportunityDiligenceStatus) => ({ key, status });

test("summarizeDiligence: empty → all zero, not ready", () => {
  const s = summarizeDiligence([]);
  assert.deepEqual(
    { total: s.total, requested: s.requested, received: s.received, reviewed: s.reviewed, missing: s.missing, ready: s.readyForUnderwriting },
    { total: 0, requested: 0, received: 0, reviewed: 0, missing: 0, ready: false },
  );
});

test("summarizeDiligence: 3 core REVIEWED + no missing → readyForUnderwriting true", () => {
  const s = summarizeDiligence([
    item("t12", OpportunityDiligenceStatus.REVIEWED),
    item("rent_roll", OpportunityDiligenceStatus.RECEIVED),
    item("offering_memo", OpportunityDiligenceStatus.REVIEWED),
    item("tax_bills", OpportunityDiligenceStatus.NOT_REQUESTED),
  ]);
  assert.equal(s.readyForUnderwriting, true);
  assert.equal(s.received, 3);
  assert.equal(s.reviewed, 2);
});

test("summarizeDiligence: any MISSING item blocks readyForUnderwriting", () => {
  const s = summarizeDiligence([
    item("t12", OpportunityDiligenceStatus.REVIEWED),
    item("rent_roll", OpportunityDiligenceStatus.RECEIVED),
    item("offering_memo", OpportunityDiligenceStatus.RECEIVED),
    item("utility_bills", OpportunityDiligenceStatus.MISSING),
  ]);
  assert.equal(s.missing, 1);
  assert.equal(s.readyForUnderwriting, false);
});

test("summarizeDiligence: fewer than 3 core received → not ready", () => {
  const s = summarizeDiligence([
    item("t12", OpportunityDiligenceStatus.REVIEWED),
    item("rent_roll", OpportunityDiligenceStatus.REVIEWED),
    item("offering_memo", OpportunityDiligenceStatus.REQUESTED), // not received/reviewed
  ]);
  assert.equal(s.readyForUnderwriting, false);
});

test("summarizeDiligence: requested counts everything except NOT_REQUESTED", () => {
  const s = summarizeDiligence([
    item("a", OpportunityDiligenceStatus.NOT_REQUESTED),
    item("b", OpportunityDiligenceStatus.REQUESTED),
    item("c", OpportunityDiligenceStatus.NOT_APPLICABLE),
  ]);
  assert.equal(s.total, 3);
  assert.equal(s.requested, 2); // REQUESTED + NOT_APPLICABLE (both !== NOT_REQUESTED)
});
