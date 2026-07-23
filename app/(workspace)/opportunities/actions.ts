"use server";

import { OpportunityStage } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { authorize, authorizeStageMove, checkAuthorized, checkStageMove, GENERIC_DENIAL } from "@/lib/authorize";
import { getClosingGateStatus } from "@/lib/closing-service";
import { applyStageTransition, evaluateStageTransition } from "@/lib/stage-policy-service";
import { prisma } from "@/lib/prisma";
import { stageLabel } from "@/lib/opportunity-options";
import { opportunityAttributionFromSeller } from "@/lib/acquisition-options";

export type OpportunityFormState = { error?: string } | undefined;

const VALID_STAGES = new Set<string>(Object.values(OpportunityStage));

function orNull(value: string) {
  return value.length ? value : null;
}

function intOrNull(raw: string) {
  const cleaned = raw.replace(/[,$%\s]/g, "");
  if (!cleaned) return null;
  const n = Number.parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : null;
}

function dateOrNull(raw: string) {
  if (!raw) return null;
  const d = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseOpportunity(formData: FormData) {
  const str = (key: string) => String(formData.get(key) ?? "").trim();
  return {
    title: str("title"),
    propertyId: str("propertyId"),
    sellerId: str("sellerId"),
    stage: str("stage"),
    source: str("source"),
    priority: str("priority"),
    targetCloseDate: dateOrNull(str("targetCloseDate")),
    contractValueUsd: intOrNull(str("contractValueUsd")),
    assignmentFeeUsd: intOrNull(str("assignmentFeeUsd")),
    summary: str("summary"),
  };
}

/** Validate + resolve property/seller within the caller's org. */
async function buildPayload(formData: FormData, organizationId: string, forCreate: boolean) {
  const data = parseOpportunity(formData);

  if (!data.title) return { error: "Opportunity title is required." } as const;
  if (!data.propertyId) return { error: "A property is required." } as const;

  const property = await prisma.property.findFirst({
    where: { id: data.propertyId, organizationId },
    select: { id: true },
  });
  if (!property) return { error: "Selected property was not found in your organization." } as const;

  let sellerId: string | null = null;
  if (data.sellerId) {
    const seller = await prisma.seller.findFirst({
      where: { id: data.sellerId, organizationId },
      select: { id: true },
    });
    if (!seller) return { error: "Selected seller was not found in your organization." } as const;
    sellerId = seller.id;
  }

  // Stage is required on create (defaults to LEAD if absent); on edit an invalid
  // value is rejected rather than silently reset.
  let stage: OpportunityStage;
  if (data.stage) {
    if (!VALID_STAGES.has(data.stage)) return { error: "Select a valid pipeline stage." } as const;
    stage = data.stage as OpportunityStage;
  } else if (forCreate) {
    stage = OpportunityStage.LEAD;
  } else {
    return { error: "Select a valid pipeline stage." } as const;
  }

  return {
    payload: {
      title: data.title,
      propertyId: property.id,
      sellerId,
      stage,
      source: orNull(data.source),
      priority: orNull(data.priority),
      targetCloseDate: data.targetCloseDate,
      contractValueUsd: data.contractValueUsd,
      assignmentFeeUsd: data.assignmentFeeUsd,
      summary: orNull(data.summary),
    },
  } as const;
}

export async function createOpportunity(
  _prev: OpportunityFormState,
  formData: FormData,
): Promise<OpportunityFormState> {
  const user = await requireUser();
  if (!(await checkAuthorized(user, "CREATE", "OPPORTUNITY"))) return { error: GENERIC_DENIAL };
  const result = await buildPayload(formData, user.organizationId, true);
  if ("error" in result) return { error: result.error };

  // Attribution Rule 1 (retain, don't join): stamp the originating lead's acquisition attribution
  // onto the opportunity AT CREATION, copied by value. It is immutable thereafter — updateOpportunity
  // never touches these fields, so the opportunity permanently records WHY it exists even if the
  // seller is later re-channeled, unlinked, or deleted (AC-ATTR-5).
  const seller = result.payload.sellerId
    ? await prisma.seller.findFirst({
        where: { id: result.payload.sellerId, organizationId: user.organizationId },
        select: { acquisitionChannel: true, acquisitionCampaign: true, acquisitionEventKey: true },
      })
    : null;
  const attribution = opportunityAttributionFromSeller(seller);

  const opportunity = await prisma.opportunity.create({
    data: { organizationId: user.organizationId, ...result.payload, ...attribution },
  });

  await prisma.activityLog.create({
    data: {
      organizationId: user.organizationId,
      opportunityId: opportunity.id,
      propertyId: opportunity.propertyId,
      sellerId: opportunity.sellerId,
      actorId: user.id,
      eventType: "opportunity.created",
      eventLabel: `Opportunity created: ${opportunity.title}`,
      eventBody: `Stage: ${stageLabel(opportunity.stage)}`,
    },
  });

  revalidatePath("/opportunities");
  revalidatePath("/dashboard");
  redirect(`/opportunities/${opportunity.id}`);
}

export async function updateOpportunity(
  id: string,
  _prev: OpportunityFormState,
  formData: FormData,
): Promise<OpportunityFormState> {
  const user = await requireUser();
  if (!(await checkAuthorized(user, "UPDATE", "OPPORTUNITY", { targetId: id, opportunityId: id }))) {
    return { error: GENERIC_DENIAL };
  }

  const existing = await prisma.opportunity.findFirst({
    where: { id, organizationId: user.organizationId },
  });
  if (!existing) return { error: "Opportunity not found." };

  const result = await buildPayload(formData, user.organizationId, false);
  if ("error" in result) return { error: result.error };

  // Stage is a field with its own permission (segment ownership). A stage change
  // the caller isn't allowed to make rejects the ENTIRE update — no partial save.
  if (existing.stage !== result.payload.stage) {
    const allowed = await checkStageMove(user, existing.stage, result.payload.stage, {
      opportunityId: existing.id,
      sellerId: existing.sellerId ?? undefined,
      propertyId: existing.propertyId,
    });
    if (!allowed) return { error: GENERIC_DENIAL };
  }

  const opportunity = await prisma.opportunity.update({
    where: { id: existing.id },
    data: result.payload,
  });

  const stageChanged = existing.stage !== opportunity.stage;

  // Non-stage change detection so we don't log a noisy "updated" on a pure move.
  const nonStageChanged =
    existing.title !== opportunity.title ||
    existing.propertyId !== opportunity.propertyId ||
    existing.sellerId !== opportunity.sellerId ||
    existing.source !== opportunity.source ||
    existing.priority !== opportunity.priority ||
    existing.contractValueUsd !== opportunity.contractValueUsd ||
    existing.assignmentFeeUsd !== opportunity.assignmentFeeUsd ||
    existing.summary !== opportunity.summary ||
    existing.targetCloseDate?.getTime() !== opportunity.targetCloseDate?.getTime();

  if (stageChanged) {
    await prisma.activityLog.create({
      data: {
        organizationId: user.organizationId,
        opportunityId: opportunity.id,
        propertyId: opportunity.propertyId,
        sellerId: opportunity.sellerId,
        actorId: user.id,
        eventType: "opportunity.stage_changed",
        eventLabel: `Stage: ${stageLabel(existing.stage)} → ${stageLabel(opportunity.stage)}`,
      },
    });
  }

  if (nonStageChanged) {
    await prisma.activityLog.create({
      data: {
        organizationId: user.organizationId,
        opportunityId: opportunity.id,
        propertyId: opportunity.propertyId,
        sellerId: opportunity.sellerId,
        actorId: user.id,
        eventType: "opportunity.updated",
        eventLabel: `Opportunity updated: ${opportunity.title}`,
      },
    });
  }

  revalidatePath("/opportunities");
  revalidatePath(`/opportunities/${opportunity.id}`);
  redirect(`/opportunities/${opportunity.id}`);
}

/**
 * Inline stage move (pipeline board / detail). Logs opportunity.stage_changed only.
 * Returns an explanatory `{ error }` when the closing gate blocks a PAID move so the
 * enforcement path itself carries the reason; a bare `return` (undefined) otherwise.
 */
/**
 * Read-only policy evaluation for the UI (the "UI → evaluate → decide" seam): tells the stage-move
 * control whether a target stage is ALLOW / REQUIRES_ATTESTATION / DENY and what it needs, so it can
 * prompt for an attestation reason before committing. Enforcement still happens server-side in
 * moveOpportunityStage; this is advisory for UX. Org-scoped.
 */
export type StageMoveEvaluation = {
  outcome: "ALLOW" | "REQUIRES_ATTESTATION" | "DENY";
  stageLabel: string;
  missingTruth: string[];
  missingArtifacts: string[];
  message: string;
  suggestedAction: string;
  canOverride: boolean;
};
export async function evaluateStageMove(id: string, stage: string): Promise<StageMoveEvaluation | { error: string }> {
  const user = await requireUser();
  if (!VALID_STAGES.has(stage)) return { error: "Invalid pipeline stage." };
  const existing = await prisma.opportunity.findFirst({ where: { id, organizationId: user.organizationId }, select: { id: true } });
  if (!existing) return { error: GENERIC_DENIAL };
  const r = await evaluateStageTransition(user.organizationId, id, stage as OpportunityStage);
  return {
    outcome: r.outcome,
    stageLabel: stageLabel(stage),
    missingTruth: r.missingTruth,
    missingArtifacts: r.missingArtifacts,
    message: r.message,
    suggestedAction: r.suggestedAction,
    canOverride: r.canOverride,
  };
}

export async function moveOpportunityStage(id: string, formData: FormData): Promise<{ error: string } | undefined> {
  const user = await requireUser();
  const nextStage = String(formData.get("stage") ?? "").trim();

  if (!VALID_STAGES.has(nextStage)) {
    return { error: "Invalid pipeline stage." }; // OPP-4: surface the error, never a silent no-op.
  }

  const existing = await prisma.opportunity.findFirst({
    where: { id, organizationId: user.organizationId },
  });
  if (!existing || existing.stage === nextStage) {
    return;
  }

  // Pipeline movement is authorized by BOTH current and target stage (workflow
  // segment ownership), not the destination alone.
  await authorizeStageMove(user, existing.stage, nextStage as OpportunityStage, {
    opportunityId: existing.id,
    sellerId: existing.sellerId ?? undefined,
    propertyId: existing.propertyId,
  });

  // Closing gate (v1.4, CC-2): an opportunity cannot reach PAID until its closing
  // checklist is satisfied. This COMPOSES WITH the role gate above (never replaces it)
  // and is enforced server-side; if not ready the move is a no-op — but we return the
  // explanatory reason (which required items remain) rather than failing silently.
  // Human workflow only — it never touches the underwriting engine.
  if (nextStage === "PAID") {
    const gate = await getClosingGateStatus(user.organizationId, existing.id);
    if (!gate.ready) {
      revalidatePath(`/opportunities/${existing.id}`);
      return { error: gate.message ?? "The closing checklist must be satisfied before moving to Paid." };
    }
  }

  // Stage Policy Evaluation (semantic contract): a validated stage requires its authoritative truth
  // to exist — or a controlled attestation (reason recorded in ActivityLog) for imported/mid-lifecycle
  // deals. This COMPOSES WITH the role gate and PAID gate above (never replaces them). Persistence +
  // ActivityLog live in the reusable seam so imports/Automation/API get the identical policy.
  const result = await applyStageTransition({
    organizationId: user.organizationId,
    actorId: user.id,
    opportunity: { id: existing.id, stage: existing.stage, propertyId: existing.propertyId, sellerId: existing.sellerId },
    targetStage: nextStage as OpportunityStage,
    attestationReason: (formData.get("attestationReason") as string | null) ?? null,
  });
  if (!result.ok) {
    revalidatePath(`/opportunities/${existing.id}`);
    return { error: result.error ?? "Unable to change the pipeline stage." };
  }

  revalidatePath("/opportunities");
  revalidatePath(`/opportunities/${existing.id}`);
  revalidatePath("/dashboard");
}

export async function deleteOpportunity(id: string) {
  const user = await requireUser();
  await authorize(user, "DELETE", "OPPORTUNITY", { targetId: id, opportunityId: id });

  const existing = await prisma.opportunity.findFirst({
    where: { id, organizationId: user.organizationId },
  });
  if (!existing) {
    redirect("/opportunities");
  }

  await prisma.opportunity.delete({ where: { id: existing.id } });

  await prisma.activityLog.create({
    data: {
      organizationId: user.organizationId,
      actorId: user.id,
      eventType: "opportunity.deleted",
      eventLabel: `Opportunity deleted: ${existing.title}`,
    },
  });

  revalidatePath("/opportunities");
  revalidatePath("/dashboard");
  redirect("/opportunities");
}
