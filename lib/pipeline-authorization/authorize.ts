// E3 · Authorization: the PURE decision function (AUTH-INV-10/12). Deterministic, observational; consumes only
// { actor, capability, operation, policy, evaluationArtifact } — never evaluates/reconstructs/reads-ledger/projects.
// Frozen §11a DENY codes; canonical ordering so decisionId is stable. docs/architecture/E3_AUTHORIZATION_DESIGN.md.

import { createHash } from "node:crypto";

import { isKnownFactType } from "@/lib/pipeline-facts";
import type { AuthorizationDecision, AuthorizeInput, DenyCode, PolicyReason } from "./types";

const KNOWN_OPS = new Set(["DRAFT", "RECORD_EVIDENCE", "DECLARE", "RETRACT", "CORRECT", "INVALIDATE", "ACCEPT_EXCEPTION"]);

// Frozen canonical precedence (design §4). denyCodes are emitted in this order regardless of check order.
const PRECEDENCE: DenyCode[] = [
  "UNKNOWN_FACT",
  "UNKNOWN_OPERATION",
  "INSUFFICIENT_CAPABILITY",
  "MIGRATION_NOT_PERMITTED",
  "INVALID_EXCEPTION_SCOPE",
  "VERSION_MISMATCH",
  "POLICY_PRECONDITION_FAILED",
  "MISSING_REQUIRED_EVIDENCE",
  "EXCLUSIVITY_CONFLICT",
  "STALE_FACT_GRAPH",
];
const canonical = (codes: DenyCode[]): DenyCode[] =>
  PRECEDENCE.filter((c) => codes.includes(c)); // unique + canonical order

function computeDecisionId(input: AuthorizeInput, denyCodes: DenyCode[]): string {
  const { actor, capability, operation, policy, evaluationArtifact } = input;
  const material = {
    a: [actor.actorId, actor.actorClass, actor.identityVersion ?? null],
    c: capability,
    o: [operation.factType, operation.op, operation.targetChainId ?? null, operation.version ?? null],
    e: evaluationArtifact?.result.evaluationId ?? "NONE",
    p: [policy.policyId, policy.policyVersion],
    d: denyCodes, // already canonical
  };
  return createHash("sha256").update(JSON.stringify(material)).digest("hex").slice(0, 32);
}

/** Apply capability + policy to a precomputed EvaluationArtifact → AuthorizationDecision. Fail-closed. */
export function authorize(input: AuthorizeInput): AuthorizationDecision {
  const { actor, capability, operation, policy, evaluationArtifact } = input;
  const codes: DenyCode[] = [];
  const reasons: PolicyReason[] = [];
  const reasoning: string[] = [];

  // 1 · request validity
  if (!isKnownFactType(operation.factType)) { codes.push("UNKNOWN_FACT"); reasons.push({ code: "UNKNOWN_FACT_TYPE", detail: operation.factType }); }
  if (!KNOWN_OPS.has(operation.op)) { codes.push("UNKNOWN_OPERATION"); reasons.push({ code: "UNKNOWN_OPERATION", detail: operation.op }); }

  // 2 · actor & capability (orthogonal checks)
  if (!actor.capabilities.includes(capability)) { codes.push("INSUFFICIENT_CAPABILITY"); reasons.push({ code: "CAPABILITY_NOT_HELD", detail: capability }); }
  if (!policy.allowedActorClasses.includes(actor.actorClass)) { codes.push("INSUFFICIENT_CAPABILITY"); reasons.push({ code: "ACTOR_CLASS_NOT_ALLOWED", detail: actor.actorClass }); }

  // 3 · migration / exception scope
  if (operation.provenance === "MIGRATION_ORIGIN" && actor.actorClass !== "MIGRATION_PRINCIPAL") { codes.push("MIGRATION_NOT_PERMITTED"); reasons.push({ code: "MIGRATION_BY_NON_MIGRATION_PRINCIPAL" }); }
  if (/ACCEPT_.*EXCEPTION/.test(capability) && !policy.allowExceptions) { codes.push("INVALID_EXCEPTION_SCOPE"); reasons.push({ code: "EXCEPTION_NOT_ALLOWED_BY_POLICY", detail: capability }); }

  // 4 · version binding (only when a predicate is REQUIRED)
  let versionMismatch = false;
  if (policy.predicateRequirement === "REQUIRED") {
    const r = evaluationArtifact?.result;
    if (!r) { versionMismatch = true; codes.push("VERSION_MISMATCH"); reasons.push({ code: "REQUIRED_PREDICATE_ARTIFACT_MISSING" }); }
    else {
      if (policy.requiredPredicate && r.predicateId !== policy.requiredPredicate) { versionMismatch = true; codes.push("VERSION_MISMATCH"); reasons.push({ code: "REQUIRED_PREDICATE_MISMATCH", detail: `${r.predicateId}!=${policy.requiredPredicate}` }); }
      const vs = policy.requiredVersionScope;
      if (vs?.policyVersion && r.policyVersion !== vs.policyVersion) { versionMismatch = true; codes.push("VERSION_MISMATCH"); reasons.push({ code: "POLICY_VERSION_MISMATCH" }); }
      const wantRuleSet = policy.requiredRuleSetVersion ?? vs?.ruleSetVersion;
      if (wantRuleSet && r.ruleSetVersion !== wantRuleSet) { versionMismatch = true; codes.push("VERSION_MISMATCH"); reasons.push({ code: "RULE_SET_MISMATCH" }); }
      if (vs?.artifactVersion && r.determinismStamp.graphVersionContext.artifactVersion !== vs.artifactVersion) { versionMismatch = true; codes.push("VERSION_MISMATCH"); reasons.push({ code: "ARTIFACT_VERSION_SCOPE_MISMATCH" }); }
    }
  }

  // 5 · business precondition (only if REQUIRED, artifact present, and it is the right/current evaluation).
  //     The frozen DENY code is DECLARED BY POLICY (policy.preconditionFailureCode) — Authorization never infers
  //     the failure category from the missing item's name. Default: POLICY_PRECONDITION_FAILED.
  if (policy.predicateRequirement === "REQUIRED" && evaluationArtifact && !versionMismatch) {
    if (!evaluationArtifact.result.satisfied) {
      const failureCode = policy.preconditionFailureCode ?? "POLICY_PRECONDITION_FAILED";
      codes.push(failureCode);
      reasons.push({ code: "PRECONDITION_NOT_SATISFIED", detail: evaluationArtifact.result.missing.join(",") });
    }
  }

  const denyCodes = canonical(codes);
  const allow = denyCodes.length === 0;
  reasoning.push(allow ? `ALLOW ${capability} on ${operation.factType} (${operation.op})` : `DENY ${capability} on ${operation.factType}: ${denyCodes.join(", ")}`);
  const decisionId = computeDecisionId(input, denyCodes);

  return {
    decision: { allow, denyCodes, actor, capability, operation, decisionId, policyVersion: policy.policyVersion },
    explanation: { evaluationArtifact: evaluationArtifact ?? null, policyReasons: reasons, authorizationReasoning: reasoning },
  };
}
