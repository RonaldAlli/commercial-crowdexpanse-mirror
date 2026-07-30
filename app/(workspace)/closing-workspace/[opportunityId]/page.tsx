// CRE Operating Workspace — Closing Workspace, Increment 1: Executive Closing Summary route.
//
// Server component. Tenant-scoped via requireUser().organizationId; a miss -> notFound(). READ-ONLY: it uses
// ONLY existing NON-MATERIALISING reads — getClosingChecklist (findFirst; returns null when no checklist,
// unlike getClosingGateStatus which lazily creates one) plus getEscrowRecord / getFinancingRecord /
// getAssignmentRecord — so this workspace never mutates on GET (mitigates R3 / OB-2). Readiness is the existing
// closingReadinessSummary; domain state is the existing isTerminal<Domain>Status predicates. No calculation,
// no writes, no console duplication. Answers "Can this transaction close?".

import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getClosingChecklist } from "@/lib/closing-service";
import { getEscrowRecord } from "@/lib/escrow-service";
import { getFinancingRecord } from "@/lib/financing-service";
import { getAssignmentRecord } from "@/lib/assignment-service";
import { closingReadinessSummary, blockingItems } from "@/lib/closing";
import { isTerminalEscrowStatus, escrowStatusLabel } from "@/lib/escrow";
import { isTerminalFinancingStatus, financingStatusLabel } from "@/lib/financing";
import { isTerminalAssignmentStatus, assignmentStatusLabel } from "@/lib/assignment";
import { buildClosingWorkspaceView, type DomainInput } from "@/lib/workspace-ui/closing-workspace";
import { ClosingWorkspace } from "@/components/workspace-ui/closing/ClosingWorkspace";

export const dynamic = "force-dynamic";

export default async function ClosingWorkspacePage({ params }: { params: { opportunityId: string } }) {
  const user = await requireUser();
  const org = user.organizationId;

  const opp = await prisma.opportunity.findFirst({
    where: { id: params.opportunityId, organizationId: org },
    select: { id: true, title: true },
  });
  if (!opp) notFound();

  // Existing non-materialising reads only.
  const [checklist, escrow, financing, assignment] = await Promise.all([
    getClosingChecklist(org, opp.id),
    getEscrowRecord(org, opp.id),
    getFinancingRecord(org, opp.id),
    getAssignmentRecord(org, opp.id),
  ]);

  const readiness = checklist ? closingReadinessSummary(checklist.items) : null;
  const blockerLabels = checklist ? blockingItems(checklist.items).map((i) => i.label) : [];

  const domains: DomainInput[] = [
    {
      key: "escrow",
      present: !!escrow,
      started: escrow ? escrow.status !== "NOT_OPENED" : false,
      terminal: escrow ? isTerminalEscrowStatus(escrow.status) : false,
      statusLabel: escrow ? escrowStatusLabel(escrow.status) : "Not started",
    },
    {
      key: "financing",
      present: !!financing,
      started: financing ? financing.status !== "NOT_STARTED" : false,
      terminal: financing ? isTerminalFinancingStatus(financing.status) : false,
      statusLabel: financing ? financingStatusLabel(financing.status) : "Not started",
    },
    {
      key: "assignment",
      present: !!assignment,
      started: assignment ? assignment.status !== "NOT_STARTED" : false,
      terminal: assignment ? isTerminalAssignmentStatus(assignment.status) : false,
      statusLabel: assignment ? assignmentStatusLabel(assignment.status) : "Not started",
    },
  ];

  const view = buildClosingWorkspaceView({ hasChecklist: !!checklist, readiness, blockerLabels, domains });

  return <ClosingWorkspace view={view} opportunityId={opp.id} opportunityName={opp.title} />;
}
