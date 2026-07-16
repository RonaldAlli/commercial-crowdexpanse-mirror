// The Automation Principal (Phase 2.0.1, Commit 5). Automation acts as an explicit AUTOMATION
// identity — NEVER a user (AU-3). The principal carries organization + policy + correlation/
// causation context so every execution and every emitted ActivityLog row is attributable to
// automation without impersonating anyone. Pure; no side effects on import.

import type { AutomationJob } from "@prisma/client";
import type { AutomationPrincipal } from "./types";

/** The stable, non-user principal key for an automation type (e.g. "automation:closing_readiness_observation"). */
export function automationPrincipalKey(automationType: string): string {
  return `automation:${automationType}`;
}

/** Build the Automation Principal for a job. `key` is never a user id. */
export function automationPrincipalForJob(job: AutomationJob): AutomationPrincipal {
  return {
    type: "AUTOMATION",
    key: automationPrincipalKey(job.automationType),
    organizationId: job.organizationId,
    policyKey: job.policyKey,
    policyVersion: job.policyVersion,
    correlationId: job.correlationId ?? undefined,
    causationId: job.causationId ?? undefined,
  };
}
