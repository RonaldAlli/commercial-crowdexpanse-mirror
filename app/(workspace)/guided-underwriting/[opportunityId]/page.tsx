// CRE Operating Workspace — UI Milestone 2, Increment 1: Guided Underwriting route.
//
// Server component. Tenant-scoped via requireUser().organizationId; a miss -> notFound(). READ-ONLY: it
// reuses ONLY the existing underwriting read service (getActiveScenarioResult) and renders already-persisted
// outputs. It performs NO calculation, NO writes, NO scenario editing, and NO decision recording/approval
// actions — those belong to /analyzer (authoritative advanced workspace). Increment 3 surfaces the existing
// decision history + engine/human contrast READ-ONLY. Answers "Can we structure this deal?" and beyond.

import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getActiveScenarioResult } from "@/lib/underwriting";
import { buildGuidedUnderwritingView, type GuidedScenarioInput } from "@/lib/workspace-ui/guided-underwriting";
import { buildGuidedAssumptionsView, type AssumptionRowInput } from "@/lib/workspace-ui/guided-underwriting-assumptions";
import { buildGuidedDecisionView, type DecisionRecordInput } from "@/lib/workspace-ui/guided-underwriting-decision";
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

  // Increment 2: classify the EXISTING assumption set (scenario operating + primary financing-case capital)
  // into the four-state missing-information model, reading provenance verbatim (never inferred).
  const toRow = (a: { key: string; source: string | null; sourceField: string | null; sourceAsOf: Date | null }): AssumptionRowInput => ({
    key: a.key,
    provenance: { source: a.source, sourceField: a.sourceField, sourceAsOf: a.sourceAsOf ? a.sourceAsOf.toISOString() : null },
  });
  const primaryFc = scenario?.financingCases[0] ?? null;
  const assumptions = buildGuidedAssumptionsView({
    hasScenario: !!scenario,
    hasFinancingCase: !!primaryFc,
    scenarioAssumptions: (scenario?.assumptions ?? []).map(toRow),
    capitalAssumptions: (primaryFc?.capitalAssumptions ?? []).map(toRow),
  });

  // Increment 3: read-first decision contrast + history. Resolve actor display names with a single
  // tenant-scoped user read (existing authority); everything else is already on the scenario.
  const decisionRows = scenario?.decisions ?? [];
  const actorIds = [...new Set(decisionRows.map((d) => d.actorUserId).filter(Boolean))] as string[];
  const actors = actorIds.length
    ? await prisma.user.findMany({ where: { id: { in: actorIds }, organizationId: user.organizationId }, select: { id: true, name: true, email: true } })
    : [];
  const actorName = new Map(actors.map((u) => [u.id, u.name || u.email]));
  const decision = buildGuidedDecisionView({
    hasScenario: !!scenario,
    recommendationLevel: scenario?.recommendation?.level ?? null,
    findings: (scenario?.findings ?? []).map((f) => ({ severity: f.severity, title: f.title, detail: f.detail, position: f.position })),
    decisions: decisionRows.map(
      (d): DecisionRecordInput => ({
        decision: d.decision,
        suggestedLevel: d.suggestedLevel ?? null,
        rationale: d.rationale,
        actor: actorName.get(d.actorUserId) ?? null,
        at: d.createdAt.toISOString(),
        sequence: d.sequence,
      }),
    ),
  });

  return (
    <GuidedUnderwritingWorkspace
      view={view}
      assumptions={assumptions}
      decision={decision}
      opportunityId={opp.id}
      opportunityName={opp.title}
    />
  );
}
