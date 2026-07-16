// Automation → ActivityLog linkage (Phase 2.0.1, Commit 5). Emits a business-relevant,
// AUTOMATION-attributed ActivityLog row linked to the execution that produced it. Best-effort
// and post-commit (the platform's universal audit convention) — a logging failure NEVER fails
// the job or touches the immutable execution ledger.
//
// Two-ledger model (AU-8): AutomationExecution is the operational ledger (every attempt);
// ActivityLog is the business ledger (only business-visible observations). Queue claims, lease
// renewals, retries, heartbeats, polling, and executor start/stop are NEVER written here — they
// live in AutomationExecution and operational logs. The link direction is
// ActivityLog.automationExecutionId → AutomationExecution, so the execution is never mutated.

import type { AutomationExecution } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type AutomationActivityInput = {
  organizationId: string;
  execution: Pick<AutomationExecution, "id" | "organizationId">;
  /** Must live in the "automation.*" namespace (honest, forward-compatible with the Timeline). */
  eventType: string;
  eventLabel: string;
  eventBody?: string | null;
  opportunityId?: string | null;
};

/**
 * Best-effort AUTOMATION-attributed ActivityLog write. `actorId` is always null (automation is
 * never a user); `actorType` is AUTOMATION; `automationExecutionId` links to the execution.
 * Fails closed on a cross-org execution link. Returns the new row id, or null on any failure.
 */
export async function recordAutomationActivity(input: AutomationActivityInput): Promise<string | null> {
  if (input.execution.organizationId !== input.organizationId) return null; // no cross-org linkage
  try {
    const row = await prisma.activityLog.create({
      data: {
        organizationId: input.organizationId,
        opportunityId: input.opportunityId ?? null,
        actorId: null, // AU-3: automation never impersonates a user
        actorType: "AUTOMATION",
        automationExecutionId: input.execution.id,
        eventType: input.eventType,
        eventLabel: input.eventLabel,
        eventBody: input.eventBody ?? null,
      },
    });
    return row.id;
  } catch {
    return null; // best-effort — never throws
  }
}
