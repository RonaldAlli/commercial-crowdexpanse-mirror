// Pure, versioned automation policy (Phase 2.0.1). Plain, organization-scoped, deterministic
// context in → structured AutomationDecision out. No Prisma, no clock, no I/O. AU-4: every job
// passes through a policy like this BEFORE the executor invokes any domain read; there is no
// alternate path that skips it. See Implementation Plan Determination 5.

import type { AutomationDecision } from "./types";

/** Bump on any behavioral change; stamped onto every job + execution and part of the idempotency key. */
export const POLICY_VERSION = 1;

/** The policy governing the 2.0.1 read-only proof job. */
export const CLOSING_READINESS_POLICY_KEY = "closing_readiness_observation";

/**
 * The deterministic context a policy evaluates. It is derived upstream from an existing
 * shared projection and the organization-scoped source lookup; the policy performs NO I/O.
 */
export type PolicyContext = {
  organizationId: string;
  /** Whether the Automation Principal holds the AUTOMATION capability (also enforced in RBAC). */
  principalAllowed: boolean;
  /** Whether the source target still exists within this organization (fail closed if not). */
  targetPresent: boolean;
  /** Whether the target is in a closing-relevant stage worth observing. */
  targetInScope: boolean;
  /** The context fingerprint captured when the job was created (if any). */
  expectedContextFingerprint?: string;
  /** The context fingerprint observed now; a mismatch means the context went stale. */
  currentContextFingerprint: string;
};

/**
 * Evaluate the closing-readiness observation policy. Deterministic and total: every context
 * yields exactly one decision. Ordering is intentional — capability first (DENY), then
 * presence/scope (NO_ACTION), then staleness (STALE_CONTEXT), else ALLOW.
 */
export function evaluatePolicy(ctx: PolicyContext): AutomationDecision {
  if (!ctx.principalAllowed) {
    return { kind: "DENY", reason: "automation principal lacks the AUTOMATION capability" };
  }
  if (!ctx.targetPresent) {
    return { kind: "NO_ACTION", reason: "source target is no longer present in the organization" };
  }
  if (!ctx.targetInScope) {
    return { kind: "NO_ACTION", reason: "source target is not in a closing-relevant stage" };
  }
  if (
    ctx.expectedContextFingerprint !== undefined &&
    ctx.expectedContextFingerprint !== ctx.currentContextFingerprint
  ) {
    return { kind: "STALE_CONTEXT", reason: "observed context changed since the job was created" };
  }
  return { kind: "ALLOW" };
}
