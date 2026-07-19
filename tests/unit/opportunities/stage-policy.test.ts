import { test } from "node:test";
import assert from "node:assert/strict";
import { OpportunityStage } from "@prisma/client";

import { evaluateStageRequirements, type StageTransitionFacts } from "../../../lib/stage-policy";

const facts = (over: Partial<StageTransitionFacts> = {}): StageTransitionFacts => ({
  diligenceByKey: {},
  hasExecutedContractDocument: false,
  ...over,
});

test("unruled stages are unconstrained (ALLOW) — existing behavior unchanged", () => {
  for (const s of [OpportunityStage.LEAD, OpportunityStage.UNDERWRITING, OpportunityStage.OFFER_READY, OpportunityStage.CLOSING, OpportunityStage.PAID]) {
    assert.equal(evaluateStageRequirements(s, facts()).decision, "ALLOW", `${s} unruled → ALLOW`);
  }
});

test("T12_RECEIVED: ALLOW when t12 diligence is RECEIVED/REVIEWED; else REQUIRES_ATTESTATION with detail", () => {
  assert.equal(evaluateStageRequirements(OpportunityStage.T12_RECEIVED, facts({ diligenceByKey: { t12: "RECEIVED" } })).decision, "ALLOW");
  assert.equal(evaluateStageRequirements(OpportunityStage.T12_RECEIVED, facts({ diligenceByKey: { t12: "REVIEWED" } })).decision, "ALLOW");
  const r = evaluateStageRequirements(OpportunityStage.T12_RECEIVED, facts({ diligenceByKey: { t12: "NOT_REQUESTED" } }));
  assert.equal(r.decision, "REQUIRES_ATTESTATION");
  assert.ok(r.missing.length > 0 && r.requiredArtifacts.length > 0 && r.explanation.includes("T-12"));
});

test("RENT_ROLL_RECEIVED mirrors the rent_roll diligence item", () => {
  assert.equal(evaluateStageRequirements(OpportunityStage.RENT_ROLL_RECEIVED, facts({ diligenceByKey: { rent_roll: "RECEIVED" } })).decision, "ALLOW");
  assert.equal(evaluateStageRequirements(OpportunityStage.RENT_ROLL_RECEIVED, facts()).decision, "REQUIRES_ATTESTATION");
});

test("FINANCIALS_REQUESTED: ALLOW once any diligence item is requested; else REQUIRES_ATTESTATION", () => {
  assert.equal(evaluateStageRequirements(OpportunityStage.FINANCIALS_REQUESTED, facts({ diligenceByKey: { t12: "REQUESTED" } })).decision, "ALLOW");
  // all NOT_REQUESTED / NOT_APPLICABLE → nothing requested yet
  assert.equal(evaluateStageRequirements(OpportunityStage.FINANCIALS_REQUESTED, facts({ diligenceByKey: { t12: "NOT_REQUESTED", rent_roll: "NOT_APPLICABLE" } })).decision, "REQUIRES_ATTESTATION");
});

test("UNDER_CONTRACT: ALLOW with an executed contract document; else REQUIRES_ATTESTATION", () => {
  assert.equal(evaluateStageRequirements(OpportunityStage.UNDER_CONTRACT, facts({ hasExecutedContractDocument: true })).decision, "ALLOW");
  const r = evaluateStageRequirements(OpportunityStage.UNDER_CONTRACT, facts({ hasExecutedContractDocument: false }));
  assert.equal(r.decision, "REQUIRES_ATTESTATION");
  assert.match(r.requiredArtifacts.join(" "), /CONTRACT/);
});

test("no slice-1 rule is strict (all allow an imported-deal attestation override, none DENY)", () => {
  for (const s of [OpportunityStage.T12_RECEIVED, OpportunityStage.RENT_ROLL_RECEIVED, OpportunityStage.FINANCIALS_REQUESTED, OpportunityStage.UNDER_CONTRACT]) {
    const r = evaluateStageRequirements(s, facts());
    assert.notEqual(r.decision, "DENY", `${s} unmet → attestation, not hard deny`);
  }
});
