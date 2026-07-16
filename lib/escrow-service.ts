// Closing Center Slice 2 — Escrow: the DB orchestration. Owns the record lifecycle
// (open → set details → mark deposited → resolve), the immutable terminal-event write +
// record freeze (EC-I/EC-11), and audit via ActivityLog (EC-5). The pure transition/snapshot
// rules live in lib/escrow.ts. Authorization is enforced by callers (server actions);
// resolving to a terminal outcome is ADMIN-only (canResolveEscrow, EC-G). Escrow never
// touches the underwriting engine (EC-1/EC-9/EC-10). Design authority:
// docs/architecture/CLOSING_CENTER_ARCHITECTURE_LOCK.md (Slice 2 — Escrow).
import { EscrowStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { buildEscrowSnapshot, escrowEventTypeFor, isTerminalEscrowStatus, isValidEscrowTransition } from "@/lib/escrow";

const withEvents = { events: { orderBy: { occurredAt: "asc" as const } } };

/** Read the Opportunity's escrow record (or null) without creating one. */
export async function getEscrowRecord(organizationId: string, opportunityId: string) {
  return prisma.escrowRecord.findFirst({ where: { opportunityId, organizationId }, include: withEvents });
}

/**
 * Idempotently get-or-create the Opportunity's escrow record (status NOT_OPENED). A second
 * call returns the existing record unchanged. P2002-race-safe on the unique opportunityId.
 */
export async function ensureEscrowRecord(organizationId: string, opportunityId: string) {
  const existing = await prisma.escrowRecord.findFirst({ where: { opportunityId, organizationId }, include: withEvents });
  if (existing) return existing;

  const opportunity = await prisma.opportunity.findFirst({ where: { id: opportunityId, organizationId }, select: { id: true } });
  if (!opportunity) throw new Error("Opportunity not found");

  try {
    return await prisma.escrowRecord.create({
      data: { organizationId, opportunityId, status: "NOT_OPENED" },
      include: withEvents,
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const won = await prisma.escrowRecord.findFirst({ where: { opportunityId, organizationId }, include: withEvents });
      if (won) return won;
    }
    throw err;
  }
}

async function loadEscrow(organizationId: string, opportunityId: string) {
  const record = await prisma.escrowRecord.findFirst({ where: { opportunityId, organizationId } });
  if (!record) throw new Error("Escrow record not found");
  return record;
}

/** A terminal escrow record is frozen (EC-11): the mutable operational fields cannot change. */
function assertNotFrozen(status: EscrowStatus) {
  if (isTerminalEscrowStatus(status)) throw new Error("Escrow is resolved and can no longer be edited");
}

async function audit(organizationId: string, opportunityId: string, actorUserId: string, eventType: string, label: string, body?: string) {
  await prisma.activityLog
    .create({ data: { organizationId, opportunityId, actorId: actorUserId, eventType, eventLabel: label, eventBody: body ?? null } })
    .catch(() => {});
}

const asDate = (d: Date | null | undefined) => d ?? null;

export type EscrowDetails = {
  earnestAmountUsd?: number | null;
  escrowHolderName?: string | null;
  escrowHolderContact?: string | null;
  earnestDueDate?: Date | null;
  contingencyDeadline?: Date | null;
};

/**
 * Open escrow (NOT_OPENED → OPENED, EC-B), materializing the record on first use and
 * optionally seeding details in the same write. Idempotent-friendly: opening an already-open
 * (or later) record just applies any provided details rather than illegally re-transitioning.
 */
export async function openEscrow(organizationId: string, opportunityId: string, actorUserId: string, details: EscrowDetails = {}, openedDate?: Date | null) {
  const record = await ensureEscrowRecord(organizationId, opportunityId);
  assertNotFrozen(record.status);

  const opening = record.status === "NOT_OPENED";
  if (opening && !isValidEscrowTransition(record.status, "OPENED")) {
    throw new Error("Cannot open escrow from its current state");
  }

  const updated = await prisma.escrowRecord.update({
    where: { id: record.id },
    data: {
      ...(opening ? { status: "OPENED", openedById: actorUserId, openedAt: new Date(), openedDate: openedDate ?? new Date() } : {}),
      ...applyDetails(details),
    },
    include: withEvents,
  });
  await audit(organizationId, opportunityId, actorUserId, opening ? "escrow.opened" : "escrow.updated", opening ? "Escrow opened" : "Escrow details updated");
  return updated;
}

/** Update the mutable operational fields (amount, holder, key dates). Rejected once terminal. */
export async function setEscrowDetails(organizationId: string, opportunityId: string, actorUserId: string, details: EscrowDetails) {
  const record = await loadEscrow(organizationId, opportunityId);
  assertNotFrozen(record.status);
  const updated = await prisma.escrowRecord.update({ where: { id: record.id }, data: applyDetails(details), include: withEvents });
  await audit(organizationId, opportunityId, actorUserId, "escrow.updated", "Escrow details updated");
  return updated;
}

/** Only overwrite the fields explicitly provided (undefined = leave as-is; null = clear). */
function applyDetails(d: EscrowDetails) {
  const data: Prisma.EscrowRecordUpdateInput = {};
  if (d.earnestAmountUsd !== undefined) data.earnestAmountUsd = d.earnestAmountUsd;
  if (d.escrowHolderName !== undefined) data.escrowHolderName = d.escrowHolderName;
  if (d.escrowHolderContact !== undefined) data.escrowHolderContact = d.escrowHolderContact;
  if (d.earnestDueDate !== undefined) data.earnestDueDate = asDate(d.earnestDueDate);
  if (d.contingencyDeadline !== undefined) data.contingencyDeadline = asDate(d.contingencyDeadline);
  return data;
}

/** Mark earnest money deposited (OPENED → DEPOSITED, EC-B). */
export async function markEscrowDeposited(organizationId: string, opportunityId: string, actorUserId: string, depositedDate?: Date | null) {
  const record = await loadEscrow(organizationId, opportunityId);
  if (!isValidEscrowTransition(record.status, "DEPOSITED")) {
    throw new Error("Escrow must be OPENED before it can be marked deposited");
  }
  const updated = await prisma.escrowRecord.update({
    where: { id: record.id },
    data: { status: "DEPOSITED", depositedById: actorUserId, depositedAt: new Date(), depositedDate: depositedDate ?? new Date() },
    include: withEvents,
  });
  await audit(organizationId, opportunityId, actorUserId, "escrow.deposited", "Earnest money deposited", updated.earnestAmountUsd != null ? `Amount: $${updated.earnestAmountUsd.toLocaleString("en-US")}` : undefined);
  return updated;
}

/** Link (or clear) a proof-of-deposit Document (EC-F). Scalar id; rejected once terminal. */
export async function linkEscrowProof(organizationId: string, opportunityId: string, actorUserId: string, documentId: string | null) {
  const record = await loadEscrow(organizationId, opportunityId);
  assertNotFrozen(record.status);
  const updated = await prisma.escrowRecord.update({ where: { id: record.id }, data: { proofOfDepositDocumentId: documentId }, include: withEvents });
  await audit(organizationId, opportunityId, actorUserId, "escrow.updated", documentId ? "Escrow proof-of-deposit linked" : "Escrow proof-of-deposit cleared");
  return updated;
}

/**
 * Resolve escrow to a TERMINAL outcome (DEPOSITED → RELEASED/REFUNDED/FORFEITED, EC-B). This
 * is the append-only + freeze step (EC-I/EC-11): in one transaction it writes an IMMUTABLE
 * EscrowEvent snapshot of the amount/holder/proof at this moment and advances the record's
 * status. The mutable record is thereafter frozen. Reason is mandatory; ADMIN-only is
 * enforced by the caller (canResolveEscrow, EC-G/EC-4).
 */
export async function resolveEscrow(organizationId: string, opportunityId: string, actorUserId: string, target: EscrowStatus, reason: string) {
  const trimmed = reason.trim();
  if (!trimmed) throw new Error("A resolution reason is required");

  const record = await loadEscrow(organizationId, opportunityId);
  if (!isValidEscrowTransition(record.status, target)) {
    throw new Error("Escrow can only be resolved from DEPOSITED to a terminal outcome");
  }
  const eventType = escrowEventTypeFor(target);
  if (!eventType) throw new Error("Not a terminal escrow outcome");

  const snapshot = buildEscrowSnapshot(record, eventType, actorUserId, trimmed);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.escrowEvent.create({
      data: {
        organizationId,
        escrowRecordId: record.id,
        type: snapshot.type,
        amountUsdSnapshot: snapshot.amountUsdSnapshot,
        holderNameSnapshot: snapshot.holderNameSnapshot,
        proofDocumentIdSnapshot: snapshot.proofDocumentIdSnapshot,
        actorId: snapshot.actorId,
        reason: snapshot.reason,
      },
    });
    return tx.escrowRecord.update({
      where: { id: record.id },
      data: { status: target, resolvedById: actorUserId, resolvedAt: new Date(), resolutionReason: trimmed },
      include: withEvents,
    });
  });

  await audit(organizationId, opportunityId, actorUserId, `escrow.${target.toLowerCase()}`, `Escrow ${target.toLowerCase()}`, trimmed);
  return updated;
}
