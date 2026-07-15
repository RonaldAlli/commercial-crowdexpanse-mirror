// Closing Center (v1.4) — the DB orchestration. Owns template seeding/versioning
// (CC-G/CC-9), the one-way instantiation SNAPSHOT (CC-10), and the audited item
// operations (CC-B/CC-5). It reuses ActivityLog for audit (CC-6) and never touches the
// underwriting engine (CC-1). Authorization is enforced by callers (server actions);
// waiving a required item is ADMIN-only (CC-5). Design authority:
// docs/architecture/CLOSING_CENTER_ARCHITECTURE_LOCK.md.
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { DEFAULT_CLOSING_TEMPLATE, isClosingReady, isValidStatusTransition } from "@/lib/closing";

type Db = Prisma.TransactionClient | typeof prisma;

/** Find the org's active template, seeding the default one on first use (CC-G). */
export async function getOrSeedActiveTemplate(organizationId: string, db: Db = prisma) {
  const existing = await db.closingChecklistTemplate.findFirst({
    where: { organizationId, isActive: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    include: { items: { orderBy: { position: "asc" } } },
  });
  if (existing) return existing;

  return db.closingChecklistTemplate.create({
    data: {
      organizationId,
      name: DEFAULT_CLOSING_TEMPLATE.name,
      version: 1,
      isActive: true,
      isDefault: true,
      items: {
        create: DEFAULT_CLOSING_TEMPLATE.items.map((it, i) => ({
          organizationId,
          category: it.category,
          label: it.label,
          description: it.description ?? null,
          required: it.required,
          completionEvidenceType: it.completionEvidenceType,
          position: i,
        })),
      },
    },
    include: { items: { orderBy: { position: "asc" } } },
  });
}

const checklistInclude = { items: { orderBy: { position: "asc" as const } } };

/**
 * Idempotently get-or-create the Opportunity's closing checklist by SNAPSHOTTING the
 * org's active template's items into concrete items (CC-10). A second call returns the
 * existing checklist unchanged — a later template edit never rewrites it.
 */
export async function ensureClosingChecklist(organizationId: string, opportunityId: string) {
  const existing = await prisma.closingChecklist.findFirst({
    where: { opportunityId, organizationId },
    include: checklistInclude,
  });
  if (existing) return existing;

  // Confirm the opportunity is in this org before creating a child under it.
  const opportunity = await prisma.opportunity.findFirst({ where: { id: opportunityId, organizationId }, select: { id: true } });
  if (!opportunity) throw new Error("Opportunity not found");

  try {
    return await prisma.$transaction(async (tx) => {
      const template = await getOrSeedActiveTemplate(organizationId, tx);
      return tx.closingChecklist.create({
        data: {
          organizationId,
          opportunityId,
          sourceTemplateId: template.id,
          templateVersion: template.version,
          items: {
            create: template.items.map((it) => ({
              organizationId,
              category: it.category,
              label: it.label,
              description: it.description,
              required: it.required,
              completionEvidenceType: it.completionEvidenceType,
              position: it.position,
              status: "PENDING",
            })),
          },
        },
        include: checklistInclude,
      });
    });
  } catch (err) {
    // Lost a create race on the unique (opportunityId) — re-read the winner (CC-10 safe).
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const won = await prisma.closingChecklist.findFirst({ where: { opportunityId, organizationId }, include: checklistInclude });
      if (won) return won;
    }
    throw err;
  }
}

/** Read the Opportunity's checklist (or null) without instantiating it. */
export async function getClosingChecklist(organizationId: string, opportunityId: string) {
  return prisma.closingChecklist.findFirst({ where: { opportunityId, organizationId }, include: checklistInclude });
}

/**
 * The PAID gate (CC-2): materialize the checklist (so the required items exist) and apply
 * the pure predicate. Used by the stage-move action and surfaced in the UI. Composed with
 * — never replacing — the role-based stage authorization.
 */
export async function isOpportunityClosingReady(organizationId: string, opportunityId: string): Promise<boolean> {
  const checklist = await ensureClosingChecklist(organizationId, opportunityId);
  return isClosingReady(checklist.items);
}

/** Fetch an item scoped to the org, with the parent opportunityId for auditing. */
async function loadItem(organizationId: string, itemId: string) {
  const item = await prisma.closingChecklistItem.findFirst({
    where: { id: itemId, organizationId },
    include: { checklist: { select: { opportunityId: true } } },
  });
  if (!item) throw new Error("Checklist item not found");
  return item;
}

async function audit(organizationId: string, opportunityId: string, actorUserId: string, eventType: string, label: string, body?: string) {
  await prisma.activityLog
    .create({ data: { organizationId, opportunityId, actorId: actorUserId, eventType, eventLabel: label, eventBody: body ?? null } })
    .catch(() => {});
}

/** Mark an item COMPLETE (CC-B) — records who/when; clears any prior waive. */
export async function completeChecklistItem(organizationId: string, itemId: string, actorUserId: string) {
  const item = await loadItem(organizationId, itemId);
  const updated = await prisma.closingChecklistItem.update({
    where: { id: item.id },
    data: { status: "COMPLETE", completedById: actorUserId, completedAt: new Date(), waivedById: null, waivedAt: null, waiverReason: null },
  });
  await audit(organizationId, item.checklist.opportunityId, actorUserId, "closing.item_completed", `Closing item completed: ${item.label}`);
  return updated;
}

/**
 * WAIVE a required item (CC-5) — an explicit, reasoned, audited override. The caller must
 * enforce the ADMIN-only authorization (canWaiveClosingItem); the reason is mandatory.
 */
export async function waiveChecklistItem(organizationId: string, itemId: string, actorUserId: string, reason: string) {
  const trimmed = reason.trim();
  if (!trimmed) throw new Error("A waiver reason is required");
  const item = await loadItem(organizationId, itemId);
  const updated = await prisma.closingChecklistItem.update({
    where: { id: item.id },
    data: { status: "WAIVED", waivedById: actorUserId, waivedAt: new Date(), waiverReason: trimmed, completedById: null, completedAt: null },
  });
  await audit(organizationId, item.checklist.opportunityId, actorUserId, "closing.item_waived", `Closing item waived: ${item.label}`, trimmed);
  return updated;
}

/** Mark a NON-required item NOT_APPLICABLE (CC-5: a required item must be WAIVED instead). */
export async function markItemNotApplicable(organizationId: string, itemId: string, actorUserId: string) {
  const item = await loadItem(organizationId, itemId);
  if (!isValidStatusTransition(item.required, "NOT_APPLICABLE")) {
    throw new Error("A required item cannot be marked N/A — waive it instead");
  }
  const updated = await prisma.closingChecklistItem.update({
    where: { id: item.id },
    data: { status: "NOT_APPLICABLE", completedById: null, completedAt: null, waivedById: null, waivedAt: null, waiverReason: null },
  });
  await audit(organizationId, item.checklist.opportunityId, actorUserId, "closing.item_na", `Closing item marked N/A: ${item.label}`);
  return updated;
}

/** Reopen an item back to PENDING (clears completion/waiver state). */
export async function reopenChecklistItem(organizationId: string, itemId: string, actorUserId: string) {
  const item = await loadItem(organizationId, itemId);
  const updated = await prisma.closingChecklistItem.update({
    where: { id: item.id },
    data: { status: "PENDING", completedById: null, completedAt: null, waivedById: null, waivedAt: null, waiverReason: null },
  });
  await audit(organizationId, item.checklist.opportunityId, actorUserId, "closing.item_reopened", `Closing item reopened: ${item.label}`);
  return updated;
}

/** Set an item's owner (a plain user id; nullable to unassign). */
export async function setItemOwner(organizationId: string, itemId: string, ownerId: string | null) {
  const item = await loadItem(organizationId, itemId);
  return prisma.closingChecklistItem.update({ where: { id: item.id }, data: { ownerId } });
}

/** Set an item's due date (nullable to clear). */
export async function setItemDueDate(organizationId: string, itemId: string, dueDate: Date | null) {
  const item = await loadItem(organizationId, itemId);
  return prisma.closingChecklistItem.update({ where: { id: item.id }, data: { dueDate } });
}

/** Link supporting evidence (a Document or Task id) to an item; both nullable to clear. */
export async function linkItemEvidence(
  organizationId: string,
  itemId: string,
  evidence: { documentId?: string | null; taskId?: string | null },
) {
  const item = await loadItem(organizationId, itemId);
  return prisma.closingChecklistItem.update({
    where: { id: item.id },
    data: {
      evidenceDocumentId: evidence.documentId === undefined ? item.evidenceDocumentId : evidence.documentId,
      evidenceTaskId: evidence.taskId === undefined ? item.evidenceTaskId : evidence.taskId,
    },
  });
}
