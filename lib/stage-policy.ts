// Stage Policy Evaluation — the PURE rule engine (no Prisma, no I/O). Realizes the ratified
// Opportunity Semantic Contract: pipeline stages are operational PROJECTIONS over authoritative
// business facts. Each ruled stage declares what truth must exist to enter it; unruled stages are
// unconstrained (ALLOW), so existing behavior is unchanged everywhere a rule is not defined.
//
// Separation of concerns (Founder-directed): this layer answers ONLY "is this transition valid, and
// what does it require?" It knows nothing about UI, persistence, or who the caller is — so it is
// reused identically by the UI action, imports, Automation, APIs, and admin tools.
import type { OpportunityStage } from "@prisma/client";

export type StageDecision = "ALLOW" | "REQUIRES_ATTESTATION" | "DENY";

/**
 * The observed authoritative truth a rule needs. Gathered by any caller (the service, an import, an
 * automation) and passed in — the engine never reads a DB. Extend as later slices add rules.
 */
export type StageTransitionFacts = {
  diligenceByKey: Record<string, string>; // diligence item key -> OpportunityDiligenceStatus
  hasExecutedContractDocument: boolean; // a Document of type CONTRACT exists on the opportunity
};

export type StagePolicyResult = {
  stage: OpportunityStage;
  decision: StageDecision;
  policy: string; // the rule / business policy applied
  missing: string[]; // authoritative truth that is absent
  requiredArtifacts: string[]; // what proves the business event
  explanation: string; // human-readable reason when not ALLOW
};

type RuleEvaluation = { satisfied: boolean; missing: string[]; explanation: string };
type StageRule = {
  policy: string;
  requiredArtifacts: string[];
  // "validated": unmet truth ⇒ REQUIRES_ATTESTATION (imported/mid-lifecycle override allowed).
  // "strict": unmet truth ⇒ DENY (no override). No slice-1 rule is strict.
  mode: "validated" | "strict";
  evaluate: (facts: StageTransitionFacts) => RuleEvaluation;
};

const RECEIVED = new Set(["RECEIVED", "REVIEWED"]);
const dstatus = (f: StageTransitionFacts, key: string) => f.diligenceByKey[key] ?? "NOT_REQUESTED";
const diligenceReceivedRule = (key: string, label: string): StageRule => ({
  policy: `${label} received (diligence item '${key}')`,
  requiredArtifacts: [`diligence item '${key}' = RECEIVED or REVIEWED`],
  mode: "validated",
  evaluate: (f) => {
    const ok = RECEIVED.has(dstatus(f, key));
    return ok
      ? { satisfied: true, missing: [], explanation: "" }
      : { satisfied: false, missing: [`${key} diligence RECEIVED`], explanation: `The ${label} diligence item is '${dstatus(f, key)}', not RECEIVED.` };
  },
});

// Slice 1: the diligence-named stages (highest-impact contradiction, OWN-2). UNDER_CONTRACT is
// included to realize the ratified rule + the imported-deal attestation regression test. Every other
// stage is unruled → ALLOW (unchanged) until its own slice.
export const STAGE_RULES: Partial<Record<OpportunityStage, StageRule>> = {
  FINANCIALS_REQUESTED: {
    policy: "Financials requested (a diligence item has been requested)",
    requiredArtifacts: ["an OpportunityDiligenceItem in REQUESTED+ state"],
    mode: "validated",
    evaluate: (f) => {
      const anyRequested = Object.values(f.diligenceByKey).some((s) => s !== "NOT_REQUESTED" && s !== "NOT_APPLICABLE");
      return anyRequested
        ? { satisfied: true, missing: [], explanation: "" }
        : { satisfied: false, missing: ["a requested diligence item"], explanation: "No diligence item has been requested yet." };
    },
  },
  T12_RECEIVED: diligenceReceivedRule("t12", "T-12"),
  RENT_ROLL_RECEIVED: diligenceReceivedRule("rent_roll", "Rent roll"),
  UNDER_CONTRACT: {
    policy: "Contract executed (an executed contract document exists)",
    requiredArtifacts: ["a Document of type CONTRACT on the opportunity"],
    mode: "validated",
    evaluate: (f) =>
      f.hasExecutedContractDocument
        ? { satisfied: true, missing: [], explanation: "" }
        : { satisfied: false, missing: ["an executed CONTRACT document"], explanation: "No executed contract document is attached to this opportunity." },
  },
};

/**
 * Evaluate whether a transition INTO `stage` is permitted by the semantic contract, given the
 * observed truth. Unruled stages are unconstrained (ALLOW). This is the single reusable policy seam.
 */
export function evaluateStageRequirements(stage: OpportunityStage, facts: StageTransitionFacts): StagePolicyResult {
  const rule = STAGE_RULES[stage];
  if (!rule) {
    return { stage, decision: "ALLOW", policy: "unconstrained (no rule)", missing: [], requiredArtifacts: [], explanation: "" };
  }
  const r = rule.evaluate(facts);
  if (r.satisfied) {
    return { stage, decision: "ALLOW", policy: rule.policy, missing: [], requiredArtifacts: rule.requiredArtifacts, explanation: "" };
  }
  return {
    stage,
    decision: rule.mode === "strict" ? "DENY" : "REQUIRES_ATTESTATION",
    policy: rule.policy,
    missing: r.missing,
    requiredArtifacts: rule.requiredArtifacts,
    explanation: r.explanation,
  };
}
