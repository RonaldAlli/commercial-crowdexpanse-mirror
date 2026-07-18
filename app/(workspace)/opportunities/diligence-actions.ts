"use server";

import { OpportunityDiligenceStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { authorize, checkAuthorized, GENERIC_DENIAL } from "@/lib/authorize";
import { diligenceStatusLabel } from "@/lib/opportunity-diligence";
import { ensureOpportunityDiligence } from "@/lib/opportunity-diligence-service";
import { prisma } from "@/lib/prisma";
import { safeInternalPath } from "@/lib/safe-redirect";

const DILIGENCE_STATUSES = new Set<string>(Object.values(OpportunityDiligenceStatus));

function parseStatus(raw: string): OpportunityDiligenceStatus {
  return (DILIGENCE_STATUSES.has(raw) ? raw : OpportunityDiligenceStatus.NOT_REQUESTED) as OpportunityDiligenceStatus;
}

function parseDate(raw: string) {
  if (!raw) return null;
  const value = new Date(`${raw}T12:00:00.000Z`);
  return Number.isNaN(value.getTime()) ? null : value;
}

export async function updateDiligenceItemAction(
  opportunityId: string,
  itemId: string,
  formData: FormData,
): Promise<void> {
  const user = await requireUser();
  if (!(await checkAuthorized(user, "UPDATE", "OPPORTUNITY", { targetId: opportunityId, opportunityId }))) {
    throw new Error(GENERIC_DENIAL);
  }

  await ensureOpportunityDiligence(user.organizationId, opportunityId);

  const item = await prisma.opportunityDiligenceItem.findFirst({
    where: { id: itemId, opportunityId, organizationId: user.organizationId },
    select: { id: true, label: true },
  });
  if (!item) throw new Error("Diligence item not found.");

  const status = parseStatus(String(formData.get("status") ?? "").trim());
  const requestedAtInput = parseDate(String(formData.get("requestedAt") ?? "").trim());
  const receivedAtInput = parseDate(String(formData.get("receivedAt") ?? "").trim());
  const reviewedAtInput = parseDate(String(formData.get("reviewedAt") ?? "").trim());
  const notes = String(formData.get("notes") ?? "").trim();
  const documentId = String(formData.get("documentId") ?? "").trim() || null;
  const redirectTo = safeInternalPath(formData.get("redirectTo"), `/opportunities/${opportunityId}`);

  const existing = await prisma.opportunityDiligenceItem.findUnique({ where: { id: item.id } });
  if (!existing) throw new Error("Diligence item not found.");

  let requestedAt = requestedAtInput ?? existing.requestedAt;
  let receivedAt = receivedAtInput ?? existing.receivedAt;
  let reviewedAt = reviewedAtInput ?? existing.reviewedAt;

  if (status === OpportunityDiligenceStatus.NOT_REQUESTED || status === OpportunityDiligenceStatus.NOT_APPLICABLE) {
    requestedAt = null;
    receivedAt = null;
    reviewedAt = null;
  } else if (status === OpportunityDiligenceStatus.REQUESTED) {
    requestedAt = requestedAt ?? new Date();
    receivedAt = null;
    reviewedAt = null;
  } else if (status === OpportunityDiligenceStatus.RECEIVED) {
    requestedAt = requestedAt ?? existing.requestedAt ?? new Date();
    receivedAt = receivedAt ?? new Date();
    reviewedAt = null;
  } else if (status === OpportunityDiligenceStatus.REVIEWED) {
    requestedAt = requestedAt ?? existing.requestedAt ?? new Date();
    receivedAt = receivedAt ?? existing.receivedAt ?? new Date();
    reviewedAt = reviewedAt ?? new Date();
  } else if (status === OpportunityDiligenceStatus.MISSING) {
    requestedAt = requestedAt ?? existing.requestedAt ?? new Date();
  }

  await prisma.opportunityDiligenceItem.update({
    where: { id: item.id },
    data: {
      status,
      requestedAt,
      receivedAt,
      reviewedAt,
      notes: notes || null,
      documentId,
    },
  });

  await prisma.activityLog.create({
    data: {
      organizationId: user.organizationId,
      opportunityId,
      actorId: user.id,
      eventType: "opportunity.diligence_updated",
      eventLabel: `Diligence ${diligenceStatusLabel(status)}: ${item.label}`,
      eventBody: notes || null,
    },
  });

  revalidatePath("/opportunities");
  revalidatePath(`/opportunities/${opportunityId}`);
  redirect(redirectTo);
}

export async function seedDiligenceAction(opportunityId: string) {
  const user = await requireUser();
  await authorize(user, "UPDATE", "OPPORTUNITY", { targetId: opportunityId, opportunityId });
  await ensureOpportunityDiligence(user.organizationId, opportunityId);
  revalidatePath(`/opportunities/${opportunityId}`);
  redirect(`/opportunities/${opportunityId}`);
}
