// BE-2 Step 1 — Deal aggregate DB orchestration (ADDITIVE, INERT). A Deal is DERIVED from the
// canonical "Deal Controlled" event (current implementation: the CONTRACT_EXECUTED decision fact).
// Creation is org-scoped, idempotent (opportunityId @unique + P2002 race-safe), and REFUSED without
// an active control fact. Wired to no live path in Step 1. Business rules / the Deal↔Transaction
// boundary are authoritative in docs/business/evolution/be-2/DECISIONS.md — not restated here.
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { activeFacts } from "@/lib/pipeline-facts/service";
import { selectControlFact, controlledAtOf, BUSINESS_ARCHITECTURE_VERSION } from "@/lib/deal";

export { CONTROL_FACT_TYPE, BUSINESS_ARCHITECTURE_VERSION } from "@/lib/deal";

/** The single active CONTRACT_EXECUTED (Deal Controlled) DECISION fact for an Opportunity, or null. */
export async function activeControlFact(organizationId: string, opportunityId: string) {
  return selectControlFact(await activeFacts(organizationId, opportunityId));
}

/** Read the Opportunity's Deal (or null) without creating one. */
export async function getDeal(organizationId: string, opportunityId: string) {
  return prisma.deal.findFirst({ where: { opportunityId, organizationId } });
}

/**
 * Idempotently derive the Deal for an Opportunity that has obtained contractual control. A second
 * call returns the existing Deal unchanged (opportunityId @unique + P2002-race-safe). REFUSES when no
 * active control fact exists — a Deal is never created without the canonical "Deal Controlled" event.
 * ADDITIVE: writes only a `deals` row (+ a best-effort ActivityLog); never mutates the Opportunity or
 * any other record, and is wired to no live path in Step 1.
 */
export async function ensureDeal(organizationId: string, opportunityId: string, actorUserId?: string | null) {
  const existing = await prisma.deal.findFirst({ where: { opportunityId, organizationId } });
  if (existing) return existing;

  const opportunity = await prisma.opportunity.findFirst({
    where: { id: opportunityId, organizationId },
    select: { id: true },
  });
  if (!opportunity) throw new Error("Opportunity not found");

  const control = await activeControlFact(organizationId, opportunityId);
  if (!control) {
    throw new Error("No active control fact (CONTRACT_EXECUTED) — a Deal requires the canonical Deal Controlled event");
  }

  try {
    const deal = await prisma.deal.create({
      data: {
        organizationId,
        opportunityId,
        controlFactId: control.id,
        controlledAt: controlledAtOf(control),
        businessArchitectureVersion: BUSINESS_ARCHITECTURE_VERSION,
      },
    });
    if (actorUserId) {
      await prisma.activityLog
        .create({
          data: {
            organizationId,
            opportunityId,
            actorId: actorUserId,
            eventType: "deal.controlled",
            eventLabel: "Deal controlled",
            eventBody: `Deal derived from control fact ${control.id}`,
          },
        })
        .catch(() => {});
    }
    return deal;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const won = await prisma.deal.findFirst({ where: { opportunityId, organizationId } });
      if (won) return won;
    }
    throw err;
  }
}
