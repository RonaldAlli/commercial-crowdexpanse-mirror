// Pure type + constant contracts for the Automation domain (Version 2.0, Phase 2.0.1).
// No Prisma, no clock, no I/O — safe to import anywhere and unit-test directly, exactly
// like lib/permissions.ts. The persisted enums live in prisma/schema.prisma; the domain
// types here mirror them and add the structured decision + principal shapes the engine
// reasons over. Design authority: VERSION_2_0_PHASE_2_0_1_IMPLEMENTATION_PLAN.md (D1–D12).

import type {
  AutomationJobStatus,
  AutomationExecutionOutcome,
  AutomationFailureClass,
  AutomationPolicyDecision,
  AutomationTriggerType,
  AutomationPrincipalType,
} from "@prisma/client";

export type {
  AutomationJobStatus,
  AutomationExecutionOutcome,
  AutomationFailureClass,
  AutomationPolicyDecision,
  AutomationTriggerType,
  AutomationPrincipalType,
};

/**
 * The structured decision a policy returns (Determination 5). This is NOT the persisted
 * Prisma enum — it carries a human-readable reason. `.kind` is the projection stored on
 * the execution as `AutomationPolicyDecision`. REQUIRE_APPROVAL is reserved; the 2.0.1
 * read-only proof policy never returns it (no approval workflow exists in this phase).
 */
export type AutomationDecision =
  | { kind: "ALLOW" }
  | { kind: "DENY"; reason: string }
  | { kind: "REQUIRE_APPROVAL"; reason: string }
  | { kind: "NO_ACTION"; reason: string }
  | { kind: "STALE_CONTEXT"; reason: string };

export const DECISION_KINDS = [
  "ALLOW",
  "DENY",
  "REQUIRE_APPROVAL",
  "NO_ACTION",
  "STALE_CONTEXT",
] as const;

/** The persisted policy-decision projection of a structured decision. */
export function decisionToPersisted(d: AutomationDecision): AutomationPolicyDecision {
  return d.kind;
}

/**
 * The Automation Principal — the identity automation acts as. It is ALWAYS type
 * AUTOMATION and NEVER a user id (AU-3). It carries organization + policy + correlation
 * context so every execution and every emitted ActivityLog row is explicitly attributable.
 */
export type AutomationPrincipal = {
  type: Extract<AutomationPrincipalType, "AUTOMATION">;
  key: string; // stable automation identity (never a user id)
  organizationId: string;
  policyKey: string;
  policyVersion: number;
  correlationId?: string;
  causationId?: string;
};

/** The compound idempotency identity of a single job occurrence (Determination 4). */
export type JobIdentity = {
  organizationId: string;
  automationType: string;
  sourceType: string;
  sourceId: string;
  policyVersion: number;
  occurrenceKey: string;
};

// ── Tuning constants (pure; wall-clock is always injected by callers) ────────────
export const LEASE_TTL_MS = 60_000; // a claimed job's lease before the reaper may recover it
export const BACKOFF_BASE_MS = 5_000;
export const BACKOFF_CAP_MS = 300_000; // 5-minute cap on exponential retry backoff
export const DEFAULT_MAX_ATTEMPTS = 5;
export const CLAIM_BATCH = 10; // bounded claim batch size
export const IDLE_BACKOFF_MS = 5_000; // executor idle poll interval when the queue is empty
export const DEGRADED_BACKOFF_MS = 30_000; // executor backoff when infrastructure is degraded
