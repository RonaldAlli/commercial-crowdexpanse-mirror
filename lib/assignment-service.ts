// Closing Center Slice 4 — Assignments: the DB orchestration. Owns the record lifecycle
// (start → set parties → draft the agreement → execute / cancel), the terminal AS-D/AS-H
// execution snapshot + record freeze, and audit via ActivityLog. The pure transition/snapshot
// rules live in lib/assignment; the generated-agreement artifact is produced by the Documents-
// owned lib/documents/assignment-agreement-service (AS-15). Authorization is enforced by callers
// (server actions); executing to EXECUTED is ADMIN-only (canExecuteAssignment, AS-G). Assignment
// NEVER reads into or writes the underwriting engine (AS-13). The fee's source of truth stays on
// Opportunity.assignmentFeeUsd (AS-3) — execution only snapshots it. Design authority:
// docs/architecture/CLOSING_CENTER_ARCHITECTURE_LOCK.md (Slice 4 — Assignments).
import { AssignmentStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { buildAssignmentExecutionSnapshot, isTerminalAssignmentStatus, isValidAssignmentTransition } from "@/lib/assignment";
import { generateAssignmentAgreement, type GeneratedAgreement } from "@/lib/documents/assignment-agreement-service";

/** Read the Opportunity's assignment record (or null) without creating one. */
export async function getAssignmentRecord(organizationId: string, opportunityId: string) {
  return prisma.assignmentRecord.findFirst({ where: { opportunityId, organizationId } });
}

/** Idempotently get-or-create the record (status NOT_STARTED). P2002-race-safe. */
export async function ensureAssignmentRecord(organizationId: string, opportunityId: string) {
  const existing = await prisma.assignmentRecord.findFirst({ where: { opportunityId, organizationId } });
  if (existing) return existing;

  const opportunity = await prisma.opportunity.findFirst({ where: { id: opportunityId, organizationId }, select: { id: true } });
  if (!opportunity) throw new Error("Opportunity not found");

  try {
    return await prisma.assignmentRecord.create({ data: { organizationId, opportunityId, status: "NOT_STARTED" } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const won = await prisma.assignmentRecord.findFirst({ where: { opportunityId, organizationId } });
      if (won) return won;
    }
    throw err;
  }
}

/**
 * Materialize the record at NOT_STARTED so the closing team can begin tracking the assignment,
 * auditing the first materialization only (idempotent: re-invoking is a no-op).
 */
export async function startAssignment(organizationId: string, opportunityId: string, actorUserId: string) {
  const existing = await prisma.assignmentRecord.findFirst({ where: { opportunityId, organizationId } });
  if (existing) return existing;
  const created = await ensureAssignmentRecord(organizationId, opportunityId);
  await audit(organizationId, opportunityId, actorUserId, "assignment.started", "Assignment tracking started");
  return created;
}

async function loadAssignment(organizationId: string, opportunityId: string) {
  const record = await prisma.assignmentRecord.findFirst({ where: { opportunityId, organizationId } });
  if (!record) throw new Error("Assignment record not found");
  return record;
}

/** A terminal assignment record is frozen (AS-4/AS-12): its operational fields cannot change. */
function assertNotFrozen(status: AssignmentStatus) {
  if (isTerminalAssignmentStatus(status)) throw new Error("Assignment is resolved and can no longer be edited");
}

async function audit(organizationId: string, opportunityId: string, actorUserId: string, eventType: string, label: string, body?: string) {
  await prisma.activityLog
    .create({ data: { organizationId, opportunityId, actorId: actorUserId, eventType, eventLabel: label, eventBody: body ?? null } })
    .catch(() => {});
}

export type AssignmentPartiesInput = {
  assignorSellerId?: string | null;
  assignorName?: string | null;
  assignorContact?: string | null;
  assigneeBuyerId?: string | null;
  assigneeName?: string | null;
  assigneeContact?: string | null;
};

/** Set the assignor/assignee identity (scalar refs and/or free-text, AS-C). Rejected once terminal. */
export async function setAssignmentParties(organizationId: string, opportunityId: string, actorUserId: string, parties: AssignmentPartiesInput) {
  const record = await ensureAssignmentRecord(organizationId, opportunityId);
  assertNotFrozen(record.status);
  const data: Prisma.AssignmentRecordUpdateInput = {};
  if (parties.assignorName !== undefined) data.assignorName = parties.assignorName;
  if (parties.assignorContact !== undefined) data.assignorContact = parties.assignorContact;
  if (parties.assigneeName !== undefined) data.assigneeName = parties.assigneeName;
  if (parties.assigneeContact !== undefined) data.assigneeContact = parties.assigneeContact;
  if (parties.assignorSellerId !== undefined) data.assignorSellerId = parties.assignorSellerId;
  if (parties.assigneeBuyerId !== undefined) data.assigneeBuyerId = parties.assigneeBuyerId;
  const updated = await prisma.assignmentRecord.update({ where: { id: record.id }, data });
  await audit(organizationId, opportunityId, actorUserId, "assignment.updated", "Assignment parties updated");
  return updated;
}

/**
 * Generate (or regenerate) the draft assignment agreement from CURRENT operational data (AS-L):
 * allowed only while the record is NOT terminal — once EXECUTED (or CANCELLED) generation is
 * disabled. The FIRST draft transitions NOT_STARTED → DRAFTED (AS-B); a regenerate from DRAFTED
 * appends a new versioned draft without changing status (AS-12/AS-M). Returns the generated doc.
 */
export async function generateAssignmentDraft(
  organizationId: string,
  opportunityId: string,
  actor: { id: string; display: string },
): Promise<GeneratedAgreement> {
  const record = await ensureAssignmentRecord(organizationId, opportunityId);
  if (isTerminalAssignmentStatus(record.status)) {
    throw new Error("Assignment is resolved — the agreement can no longer be regenerated");
  }
  const doc = await generateAssignmentAgreement(organizationId, opportunityId, actor);
  if (record.status === "NOT_STARTED") {
    await prisma.assignmentRecord.update({ where: { id: record.id }, data: { status: "DRAFTED" } });
    await audit(organizationId, opportunityId, actor.id, "assignment.drafted", "Assignment drafted");
  }
  return doc;
}

/** Resolve each party's effective name (free-text override wins, else the linked Seller/Buyer). */
async function resolveEffectiveNames(
  organizationId: string,
  record: { assignorSellerId: string | null; assignorName: string | null; assigneeBuyerId: string | null; assigneeName: string | null },
): Promise<{ assignorName: string | null; assigneeName: string | null }> {
  const trimmed = (s: string | null | undefined) => {
    const t = s?.trim();
    return t ? t : null;
  };
  const [seller, buyer] = await Promise.all([
    !trimmed(record.assignorName) && record.assignorSellerId
      ? prisma.seller.findFirst({ where: { id: record.assignorSellerId, organizationId }, select: { name: true } })
      : Promise.resolve(null),
    !trimmed(record.assigneeName) && record.assigneeBuyerId
      ? prisma.buyer.findFirst({ where: { id: record.assigneeBuyerId, organizationId }, select: { name: true } })
      : Promise.resolve(null),
  ]);
  return {
    assignorName: trimmed(record.assignorName) ?? seller?.name ?? null,
    assigneeName: trimmed(record.assigneeName) ?? buyer?.name ?? null,
  };
}

/**
 * Execute the assignment (DRAFTED → EXECUTED, AS-B). Captures the terminal AS-D/AS-H snapshot —
 * fee + contract value (from the Opportunity, AS-3), effective party names, and the latest
 * generated agreement Document — INSIDE the record and FREEZES it (AS-4/AS-12). Never modifies
 * underwriting (AS-13). ADMIN-only is enforced by the caller (canExecuteAssignment, AS-G). Does
 * NOT auto-complete the ASSIGNMENT checklist item — that stays an explicit human step (AS-F: the
 * gate is composed, never bypassed). An optional note is stored as the resolution reason.
 */
export async function executeAssignment(organizationId: string, opportunityId: string, actorUserId: string, note?: string | null) {
  const record = await loadAssignment(organizationId, opportunityId);
  if (!isValidAssignmentTransition(record.status, "EXECUTED")) {
    throw new Error(`Cannot execute assignment from ${record.status}`);
  }
  const opportunity = await prisma.opportunity.findFirst({
    where: { id: opportunityId, organizationId },
    select: { assignmentFeeUsd: true, contractValueUsd: true },
  });
  if (!opportunity) throw new Error("Opportunity not found");

  const names = await resolveEffectiveNames(organizationId, record);
  const latestAgreement = await prisma.document.findFirst({
    where: { organizationId, sourceOpportunityId: opportunityId, documentType: "ASSIGNMENT_AGREEMENT", origin: "GENERATED" },
    orderBy: { generationSequence: "desc" },
    select: { id: true },
  });

  const snapshot = buildAssignmentExecutionSnapshot({
    assignmentFeeUsd: opportunity.assignmentFeeUsd,
    contractValueUsd: opportunity.contractValueUsd,
    assignorName: names.assignorName,
    assigneeName: names.assigneeName,
    agreementDocumentId: latestAgreement?.id ?? null,
  });

  const trimmedNote = note?.trim() || null;
  const updated = await prisma.assignmentRecord.update({
    where: { id: record.id },
    data: {
      status: "EXECUTED",
      resolvedById: actorUserId,
      resolvedAt: new Date(),
      resolutionReason: trimmedNote,
      executedFeeUsdSnapshot: snapshot.executedFeeUsdSnapshot,
      executedContractValueUsdSnapshot: snapshot.executedContractValueUsdSnapshot,
      executedAssignorNameSnapshot: snapshot.executedAssignorNameSnapshot,
      executedAssigneeNameSnapshot: snapshot.executedAssigneeNameSnapshot,
      executedAgreementDocumentIdSnapshot: snapshot.executedAgreementDocumentIdSnapshot,
    },
  });
  await audit(organizationId, opportunityId, actorUserId, "assignment.executed", "Assignment executed", trimmedNote ?? undefined);
  return updated;
}

/**
 * Cancel the assignment (NOT_STARTED / DRAFTED → CANCELLED, AS-B) with a mandatory reason, and
 * FREEZE the record (AS-4). No execution snapshot is captured (the deal did not execute).
 */
export async function cancelAssignment(organizationId: string, opportunityId: string, actorUserId: string, reason: string) {
  const trimmed = reason.trim();
  if (!trimmed) throw new Error("A cancellation reason is required");
  const record = await loadAssignment(organizationId, opportunityId);
  if (!isValidAssignmentTransition(record.status, "CANCELLED")) {
    throw new Error(`Cannot cancel assignment from ${record.status}`);
  }
  const updated = await prisma.assignmentRecord.update({
    where: { id: record.id },
    data: { status: "CANCELLED", resolvedById: actorUserId, resolvedAt: new Date(), resolutionReason: trimmed },
  });
  await audit(organizationId, opportunityId, actorUserId, "assignment.cancelled", "Assignment cancelled", trimmed);
  return updated;
}
