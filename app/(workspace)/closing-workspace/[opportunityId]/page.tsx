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
import { milestoneCandidates, selectNextMilestone, type TransactionProjectionInput } from "@/lib/transaction-dashboard";
import { buildClosingWorkspaceView, type DomainInput } from "@/lib/workspace-ui/closing-workspace";
import { buildClosingBlockersView, type ChecklistBlockerInput } from "@/lib/workspace-ui/closing-blockers";
import { ClosingWorkspace } from "@/components/workspace-ui/closing/ClosingWorkspace";

export const dynamic = "force-dynamic";

export default async function ClosingWorkspacePage({ params }: { params: { opportunityId: string } }) {
  const user = await requireUser();
  const org = user.organizationId;

  const opp = await prisma.opportunity.findFirst({
    where: { id: params.opportunityId, organizationId: org },
    select: { id: true, title: true, stage: true, targetCloseDate: true, property: { select: { name: true } } },
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

  // Increment 2: enriched blockers (owner-grouped) + next milestone — existing read authority only.
  const blockingChecklistItems = checklist ? blockingItems(checklist.items) : [];
  const ownerIds = [...new Set(blockingChecklistItems.map((i) => i.ownerId).filter((x): x is string => !!x))];
  const owners = ownerIds.length
    ? await prisma.user.findMany({ where: { id: { in: ownerIds }, organizationId: org }, select: { id: true, name: true, email: true } })
    : [];
  const ownerName = new Map(owners.map((u) => [u.id, u.name || u.email]));
  const itemStatusLabel = (s: string) => (s === "PENDING" ? "Pending" : s === "NOT_APPLICABLE" ? "Not applicable" : s);
  const checklistBlockers: ChecklistBlockerInput[] = blockingChecklistItems.map((i) => ({
    title: i.label,
    statusLabel: itemStatusLabel(i.status),
    hasOwnerId: !!i.ownerId,
    ownerName: i.ownerId ? (ownerName.get(i.ownerId) ?? null) : null,
    dueDate: i.dueDate ? i.dueDate.toISOString() : null,
  }));
  const domainBlockers = domains
    .filter((d) => d.started && !d.terminal)
    .map((d) => ({ domain: ((d.key.charAt(0).toUpperCase() + d.key.slice(1)) as "Escrow" | "Financing" | "Assignment"), statusLabel: d.statusLabel }));

  const ms = (d: Date | null | undefined) => (d ? d.getTime() : null);
  const projection: TransactionProjectionInput = {
    opportunity: { id: opp.id, title: opp.title, stage: opp.stage, propertyName: opp.property?.name ?? "", targetCloseDateMs: ms(opp.targetCloseDate) },
    checklistItems: checklist
      ? checklist.items.map((i) => ({ required: i.required, status: i.status, label: i.label, dueDateMs: ms(i.dueDate), ownerName: i.ownerId ? (ownerName.get(i.ownerId) ?? null) : null }))
      : null,
    escrow: escrow ? { status: escrow.status, earnestDueDateMs: ms(escrow.earnestDueDate), contingencyDeadlineMs: ms(escrow.contingencyDeadline) } : null,
    financing: financing ? { status: financing.status } : null,
    assignment: assignment ? { status: assignment.status } : null,
  };
  const nextMilestone = selectNextMilestone(milestoneCandidates(projection), Date.now());

  const blockersDetail = buildClosingBlockersView({
    checklistBlockers,
    domainBlockers,
    nextMilestone: nextMilestone ? { label: nextMilestone.label, dateIso: nextMilestone.dateIso, overdue: nextMilestone.overdue } : null,
  });

  return <ClosingWorkspace view={view} blockersDetail={blockersDetail} opportunityId={opp.id} opportunityName={opp.title} />;
}
