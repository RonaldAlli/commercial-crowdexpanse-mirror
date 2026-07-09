"use server";

import { MatchStatus, OpportunityStage } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  scoreBuyerForOpportunity,
  type MatchOpportunity,
  type MatchResult,
} from "@/lib/matching";
import { STAGE_ORDER, stageLabel } from "@/lib/opportunity-options";

export type MatchActionState = { error?: string } | undefined;

// Only buyers scoring at or above this floor (i.e. with at least one real
// dimension fit beyond mere data completeness) get a persisted BuyerMatch.
// Module-local (a "use server" file may only export async functions).
const MATCH_THRESHOLD = 25;

const VALID_STATUSES = new Set<string>(Object.values(MatchStatus));

/** Deterministic, human-readable thesis built from the scorer's reasons — no AI. */
function buildThesis(result: MatchResult): string {
  const positives = result.reasons.filter(
    (r) => !r.includes("(+0)") && !r.startsWith("Data completeness"),
  );
  const base = positives.length
    ? positives.join(" ")
    : "No strong fit on asset type, location, or price.";
  const caveat = result.warnings.length ? ` Caveats: ${result.warnings.join(" ")}` : "";
  return (base + caveat).slice(0, 1000);
}

/**
 * Score every buyer in the caller's organization against one opportunity and
 * upsert a BuyerMatch for each buyer that clears MATCH_THRESHOLD. Existing
 * matches are refreshed (score + thesis) while preserving their human-set
 * status; new ones are created as NEW. Deterministic — no AI.
 */
export async function generateMatches(
  opportunityId: string,
): Promise<{ created: number; updated: number; considered: number } | { error: string }> {
  const user = await requireUser();

  const opportunity = await prisma.opportunity.findFirst({
    where: { id: opportunityId, organizationId: user.organizationId },
    include: {
      property: {
        select: { assetType: true, state: true, estimatedValueUsd: true, askingPriceUsd: true },
      },
    },
  });
  if (!opportunity) return { error: "Opportunity not found." };

  const oppCriteria: MatchOpportunity = {
    assetType: opportunity.property?.assetType ?? null,
    state: opportunity.property?.state ?? null,
    valueUsd:
      opportunity.contractValueUsd ??
      opportunity.property?.estimatedValueUsd ??
      opportunity.property?.askingPriceUsd ??
      null,
  };

  const buyers = await prisma.buyer.findMany({
    where: { organizationId: user.organizationId },
    select: {
      id: true,
      targetAssetTypes: true,
      targetStates: true,
      minimumPurchaseUsd: true,
      maximumPurchaseUsd: true,
    },
  });

  // Pre-existing matches for this opportunity — used only for created-vs-updated
  // accounting. The write itself is an atomic upsert on the
  // (opportunityId, buyerId) unique constraint, so no duplicate can ever be created.
  const existingBuyerIds = new Set(
    (
      await prisma.buyerMatch.findMany({
        where: { opportunityId: opportunity.id, organizationId: user.organizationId },
        select: { buyerId: true },
      })
    ).map((m) => m.buyerId),
  );

  let created = 0;
  let updated = 0;

  for (const buyer of buyers) {
    const result = scoreBuyerForOpportunity(buyer, oppCriteria);
    if (result.score < MATCH_THRESHOLD) continue;

    const thesis = buildThesis(result);

    await prisma.buyerMatch.upsert({
      where: { opportunityId_buyerId: { opportunityId: opportunity.id, buyerId: buyer.id } },
      update: { score: result.score, thesis },
      create: {
        organizationId: user.organizationId,
        opportunityId: opportunity.id,
        buyerId: buyer.id,
        status: MatchStatus.NEW,
        score: result.score,
        thesis,
      },
    });

    if (existingBuyerIds.has(buyer.id)) updated += 1;
    else created += 1;
  }

  await prisma.activityLog.create({
    data: {
      organizationId: user.organizationId,
      opportunityId: opportunity.id,
      actorId: user.id,
      eventType: "buyer_match.generated",
      eventLabel: `Generated buyer matches for ${opportunity.title}`,
      eventBody: `${created} new, ${updated} refreshed of ${buyers.length} buyers considered.`,
    },
  });

  revalidatePath(`/opportunities/${opportunity.id}`);
  revalidatePath("/matches");
  return { created, updated, considered: buyers.length };
}

/** Advance a match's status (NEW → REVIEWING → SENT → DECLINED/CONFIRMED). */
export async function updateMatchStatus(
  matchId: string,
  status: string,
): Promise<MatchActionState> {
  const user = await requireUser();

  if (!VALID_STATUSES.has(status)) return { error: "Invalid match status." };

  const existing = await prisma.buyerMatch.findFirst({
    where: { id: matchId, organizationId: user.organizationId },
    include: { buyer: { select: { name: true } } },
  });
  if (!existing) return { error: "Match not found." };

  if (existing.status === status) return undefined;

  await prisma.buyerMatch.update({
    where: { id: existing.id },
    data: { status: status as MatchStatus },
  });

  await prisma.activityLog.create({
    data: {
      organizationId: user.organizationId,
      opportunityId: existing.opportunityId,
      buyerId: existing.buyerId,
      actorId: user.id,
      eventType: "buyer_match.status_changed",
      eventLabel: `Buyer match ${existing.buyer.name}: ${existing.status} → ${status}`,
    },
  });

  // Confirming a buyer advances the opportunity to BUYER_MATCHED — but only
  // forward: never downgrade an opportunity already at or past that stage.
  if (status === MatchStatus.CONFIRMED) {
    const opp = await prisma.opportunity.findFirst({
      where: { id: existing.opportunityId, organizationId: user.organizationId },
      select: { id: true, stage: true, propertyId: true, sellerId: true },
    });
    if (opp && STAGE_ORDER.indexOf(opp.stage) < STAGE_ORDER.indexOf(OpportunityStage.BUYER_MATCHED)) {
      await prisma.opportunity.update({
        where: { id: opp.id },
        data: { stage: OpportunityStage.BUYER_MATCHED },
      });
      await prisma.activityLog.create({
        data: {
          organizationId: user.organizationId,
          opportunityId: opp.id,
          propertyId: opp.propertyId,
          sellerId: opp.sellerId,
          actorId: user.id,
          eventType: "opportunity.stage_changed",
          eventLabel: `Stage: ${stageLabel(opp.stage)} → ${stageLabel(OpportunityStage.BUYER_MATCHED)}`,
          eventBody: `Advanced automatically on confirmed buyer match: ${existing.buyer.name}`,
        },
      });
      revalidatePath("/opportunities");
      revalidatePath("/dashboard");
    }
  }

  revalidatePath(`/opportunities/${existing.opportunityId}`);
  revalidatePath("/matches");
  return undefined;
}

/** Remove a match. */
export async function deleteMatch(matchId: string): Promise<MatchActionState> {
  const user = await requireUser();

  const existing = await prisma.buyerMatch.findFirst({
    where: { id: matchId, organizationId: user.organizationId },
    include: { buyer: { select: { name: true } } },
  });
  if (!existing) return { error: "Match not found." };

  await prisma.buyerMatch.delete({ where: { id: existing.id } });

  await prisma.activityLog.create({
    data: {
      organizationId: user.organizationId,
      opportunityId: existing.opportunityId,
      buyerId: existing.buyerId,
      actorId: user.id,
      eventType: "buyer_match.deleted",
      eventLabel: `Buyer match removed: ${existing.buyer.name}`,
    },
  });

  revalidatePath(`/opportunities/${existing.opportunityId}`);
  revalidatePath("/matches");
  return undefined;
}
