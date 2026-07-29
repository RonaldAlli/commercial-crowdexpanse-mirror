// CRE Operating Workspace — UI M1 Increment 3: Opportunity Workspace route.
//
// Server component. Tenant-scoped via requireUser().organizationId; a miss -> notFound(). Reuses ONLY
// existing capabilities (opportunity lookup, diligence summary, closing gate, timeline, stage policy)
// and binds the EXISTING moveOpportunityStage / evaluateStageMove actions. Native OpportunityStage is
// authoritative; the dormant projection layer is never touched. Read-and-guide only — no new writes.

import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { STAGE_OPTIONS } from "@/lib/opportunity-options";
import { summarizeDiligence } from "@/lib/opportunity-diligence";
import { ensureOpportunityDiligence } from "@/lib/opportunity-diligence-service";
import { getClosingGateStatus } from "@/lib/closing-service";
import { getOpportunityTimeline } from "@/lib/transaction-timeline-service";
import { listGeneratedAgreements } from "@/lib/documents/assignment-agreement-service";
import { nextStageOf, stageReadinessView, crossLink } from "@/lib/workspace-ui/opportunity-view";
import { OpportunityWorkspace } from "@/components/workspace-ui/opportunity/OpportunityWorkspace";
import { moveOpportunityStage, evaluateStageMove } from "@/app/(workspace)/opportunities/actions";

export const dynamic = "force-dynamic";

export default async function OpportunityWorkspacePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { tlorder?: string; tlpage?: string };
}) {
  const user = await requireUser();

  const opp = await prisma.opportunity.findFirst({
    where: { id: params.id, organizationId: user.organizationId },
    include: {
      seller: { select: { id: true, name: true, company: true, phone: true, email: true } },
      property: { select: { id: true, name: true, addressLine1: true, city: true, state: true } },
      _count: { select: { buyerMatches: true, documents: true } },
    },
  });
  if (!opp) notFound();

  await ensureOpportunityDiligence(user.organizationId, opp.id);
  const [diligenceItems, gate, agreements] = await Promise.all([
    prisma.opportunityDiligenceItem.findMany({ where: { opportunityId: opp.id }, select: { key: true, status: true } }),
    getClosingGateStatus(user.organizationId, opp.id),
    listGeneratedAgreements(user.organizationId, opp.id),
  ]);

  const order = searchParams?.tlorder === "oldest" ? "oldest" : "newest";
  const page = Math.max(1, Number.parseInt(searchParams?.tlpage ?? "1", 10) || 1);
  const timeline = await getOpportunityTimeline(user.organizationId, opp.id, { order, page });

  const next = nextStageOf(opp.stage);
  const nextEval = next ? await evaluateStageMove(opp.id, next) : null;

  const crossLinks = [
    crossLink("Seller", opp.seller ? `/seller-queue/${opp.seller.id}` : null, opp.seller ? "View seller" : "None"),
    crossLink("Property", opp.property ? `/properties/${opp.property.id}` : null, opp.property ? "View property" : "None"),
    crossLink("Buyer matches", "/matches", `${opp._count.buyerMatches} match${opp._count.buyerMatches === 1 ? "" : "es"}`),
    crossLink("Agreements", "/documents", `${agreements.length}`),
    crossLink("Documents", "/documents", `${opp._count.documents}`),
    crossLink("Closing", "/closing", gate.ready ? "Ready" : `${gate.blockingLabels.length} blocker${gate.blockingLabels.length === 1 ? "" : "s"}`),
  ];

  return (
    <OpportunityWorkspace
      opportunity={{
        id: opp.id,
        title: opp.title,
        stage: opp.stage,
        source: opp.source,
        priority: opp.priority,
        targetCloseDate: opp.targetCloseDate,
        contractValueUsd: opp.contractValueUsd,
        assignmentFeeUsd: opp.assignmentFeeUsd,
      }}
      seller={opp.seller}
      property={opp.property}
      diligence={summarizeDiligence(diligenceItems)}
      gate={gate}
      stageReadiness={stageReadinessView(nextEval)}
      crossLinks={crossLinks}
      timeline={timeline}
      timelineBasePath={`/opportunity-workspace/${opp.id}`}
      stageOptions={STAGE_OPTIONS}
      stageAction={moveOpportunityStage.bind(null, opp.id)}
      stageEvaluate={evaluateStageMove.bind(null, opp.id)}
    />
  );
}
