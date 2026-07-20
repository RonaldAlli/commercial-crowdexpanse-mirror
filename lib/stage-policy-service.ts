// Server module (uses Prisma). No `import "server-only"` — matches lib/closing-service.ts so the
// integration harness can import it directly; Prisma makes it server-only in practice.
import type { OpportunityStage } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { stageLabel } from "@/lib/opportunity-options";
import {
  evaluateStageRequirements,
  STAGE_RULES,
  type StageRuleset,
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
  rules: StageRuleset = STAGE_RULES,
): Promise<StagePolicyResult> {
  const facts = await getStageTransitionFacts(organizationId, opportunityId);
  return evaluateStageRequirements(target, facts, rules);
}

export type ApplyStageResult = { ok: boolean; outcome: StagePolicyResult["outcome"]; error?: string; attested: boolean; result: StagePolicyResult };

/**
 * Apply a stage transition AFTER the caller's own authorization (role gate, PAID gate, etc.). Enforces
 * the semantic-contract truth policy, records a controlled attestation when a validated stage is entered
 * without its backing truth, persists the stage, and writes the ActivityLog(s) — one transaction.
 * Reused by the UI action and ready for imports/Automation/API (each passes its own `source`).
 *
 * The attestation ActivityLog stores STRUCTURED metadata (JSON `eventBody`): stage, policyId,
 * missingTruth, missingArtifacts, reason, source — so audit/analytics need no text parsing.
 */
export async function applyStageTransition(args: {
  organizationId: string;
  actorId: string | null;
  opportunity: { id: string; stage: OpportunityStage; propertyId: string; sellerId: string | null };
  targetStage: OpportunityStage;
  attestationReason?: string | null;
  source?: string; // "ui" | "import" | "automation" | "api" ...
  rules?: StageRuleset;
}): Promise<ApplyStageResult> {
  const { organizationId, actorId, opportunity, targetStage } = args;
  const source = args.source ?? "ui";
  const reason = (args.attestationReason ?? "").trim();
  const policy = await evaluateStageTransition(organizationId, opportunity.id, targetStage, args.rules ?? STAGE_RULES);

  if (policy.outcome === "DENY") {
    return { ok: false, outcome: "DENY", attested: false, result: policy, error: [policy.message, policy.suggestedAction].filter(Boolean).join(" ") || `Cannot move to ${stageLabel(targetStage)}.` };
  }

  let attested = false;
  if (policy.outcome === "REQUIRES_ATTESTATION") {
    if (!reason) {
      return { ok: false, outcome: "REQUIRES_ATTESTATION", attested: false, result: policy, error: [policy.message, policy.suggestedAction].filter(Boolean).join(" ") };
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
          eventLabel: `Attested ${stageLabel(targetStage)} without ${policy.missingArtifacts.join("; ")}`,
          eventBody: JSON.stringify({
            stage: targetStage,
            policyId: policy.policyId,
            missingTruth: policy.missingTruth,
            missingArtifacts: policy.missingArtifacts,
            reason,
            source,
          }),
        },
      });
    }
  });

  return { ok: true, outcome: policy.outcome, attested, result: policy };
}
