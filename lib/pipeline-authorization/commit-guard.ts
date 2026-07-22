// E3 · Authorization: the commit-time guard (AUTH-INV-11/14). A prior ALLOW is NEVER a reservation/lock/durable
// permission — it is a decision about a specific observed state, valid only while that state holds. At the
// transaction boundary this reruns the SAME canonical components (rebuild the current FactGraph → re-evaluate the
// required predicate through the ONE evaluator → recompute authorize) and compares deterministic identities;
// a stale authorization is rejected with STALE_FACT_GRAPH. The DB transaction wiring itself is E6.

import { buildFactGraph, type VersionContext } from "@/lib/pipeline-facts";
import { evaluateArtifact } from "@/lib/pipeline-predicates";
import { authorize } from "./authorize";
import type { ActorSnapshot, AuthorizationDecision, AuthorizationPolicy, OperationRef } from "./types";

export type CommitRevalidationInput = {
  expectedDecisionId: string;
  organizationId: string;
  opportunityId: string;
  actor: ActorSnapshot; // caller supplies a FRESH snapshot (identity layer revalidates currency)
  capability: string;
  operation: OperationRef;
  policy: AuthorizationPolicy;
  versionContext: VersionContext;
};

export type CommitRevalidation = {
  valid: boolean; // true iff the fresh decision ALLOWs AND its decisionId matches the expected one
  stale: boolean; // true iff inputs changed since the original decision (fresh id != expected)
  decision: AuthorizationDecision; // the freshly recomputed decision (authoritative for commit)
};

/**
 * Revalidate a previously-returned authorization against current authoritative state before commit.
 * Observational: it recomputes; it never mutates. If the graph/evaluation changed, the fresh decisionId differs
 * → `stale` (a prior ALLOW must not commit). If the fresh decision itself DENYs, `valid` is false with its codes.
 */
export async function revalidateForCommit(input: CommitRevalidationInput): Promise<CommitRevalidation> {
  const graph = await buildFactGraph({
    organizationId: input.organizationId,
    opportunityId: input.opportunityId,
    versionContext: input.versionContext,
  });
  const artifact =
    input.policy.predicateRequirement === "REQUIRED" && input.policy.requiredPredicate
      ? evaluateArtifact(input.policy.requiredPredicate, {
          graph,
          ruleSetVersion: input.versionContext.ruleSetVersion,
          policyVersion: input.versionContext.policyVersion,
        })
      : null;
  const decision = authorize({
    actor: input.actor,
    capability: input.capability,
    operation: input.operation,
    policy: input.policy,
    evaluationArtifact: artifact,
  });
  const idMatches = decision.decision.decisionId === input.expectedDecisionId;
  const stale = !idMatches; // inputs changed since the original decision
  if (stale && decision.decision.allow) {
    // fresh state still allows, but it is a DIFFERENT decision than the one presented → reject as stale.
    decision.decision.allow = false;
    decision.decision.denyCodes = ["STALE_FACT_GRAPH", ...decision.decision.denyCodes];
    decision.explanation.policyReasons = [{ code: "STALE_FACT_GRAPH", detail: "decisionId changed since authorization" }, ...decision.explanation.policyReasons];
  }
  return { valid: decision.decision.allow && idMatches, stale, decision };
}
