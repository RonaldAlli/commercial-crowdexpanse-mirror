// Server module (uses Prisma). No `import "server-only"` — matches lib/closing-service.ts so the
// integration harness can import it directly; Prisma makes it server-only in practice.
import type { OpportunityStage } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { stageLabel } from "@/lib/opportunity-options";
import {
  evaluateStageRequirements,
  type StageTransitionFacts,
  type StagePolicyResult,
} from "@/lib/stage-policy";

/** Gather the authoritative truth the stage rules read — org-scoped. Reusable by any caller. */
export async function getStageTransitionFacts(
  organizationId: string,
  opportunityId: string,
): Promise<StageTransitionFacts> {
  const [diligence, contractDoc] = await Promise.all([
    prisma.opportunityDiligenceItem.findMany({ where: { organizationId, opportunityId }, select: { key: true, status: true } }),
    prisma.document.findFirst({ where: { organizationId, opportunityId, documentType: "CONTRACT" }, select: { id: true } }),
  ]);
  const diligenceByKey: Record<string, string> = {};
  for (const d of diligence) diligenceByKey[d.key] = d.status;
  return { diligenceByKey, hasExecutedContractDocument: contractDoc !== null };
}

/** The reusable policy evaluation: gather org-scoped facts + run the pure engine. */
export async function evaluateStageTransition(
  organizationId: string,
  opportunityId: string,
  target: OpportunityStage,
): Promise<StagePolicyResult> {
  const facts = await getStageTransitionFacts(organizationId, opportunityId);
  return evaluateStageRequirements(target, facts);
}

export type ApplyStageResult = { ok: boolean; decision: StagePolicyResult["decision"]; error?: string; attested: boolean };

/**
 * Apply a stage transition AFTER the caller's own authorization (role gate, PAID gate, etc.). This
 * enforces the semantic-contract truth policy, records a controlled attestation when a validated
 * stage is entered without its backing truth (imported/mid-lifecycle), persists the stage, and writes
 * the ActivityLog(s) — all in one transaction. Reused by the UI action; ready for imports/Automation/API.
 *
 * - ALLOW → persist + `opportunity.stage_changed`.
 * - REQUIRES_ATTESTATION + reason → persist + `stage_changed` + `opportunity.stage_attested`
 *   (reason + missing truth + actor + timestamp via ActivityLog — no schema change).
 * - REQUIRES_ATTESTATION without reason → rejected with an explanatory error (nothing persisted).
 * - DENY → rejected (nothing persisted).
 */
export async function applyStageTransition(args: {
  organizationId: string;
  actorId: string | null;
  opportunity: { id: string; stage: OpportunityStage; propertyId: string; sellerId: string | null };
  targetStage: OpportunityStage;
  attestationReason?: string | null;
}): Promise<ApplyStageResult> {
  const { organizationId, actorId, opportunity, targetStage } = args;
  const reason = (args.attestationReason ?? "").trim();
  const policy = await evaluateStageTransition(organizationId, opportunity.id, targetStage);

  if (policy.decision === "DENY") {
    return { ok: false, decision: "DENY", attested: false, error: policy.explanation || `Cannot move to ${stageLabel(targetStage)}.` };
  }

  let attested = false;
  if (policy.decision === "REQUIRES_ATTESTATION") {
    if (!reason) {
      return {
        ok: false,
        decision: "REQUIRES_ATTESTATION",
        attested: false,
        error: `${policy.explanation} To record this as an imported/mid-lifecycle exception, provide an attestation reason (${policy.requiredArtifacts.join("; ")}).`,
      };
    }
    attested = true;
  }

  await prisma.$transaction(async (tx) => {
    await tx.opportunity.update({ where: { id: opportunity.id }, data: { stage: targetStage } });
    await tx.activityLog.create({
      data: {
        organizationId,
        opportunityId: opportunity.id,
        propertyId: opportunity.propertyId,
        sellerId: opportunity.sellerId,
        actorId,
        eventType: "opportunity.stage_changed",
        eventLabel: `Stage: ${stageLabel(opportunity.stage)} → ${stageLabel(targetStage)}`,
      },
    });
    if (attested) {
      await tx.activityLog.create({
        data: {
          organizationId,
          opportunityId: opportunity.id,
          propertyId: opportunity.propertyId,
          sellerId: opportunity.sellerId,
          actorId,
          eventType: "opportunity.stage_attested",
          eventLabel: `Attested ${stageLabel(targetStage)} without ${policy.requiredArtifacts.join("; ")}`,
          eventBody: `Reason: ${reason} | Missing: ${policy.missing.join(", ")} | Policy: ${policy.policy}`,
        },
      });
    }
  });

  return { ok: true, decision: policy.decision, attested };
}
