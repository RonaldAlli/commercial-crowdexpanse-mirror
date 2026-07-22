// E3 · Authorization: the versioned AuthorizationPolicy registry. Policy is DATA (no business logic in code);
// each entry is independently identifiable (policyId) and versioned. Initial set (design §7): DECLARE of
// DILIGENCE_COMPLETE / CLEAR_TO_CLOSE / TRANSACTION_CLOSED.{CASH,THIRD_PARTY_FINANCED,ASSIGNMENT}.

import type { AuthorizationPolicy } from "./types";

const AP1: AuthorizationPolicy[] = [
  {
    policyId: "ap1-declare-diligence-complete",
    policyVersion: "ap-1",
    capability: "DECLARE_DILIGENCE_COMPLETE",
    operation: { factType: "DILIGENCE_COMPLETE", op: "DECLARE" },
    allowedActorClasses: ["HUMAN"],
    predicateRequirement: "REQUIRED",
    requiredPredicate: "DILIGENCE_COMPLETE",
    requiredFactClass: "DECISION",
    requiredRuleSetVersion: "rs-1",
  },
  {
    policyId: "ap1-declare-clear-to-close",
    policyVersion: "ap-1",
    capability: "DECLARE_CLEAR_TO_CLOSE",
    operation: { factType: "CLEAR_TO_CLOSE", op: "DECLARE" },
    allowedActorClasses: ["HUMAN"],
    predicateRequirement: "REQUIRED",
    requiredPredicate: "CLEAR_TO_CLOSE",
    requiredFactClass: "DECISION",
    requiredRuleSetVersion: "rs-1",
  },
  {
    policyId: "ap1-declare-transaction-closed-cash",
    policyVersion: "ap-1",
    capability: "DECLARE_TRANSACTION_CLOSED",
    operation: { factType: "TRANSACTION_CLOSED", op: "DECLARE" },
    allowedActorClasses: ["HUMAN"],
    predicateRequirement: "REQUIRED",
    requiredPredicate: "TRANSACTION_CLOSED.CASH",
    requiredFactClass: "DECISION",
    requiredRuleSetVersion: "rs-1",
  },
  {
    policyId: "ap1-declare-transaction-closed-third-party-financed",
    policyVersion: "ap-1",
    capability: "DECLARE_TRANSACTION_CLOSED",
    operation: { factType: "TRANSACTION_CLOSED", op: "DECLARE" },
    allowedActorClasses: ["HUMAN"],
    predicateRequirement: "REQUIRED",
    requiredPredicate: "TRANSACTION_CLOSED.THIRD_PARTY_FINANCED",
    requiredFactClass: "DECISION",
    requiredRuleSetVersion: "rs-1",
  },
  {
    policyId: "ap1-declare-transaction-closed-assignment",
    policyVersion: "ap-1",
    capability: "DECLARE_TRANSACTION_CLOSED",
    operation: { factType: "TRANSACTION_CLOSED", op: "DECLARE" },
    allowedActorClasses: ["HUMAN"],
    predicateRequirement: "REQUIRED",
    requiredPredicate: "TRANSACTION_CLOSED.ASSIGNMENT",
    requiredFactClass: "DECISION",
    requiredRuleSetVersion: "rs-1",
  },
];

const BY_ID: Record<string, Record<string, AuthorizationPolicy>> = { "ap-1": Object.fromEntries(AP1.map((p) => [p.policyId, p])) };

/** Look up a policy by its stable id at a policy version. The archetype-specific TRANSACTION_CLOSED policies
 *  share a capability, so the caller (which knows the deal's archetype) selects by policyId. */
export function getPolicy(policyId: string, policyVersion = "ap-1"): AuthorizationPolicy | undefined {
  return BY_ID[policyVersion]?.[policyId];
}

export function policyIds(policyVersion = "ap-1"): string[] {
  return Object.keys(BY_ID[policyVersion] ?? {});
}
