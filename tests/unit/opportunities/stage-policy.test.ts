import { test } from "node:test";
import assert from "node:assert/strict";
import { OpportunityStage } from "@prisma/client";

import { evaluateStageRequirements, UNDER_CONTRACT_RULE, STAGE_RULES, type StageTransitionFacts } from "../../../lib/stage-policy";

const facts = (over: Partial<StageTransitionFacts> = {}): StageTransitionFacts => ({
  diligenceByKey: {},
  hasExecutedContractDocument: false,
  ...over,
});

test("unruled stages are unconstrained (ALLOW) — existing behavior unchanged", () => {
  for (const s of [OpportunityStage.LEAD, OpportunityStage.UNDERWRITING, OpportunityStage.OFFER_READY, OpportunityStage.CLOSING, OpportunityStage.PAID]) {
    assert.equal(evaluateStageRequirements(s, facts()).outcome, "ALLOW", `${s} unruled → ALLOW`);
  }
});

test("the rich result is self-describing when a validated stage is blocked", () => {
  const r = evaluateStageRequirements(OpportunityStage.T12_RECEIVED, facts({ diligenceByKey: { t12: "NOT_REQUESTED" } }));
  assert.equal(r.outcome, "REQUIRES_ATTESTATION");
  assert.equal(r.canOverride, true);
  assert.equal(r.policyId, "t12-received");
  assert.ok(r.missingTruth.length > 0, "missingTruth populated");
  assert.ok(r.missingArtifacts.length > 0, "missingArtifacts populated");
  assert.ok(r.message.includes("T-12"), "message populated");
  assert.ok(r.suggestedAction.length > 0, "suggestedAction populated");
});

test("T12_RECEIVED / RENT_ROLL_RECEIVED: ALLOW when the diligence item is RECEIVED/REVIEWED", () => {
  assert.equal(evaluateStageRequirements(OpportunityStage.T12_RECEIVED, facts({ diligenceByKey: { t12: "RECEIVED" } })).outcome, "ALLOW");
  assert.equal(evaluateStageRequirements(OpportunityStage.T12_RECEIVED, facts({ diligenceByKey: { t12: "REVIEWED" } })).outcome, "ALLOW");
  assert.equal(evaluateStageRequirements(OpportunityStage.RENT_ROLL_RECEIVED, facts({ diligenceByKey: { rent_roll: "RECEIVED" } })).outcome, "ALLOW");
  assert.equal(evaluateStageRequirements(OpportunityStage.RENT_ROLL_RECEIVED, facts()).outcome, "REQUIRES_ATTESTATION");
});

test("FINANCIALS_REQUESTED: ALLOW once any diligence item is requested; else REQUIRES_ATTESTATION", () => {
  assert.equal(evaluateStageRequirements(OpportunityStage.FINANCIALS_REQUESTED, facts({ diligenceByKey: { t12: "REQUESTED" } })).outcome, "ALLOW");
  assert.equal(evaluateStageRequirements(OpportunityStage.FINANCIALS_REQUESTED, facts({ diligenceByKey: { t12: "NOT_REQUESTED", rent_roll: "NOT_APPLICABLE" } })).outcome, "REQUIRES_ATTESTATION");
});

test("UNDER_CONTRACT is NOT production-active in Slice 1 (default rules → ALLOW)", () => {
  // Proves it stays test-only: with the production ruleset, UNDER_CONTRACT is unruled.
  assert.equal(STAGE_RULES[OpportunityStage.UNDER_CONTRACT], undefined);
  assert.equal(evaluateStageRequirements(OpportunityStage.UNDER_CONTRACT, facts()).outcome, "ALLOW");
});

test("UNDER_CONTRACT rule (injected) validates the executed-contract artifact", () => {
  const rules = { ...STAGE_RULES, [OpportunityStage.UNDER_CONTRACT]: UNDER_CONTRACT_RULE };
  const blocked = evaluateStageRequirements(OpportunityStage.UNDER_CONTRACT, facts({ hasExecutedContractDocument: false }), rules);
  assert.equal(blocked.outcome, "REQUIRES_ATTESTATION");
  assert.match(blocked.missingArtifacts.join(" "), /CONTRACT/);
  assert.equal(evaluateStageRequirements(OpportunityStage.UNDER_CONTRACT, facts({ hasExecutedContractDocument: true }), rules).outcome, "ALLOW");
});

test("no slice-1 rule is strict (all allow an imported-deal attestation override)", () => {
  for (const s of [OpportunityStage.T12_RECEIVED, OpportunityStage.RENT_ROLL_RECEIVED, OpportunityStage.FINANCIALS_REQUESTED]) {
    assert.equal(evaluateStageRequirements(s, facts()).canOverride, true, `${s} → attestation, not hard deny`);
  }
});
