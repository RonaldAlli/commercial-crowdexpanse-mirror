// Forecasting Backend Authority G-1 — the Lost/Dead WRITE authority (owned by Opportunity). Applies the pure
// transition rules, guards against marking a realized deal, persists the outcome + reason + actor + timestamp,
// and records an ActivityLog event (audited). No UI is wired here (the Forecast/UI work is a separate program) —
// this is the authoritative service the future write paths call.

import { prisma } from "@/lib/prisma";
import { decideOutcomeTransition, type OpportunityOutcome } from "@/lib/opportunity-outcome";

export type OutcomeResult = { ok: true; outcome: OpportunityOutcome } | { error: string };

const EVENT_LABEL: Record<OpportunityOutcome, string> = {
  ACTIVE: "Opportunity reactivated",
  LOST: "Opportunity marked Lost",
  DEAD: "Opportunity marked Dead",
};

/**
 * Set an opportunity's lifecycle outcome (ACTIVE / LOST / DEAD). `reason` is required to enter a terminal
 * outcome; `isAdmin` gates reactivation of a Dead deal (FD-1). Realized deals (executed assignment) cannot be
 * marked Lost/Dead. Org-scoped; returns a typed error rather than throwing on a business rejection.
 */
export async function setOpportunityOutcome(
  organizationId: string,
  opportunityId: string,
  actorId: string,
  target: OpportunityOutcome,
  reason: string | null,
  opts: { isAdmin: boolean },
): Promise<OutcomeResult> {
  const opp = await prisma.opportunity.findFirst({
    where: { id: opportunityId, organizationId },
    select: { outcome: true, assignment: { select: { status: true } } },
  });
  if (!opp) return { error: "Opportunity not found." };

  // A realized opportunity (executed assignment) is a positive terminal — it cannot be marked Lost/Dead.
  if ((target === "LOST" || target === "DEAD") && opp.assignment?.status === "EXECUTED") {
    return { error: "A realized opportunity cannot be marked Lost or Dead." };
  }

  const decision = decideOutcomeTransition({ current: opp.outcome as OpportunityOutcome, target, reason, isAdmin: opts.isAdmin });
  if (!decision.ok) return { error: decision.reason };

  const terminal = target === "LOST" || target === "DEAD";
  await prisma.opportunity.update({
    where: { id: opportunityId },
    data: {
      outcome: target,
      outcomeReason: terminal ? reason : null,
      outcomeAt: terminal ? new Date() : null,
      outcomeById: actorId,
    },
  });

  await prisma.activityLog.create({
    data: {
      organizationId,
      opportunityId,
      actorId,
      eventType: `opportunity.outcome_${target.toLowerCase()}`,
      eventLabel: EVENT_LABEL[target],
      eventBody: reason ?? null,
    },
  });

  return { ok: true, outcome: target };
}
