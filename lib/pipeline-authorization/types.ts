// E3 · Authorization: types. docs/architecture/E3_AUTHORIZATION_DESIGN.md + AUTHORIZATION_DECISION_CONTRACT.md.
// Authorization applies capability + policy to an ALREADY-COMPUTED EvaluationArtifact. Pure/observational
// (AUTH-INV-10/12); it never evaluates predicates, reconstructs facts, reads the ledger, or projects stages.

import type { EvaluationArtifact } from "@/lib/pipeline-predicates";

export type ActorClass = "HUMAN" | "EXTERNAL_PRINCIPAL" | "DETERMINISTIC_EVALUATOR" | "MIGRATION_PRINCIPAL";
export type FactClass = "ARTIFACT" | "EVIDENCE" | "DECISION";

/** An immutable actor snapshot supplied by the identity layer; the commit guard revalidates its currency. */
export type ActorSnapshot = {
  actorId: string;
  actorClass: ActorClass;
  capabilities: string[]; // granted capabilities — ORTHOGONAL to actorClass
  identityVersion?: string | null;
};

/** The intended fact operation being authorized (part of the decision identity). */
export type OperationRef = {
  factType: string;
  factClass: FactClass;
  op: string; // DRAFT | RECORD_EVIDENCE | DECLARE | RETRACT | CORRECT | INVALIDATE | ACCEPT_EXCEPTION
  targetChainId?: string | null;
  version?: string | null;
  provenance?: "VERIFIED" | "MIGRATION_ORIGIN";
};

export type VersionScope = { policyVersion?: string; ruleSetVersion?: string; artifactVersion?: string };
export type PredicateRequirement = "REQUIRED" | "INFORMATIONAL" | "NOT_APPLICABLE";

/** A first-class, versioned, independently-identifiable authorization policy (data, not code). */
export type AuthorizationPolicy = {
  policyId: string; // stable identity (distinct policies may share a version label)
  policyVersion: string;
  capability: string;
  operation: { factType: string; op: string };
  allowedActorClasses: ActorClass[];
  predicateRequirement: PredicateRequirement;
  requiredPredicate?: string;
  requiredFactClass?: FactClass;
  requiredVersionScope?: VersionScope;
  requiredRuleSetVersion?: string;
  allowExceptions?: boolean;
};

/** The frozen DENY taxonomy (Authorization Model §11a) — no renamed/invented codes. */
export type DenyCode =
  | "UNKNOWN_FACT"
  | "UNKNOWN_OPERATION"
  | "INSUFFICIENT_CAPABILITY"
  | "MIGRATION_NOT_PERMITTED"
  | "INVALID_EXCEPTION_SCOPE"
  | "VERSION_MISMATCH"
  | "POLICY_PRECONDITION_FAILED"
  | "MISSING_REQUIRED_EVIDENCE"
  | "EXCLUSIVITY_CONFLICT"
  | "STALE_FACT_GRAPH";

/** Structured, finer-grained reason under a stable DENY code (preserves detail without new public codes). */
export type PolicyReason = { code: string; detail?: string };

export type AuthorizationDecision = {
  decision: {
    allow: boolean;
    denyCodes: DenyCode[]; // canonical order; empty ⇔ allow
    actor: ActorSnapshot;
    capability: string;
    operation: OperationRef;
    decisionId: string; // deterministic identity (design §5)
    policyVersion: string;
  };
  explanation: {
    evaluationArtifact: EvaluationArtifact | null; // embedded AS-IS (AUTH-INV-13)
    policyReasons: PolicyReason[];
    authorizationReasoning: string[]; // appended by authz — additive only
  };
};

export type AuthorizeInput = {
  actor: ActorSnapshot;
  capability: string;
  operation: OperationRef;
  policy: AuthorizationPolicy;
  evaluationArtifact: EvaluationArtifact | null; // caller-precomputed; null when predicateRequirement != REQUIRED
};
