// CRE Operating Workspace — UI Milestone 2, Increment 1: Guided Underwriting route.
//
// Server component. Tenant-scoped via requireUser().organizationId; a miss -> notFound(). READ-ONLY: it
// reuses ONLY the existing underwriting read service (getActiveScenarioResult) and renders already-persisted
// outputs. It performs NO calculation, NO writes, NO scenario editing, NO decision recording, and does NOT
// surface decision history — those belong to /analyzer (authoritative advanced workspace) and to later
// increments. Answers the operator question "Can we structure this deal?".

import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getActiveScenarioResult } from "@/lib/underwriting";
import { buildGuidedUnderwritingView, type GuidedScenarioInput } from "@/lib/workspace-ui/guided-underwriting";
import { GuidedUnderwritingWorkspace } from "@/components/workspace-ui/guided-underwriting/GuidedUnderwritingWorkspace";

export const dynamic = "force-dynamic";

export default async function GuidedUnderwritingPage({ params }: { params: { opportunityId: string } }) {
  const user = await requireUser();

  const opp = await prisma.opportunity.findFirst({
    where: { id: params.opportunityId, organizationId: user.organizationId },
    select: { id: true, title: true, property: { select: { name: true } } },
  });
  if (!opp) notFound();

  // Existing read service only — returns the active scenario with its persisted result, recommendation,
  // findings, and primary financing-case result (or null when no underwriting exists yet).
  const scenario = await getActiveScenarioResult(user.organizationId, opp.id);

  const scenarioInput: GuidedScenarioInput | null = scenario
    ? {
        label: scenario.label,
        version: scenario.version,
        status: scenario.status,
        scenarioVersion: scenario.scenarioVersion,
        recommendationLevel: scenario.recommendation?.level ?? null,
        result: scenario.result
          ? {
              noiAnnualUsd: scenario.result.noiAnnualUsd,
              capRate: scenario.result.capRate,
              pricePerUnitUsd: scenario.result.pricePerUnitUsd,
            }
          : null,
        primaryFinancing: scenario.financingCases[0]?.result
          ? {
              dscr: scenario.financingCases[0].result.dscr,
              sizedLoanUsd: scenario.financingCases[0].result.sizedLoanUsd,
              leveredIrrPct: scenario.financingCases[0].result.leveredIrrPct,
            }
          : null,
        findings: scenario.findings.map((f) => ({
          severity: f.severity,
          decisive: f.decisive,
          title: f.title,
          detail: f.detail,
          position: f.position,
        })),
      }
    : null;

  const view = buildGuidedUnderwritingView({
    opportunityName: opp.title,
    propertyLabel: opp.property?.name ?? null,
    scenario: scenarioInput,
  });

  return <GuidedUnderwritingWorkspace view={view} opportunityId={opp.id} opportunityName={opp.title} />;
}
