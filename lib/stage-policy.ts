// Stage Policy Evaluation — the PURE rule engine (no Prisma, no I/O). Realizes the ratified
// Opportunity Semantic Contract: pipeline stages are operational PROJECTIONS over authoritative
// business facts. Each ruled stage declares what truth must exist to enter it; unruled stages are
// unconstrained (ALLOW), so existing behavior is unchanged where no rule is defined.
//
// Separation of concerns (Founder-directed): this layer answers ONLY "is this transition valid, what
// does it require, and can it be overridden?" — as a RICH result object so every future caller (UI
// hints, API responses, Automation, imports, bulk edits, audit reporting) is driven by the SAME
// evaluation without reconstructing what the evaluator already knows.
import type { OpportunityStage } from "@prisma/client";

export type StageOutcome = "ALLOW" | "REQUIRES_ATTESTATION" | "DENY";

/** Observed authoritative truth a rule reads. Gathered by any caller; the engine never touches a DB. */
export type StageTransitionFacts = {
  diligenceByKey: Record<string, string>; // diligence item key -> OpportunityDiligenceStatus
  hasExecutedContractDocument: boolean; // a Document of type CONTRACT exists on the opportunity
};

/** Rich evaluation result — self-describing so UI/API/automation/audit reuse it directly. */
export type StagePolicyResult = {
  outcome: StageOutcome;
  stage: OpportunityStage;
  policyId: string; // stable id for analytics/audit (e.g. "t12-received")
  policy: string; // human-readable policy name
  missingTruth: string[]; // authoritative facts that are absent
  missingArtifacts: string[]; // proving artifacts that are absent
  message: string; // why it is not ALLOW
  suggestedAction: string; // what the operator can do next
  canOverride: boolean; // may a controlled attestation proceed? (validated rules yes; strict/deny no)
};

type RuleEvaluation = { satisfied: boolean; missingTruth: string[]; missingArtifacts: string[]; message: string; suggestedAction: string };
export type StageRule = {
  policyId: string;
  policy: string;
  // "validated": unmet ⇒ REQUIRES_ATTESTATION (imported/mid-lifecycle override allowed).
  // "strict": unmet ⇒ DENY (no override). No slice-1 rule is strict.
  mode: "validated" | "strict";
  evaluate: (facts: StageTransitionFacts) => RuleEvaluation;
};

export type StageRuleset = Partial<Record<OpportunityStage, StageRule>>;

const RECEIVED = new Set(["RECEIVED", "REVIEWED"]);
const dstatus = (f: StageTransitionFacts, key: string) => f.diligenceByKey[key] ?? "NOT_REQUESTED";

function diligenceReceivedRule(key: string, label: string): StageRule {
  return {
    policyId: `${key}-received`,
    policy: `${label} received (diligence item '${key}')`,
    mode: "validated",
    evaluate: (f) => {
      if (RECEIVED.has(dstatus(f, key))) return { satisfied: true, missingTruth: [], missingArtifacts: [], message: "", suggestedAction: "" };
      return {
        satisfied: false,
        missingTruth: [`${label} diligence not received (currently ${dstatus(f, key)})`],
        missingArtifacts: [`diligence item '${key}' = RECEIVED or REVIEWED`],
        message: `The ${label} diligence item is '${dstatus(f, key)}', not RECEIVED.`,
        suggestedAction: `Mark the ${label} diligence item received, or provide an attestation reason for an imported/mid-lifecycle deal.`,
      };
    },
  };
}

// PRODUCTION-ACTIVE rules — Slice 1 ships exactly the three diligence-named stages (resolves OWN-2).
// Every other stage is unruled → ALLOW (unchanged) until its own slice.
export const STAGE_RULES: StageRuleset = {
  FINANCIALS_REQUESTED: {
    policyId: "financials-requested",
    policy: "Financials requested (a diligence item has been requested)",
    mode: "validated",
    evaluate: (f) => {
      const anyRequested = Object.values(f.diligenceByKey).some((s) => s !== "NOT_REQUESTED" && s !== "NOT_APPLICABLE");
      if (anyRequested) return { satisfied: true, missingTruth: [], missingArtifacts: [], message: "", suggestedAction: "" };
      return {
        satisfied: false,
        missingTruth: ["no diligence item has been requested"],
        missingArtifacts: ["an OpportunityDiligenceItem in REQUESTED+ state"],
        message: "No diligence item has been requested yet.",
        suggestedAction: "Request at least one diligence item, or provide an attestation reason.",
      };
    },
  },
  T12_RECEIVED: diligenceReceivedRule("t12", "T-12"),
  RENT_ROLL_RECEIVED: diligenceReceivedRule("rent_roll", "Rent roll"),
};

// Defined but NOT production-active in Slice 1 (Founder: keep UNDER_CONTRACT test-only until its slice).
// The integration test injects this to prove the override architecture end-to-end. Production callers
// use the default STAGE_RULES, so UNDER_CONTRACT stays unruled → ALLOW in production.
export const UNDER_CONTRACT_RULE: StageRule = {
  policyId: "under-contract-executed",
  policy: "Contract executed (an executed contract document exists)",
  mode: "validated",
  evaluate: (f) =>
    f.hasExecutedContractDocument
      ? { satisfied: true, missingTruth: [], missingArtifacts: [], message: "", suggestedAction: "" }
      : {
          satisfied: false,
          missingTruth: ["no executed contract on the opportunity"],
          missingArtifacts: ["a Document of type CONTRACT on the opportunity"],
          message: "No executed contract document is attached to this opportunity.",
          suggestedAction: "Attach the executed contract, or provide an attestation reason for an imported deal.",
        },
};

/**
 * Evaluate whether a transition INTO `stage` is permitted by the semantic contract, given the observed
 * truth. `rules` defaults to the production ruleset; callers/tests may pass an extended ruleset. Returns
 * a rich, self-describing result. Unruled stages are unconstrained (ALLOW).
 */
export function evaluateStageRequirements(
  stage: OpportunityStage,
  facts: StageTransitionFacts,
  rules: StageRuleset = STAGE_RULES,
): StagePolicyResult {
  const rule = rules[stage];
  if (!rule) {
    return { outcome: "ALLOW", stage, policyId: "unconstrained", policy: "unconstrained (no rule)", missingTruth: [], missingArtifacts: [], message: "", suggestedAction: "", canOverride: false };
  }
  const r = rule.evaluate(facts);
  if (r.satisfied) {
    return { outcome: "ALLOW", stage, policyId: rule.policyId, policy: rule.policy, missingTruth: [], missingArtifacts: [], message: "", suggestedAction: "", canOverride: false };
  }
  const strict = rule.mode === "strict";
  return {
    outcome: strict ? "DENY" : "REQUIRES_ATTESTATION",
    stage,
    policyId: rule.policyId,
    policy: rule.policy,
    missingTruth: r.missingTruth,
    missingArtifacts: r.missingArtifacts,
    message: r.message,
    suggestedAction: r.suggestedAction,
    canOverride: !strict,
  };
}
