// Closing Center Slice 3 — Financing: the DB orchestration. Owns the record lifecycle
// (apply → advance → resolve), the FC-J terminal snapshot + record freeze, and audit via
// ActivityLog (FC-7). The pure transition/snapshot rules live in lib/financing.ts.
// Authorization is enforced by callers (server actions); resolving to a terminal outcome is
// ADMIN-only (canResolveFinancing, FC-G). Financing NEVER reads into or writes the underwriting
// engine — it only references underwriting output read-only elsewhere, at render time (FC-0/
// FC-1/FC-11..FC-14). Design authority: docs/architecture/CLOSING_CENTER_ARCHITECTURE_LOCK.md.
import { FinancingStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { buildFinancingSnapshot, isTerminalFinancingStatus, isValidFinancingTransition } from "@/lib/financing";

/** Read the Opportunity's financing record (or null) without creating one. */
export async function getFinancingRecord(organizationId: string, opportunityId: string) {
  return prisma.financingRecord.findFirst({ where: { opportunityId, organizationId } });
}

/** Idempotently get-or-create the record (status NOT_STARTED). P2002-race-safe. */
export async function ensureFinancingRecord(organizationId: string, opportunityId: string) {
  const existing = await prisma.financingRecord.findFirst({ where: { opportunityId, organizationId } });
  if (existing) return existing;

  const opportunity = await prisma.opportunity.findFirst({ where: { id: opportunityId, organizationId }, select: { id: true } });
  if (!opportunity) throw new Error("Opportunity not found");

  try {
    return await prisma.financingRecord.create({ data: { organizationId, opportunityId, status: "NOT_STARTED" } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const won = await prisma.financingRecord.findFirst({ where: { opportunityId, organizationId } });
      if (won) return won;
    }
    throw err;
  }
}

/**
 * Materialize the record at NOT_STARTED so the closing team can begin tracking a lender's
 * process, auditing the first materialization only (idempotent: re-invoking is a no-op).
 */
export async function startFinancing(organizationId: string, opportunityId: string, actorUserId: string) {
  const existing = await prisma.financingRecord.findFirst({ where: { opportunityId, organizationId } });
  if (existing) return existing;
  const created = await ensureFinancingRecord(organizationId, opportunityId);
  await audit(organizationId, opportunityId, actorUserId, "financing.started", "Financing tracking started");
  return created;
}

async function loadFinancing(organizationId: string, opportunityId: string) {
  const record = await prisma.financingRecord.findFirst({ where: { opportunityId, organizationId } });
  if (!record) throw new Error("Financing record not found");
  return record;
}

/** A terminal financing record is frozen (FC-6/FC-J): its operational fields cannot change. */
function assertNotFrozen(status: FinancingStatus) {
  if (isTerminalFinancingStatus(status)) throw new Error("Financing is resolved and can no longer be edited");
}

async function audit(organizationId: string, opportunityId: string, actorUserId: string, eventType: string, label: string, body?: string) {
  await prisma.activityLog
    .create({ data: { organizationId, opportunityId, actorId: actorUserId, eventType, eventLabel: label, eventBody: body ?? null } })
    .catch(() => {});
}

// The milestone-date field set on a non-terminal transition (FC-B).
const TRANSITION_DATE_FIELD: Partial<Record<FinancingStatus, "applicationSubmittedDate" | "commitmentReceivedDate" | "conditionsSatisfiedDate">> = {
  APPLIED: "applicationSubmittedDate",
  COMMITTED: "commitmentReceivedDate",
  CLEARED: "conditionsSatisfiedDate",
};

/**
 * Advance the status along a NON-terminal edge (APPLIED / COMMITTED / CLEARED), stamping the
 * corresponding milestone date. Terminal outcomes go through resolveFinancing (FC-J).
 */
export async function advanceFinancingStatus(organizationId: string, opportunityId: string, actorUserId: string, target: FinancingStatus) {
  if (isTerminalFinancingStatus(target)) throw new Error("Use resolveFinancing for terminal outcomes");
  const record = await ensureFinancingRecord(organizationId, opportunityId);
  if (!isValidFinancingTransition(record.status, target)) {
    throw new Error(`Cannot move financing from ${record.status} to ${target}`);
  }
  const dateField = TRANSITION_DATE_FIELD[target];
  const updated = await prisma.financingRecord.update({
    where: { id: record.id },
    data: { status: target, ...(dateField ? { [dateField]: new Date() } : {}) },
  });
  await audit(organizationId, opportunityId, actorUserId, `financing.${target.toLowerCase()}`, `Financing ${target.toLowerCase().replace("_", " ")}`);
  return updated;
}

/** Set the free-text lender fields (FC-D). Rejected once terminal. */
export async function setFinancingLender(organizationId: string, opportunityId: string, actorUserId: string, lender: { lenderName?: string | null; lenderContact?: string | null }) {
  const record = await loadFinancing(organizationId, opportunityId);
  assertNotFrozen(record.status);
  const data: Prisma.FinancingRecordUpdateInput = {};
  if (lender.lenderName !== undefined) data.lenderName = lender.lenderName;
  if (lender.lenderContact !== undefined) data.lenderContact = lender.lenderContact;
  const updated = await prisma.financingRecord.update({ where: { id: record.id }, data });
  await audit(organizationId, opportunityId, actorUserId, "financing.updated", "Financing lender updated");
  return updated;
}

// The informational milestone dates a user may set directly (distinct from the transition
// dates advanceFinancingStatus stamps, and from fundedDate which resolveFinancing owns).
export type MilestoneField =
  | "appraisalOrderedDate"
  | "appraisalCompletedDate"
  | "conditionsReceivedDate"
  | "closingPackageReceivedDate";
const MILESTONE_FIELDS = new Set<string>(["appraisalOrderedDate", "appraisalCompletedDate", "conditionsReceivedDate", "closingPackageReceivedDate"]);

/** Set (or clear) one informational milestone date (FC-B). Rejected once terminal. */
export async function setFinancingMilestone(organizationId: string, opportunityId: string, actorUserId: string, field: MilestoneField, date: Date | null) {
  if (!MILESTONE_FIELDS.has(field)) throw new Error("Unknown milestone field");
  const record = await loadFinancing(organizationId, opportunityId);
  assertNotFrozen(record.status);
  const updated = await prisma.financingRecord.update({ where: { id: record.id }, data: { [field]: date } });
  await audit(organizationId, opportunityId, actorUserId, "financing.updated", `Financing milestone updated: ${field}`);
  return updated;
}

/** Link (or clear) the commitment-letter and/or appraisal Documents (FC-E). Rejected once terminal. */
export async function linkFinancingDocuments(organizationId: string, opportunityId: string, actorUserId: string, docs: { commitmentLetterDocumentId?: string | null; appraisalDocumentId?: string | null }) {
  const record = await loadFinancing(organizationId, opportunityId);
  assertNotFrozen(record.status);
  const data: Prisma.FinancingRecordUpdateInput = {};
  if (docs.commitmentLetterDocumentId !== undefined) data.commitmentLetterDocumentId = docs.commitmentLetterDocumentId;
  if (docs.appraisalDocumentId !== undefined) data.appraisalDocumentId = docs.appraisalDocumentId;
  const updated = await prisma.financingRecord.update({ where: { id: record.id }, data });
  await audit(organizationId, opportunityId, actorUserId, "financing.updated", "Financing documents updated");
  return updated;
}

/**
 * Resolve financing to a TERMINAL outcome (FUNDED / DENIED / WITHDRAWN, FC-B). Captures the
 * FC-J snapshot (lender + commitment/appraisal document ids + actor + timestamp + reason)
 * INSIDE the record and FREEZES it (FC-6/FC-I/FC-J) — no separate event ledger. Reason is
 * mandatory; ADMIN-only is enforced by the caller (canResolveFinancing).
 */
export async function resolveFinancing(organizationId: string, opportunityId: string, actorUserId: string, target: FinancingStatus, reason: string) {
  if (!isTerminalFinancingStatus(target)) throw new Error("resolveFinancing requires a terminal outcome");
  const trimmed = reason.trim();
  if (!trimmed) throw new Error("A resolution reason is required");

  const record = await loadFinancing(organizationId, opportunityId);
  if (!isValidFinancingTransition(record.status, target)) {
    throw new Error(`Cannot resolve financing from ${record.status} to ${target}`);
  }
  const snapshot = buildFinancingSnapshot(record, actorUserId, trimmed);
  const updated = await prisma.financingRecord.update({
    where: { id: record.id },
    data: {
      status: target,
      resolvedById: actorUserId,
      resolvedAt: new Date(),
      resolutionReason: trimmed,
      resolutionLenderNameSnapshot: snapshot.resolutionLenderNameSnapshot,
      resolutionCommitmentDocumentIdSnapshot: snapshot.resolutionCommitmentDocumentIdSnapshot,
      resolutionAppraisalDocumentIdSnapshot: snapshot.resolutionAppraisalDocumentIdSnapshot,
      ...(target === "FUNDED" ? { fundedDate: new Date() } : {}),
    },
  });
  await audit(organizationId, opportunityId, actorUserId, `financing.${target.toLowerCase()}`, `Financing ${target.toLowerCase()}`, trimmed);
  return updated;
}
