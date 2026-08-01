// Forecasting Backend Authority G-2 — the Expected Payment Date WRITE authority (owned by Opportunity, FD-5).
// Per State Transition Authority, the explicit override is only set through this service, which persists the value
// and records an ActivityLog audit. Setting `null` clears the override and reverts to the derived default
// (targetCloseDate). No UI is wired here; this is the authoritative service future write paths call.

import { prisma } from "@/lib/prisma";

export type PaymentDateResult = { ok: true } | { error: string };

/**
 * Set or clear an opportunity's EXPLICIT expected payment date (org-scoped). `date = null` clears the override
 * (the effective value reverts to the derived default, targetCloseDate — see `effectiveExpectedPaymentDate`).
 */
export async function setExpectedPaymentDate(
  organizationId: string,
  opportunityId: string,
  actorId: string,
  date: Date | null,
): Promise<PaymentDateResult> {
  const opp = await prisma.opportunity.findFirst({ where: { id: opportunityId, organizationId }, select: { id: true } });
  if (!opp) return { error: "Opportunity not found." };

  await prisma.opportunity.update({ where: { id: opportunityId }, data: { expectedPaymentDate: date } });

  await prisma.activityLog.create({
    data: {
      organizationId,
      opportunityId,
      actorId,
      eventType: date ? "opportunity.expected_payment_date_set" : "opportunity.expected_payment_date_cleared",
      eventLabel: date ? "Expected payment date set" : "Expected payment date cleared (reverted to target close date)",
      eventBody: date ? date.toISOString().slice(0, 10) : null,
    },
  });

  return { ok: true };
}
