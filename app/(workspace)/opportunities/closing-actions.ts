"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { checkAuthorized, GENERIC_DENIAL } from "@/lib/authorize";
import { canWaiveClosingItem } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  ensureClosingChecklist,
  completeChecklistItem,
  reopenChecklistItem,
  markItemNotApplicable,
  waiveChecklistItem,
  setItemOwner,
  setItemDueDate,
  linkItemEvidence,
} from "@/lib/closing-service";

// Server actions for the Closing Center (v1.4, CC-D). Authorization is enforced HERE
// (the service assumes an authorized caller); the pure gate + item transition rules live
// in lib/closing.ts and lib/closing-service.ts. Waiving a REQUIRED item is a distinct
// ADMIN-only check (canWaiveClosingItem, CC-5). Every action revalidates the detail page.
// These touch only the human closing workflow — never the underwriting engine (CC-1).

export type ClosingActionState = { error?: string } | undefined;

function done(opportunityId: string): ClosingActionState {
  revalidatePath(`/opportunities/${opportunityId}`);
  return undefined;
}

/** Materialize the opportunity's closing checklist from the org's active template (CC-10). */
export async function startClosingChecklist(opportunityId: string): Promise<ClosingActionState> {
  const user = await requireUser();
  if (!(await checkAuthorized(user, "CREATE", "CLOSING", { opportunityId }))) {
    return { error: GENERIC_DENIAL };
  }
  await ensureClosingChecklist(user.organizationId, opportunityId);
  return done(opportunityId);
}

export async function completeClosingItem(opportunityId: string, itemId: string): Promise<ClosingActionState> {
  const user = await requireUser();
  if (!(await checkAuthorized(user, "UPDATE", "CLOSING", { opportunityId, targetId: itemId }))) {
    return { error: GENERIC_DENIAL };
  }
  await completeChecklistItem(user.organizationId, itemId, user.id);
  return done(opportunityId);
}

export async function reopenClosingItem(opportunityId: string, itemId: string): Promise<ClosingActionState> {
  const user = await requireUser();
  if (!(await checkAuthorized(user, "UPDATE", "CLOSING", { opportunityId, targetId: itemId }))) {
    return { error: GENERIC_DENIAL };
  }
  await reopenChecklistItem(user.organizationId, itemId, user.id);
  return done(opportunityId);
}

/** Mark a NON-required item N/A. A required item throws in the service — surfaced as an error. */
export async function markClosingItemNotApplicable(opportunityId: string, itemId: string): Promise<ClosingActionState> {
  const user = await requireUser();
  if (!(await checkAuthorized(user, "UPDATE", "CLOSING", { opportunityId, targetId: itemId }))) {
    return { error: GENERIC_DENIAL };
  }
  try {
    await markItemNotApplicable(user.organizationId, itemId, user.id);
  } catch {
    return { error: "A required item can’t be marked N/A — waive it instead." };
  }
  return done(opportunityId);
}

/** Waive a required item — ADMIN only (CC-5), with a mandatory reason. */
export async function waiveClosingItem(opportunityId: string, itemId: string, reason: string): Promise<ClosingActionState> {
  const user = await requireUser();
  if (!(await checkAuthorized(user, "UPDATE", "CLOSING", { opportunityId, targetId: itemId }))) {
    return { error: GENERIC_DENIAL };
  }
  // A second, stricter gate above ordinary CLOSING write: only ADMIN may override.
  if (!canWaiveClosingItem(user.role)) return { error: GENERIC_DENIAL };
  if (!reason.trim()) return { error: "A waiver reason is required." };
  await waiveChecklistItem(user.organizationId, itemId, user.id, reason);
  return done(opportunityId);
}

/** Assign (or clear, with "") the item owner — must be an active member of the org. */
export async function setClosingItemOwner(opportunityId: string, itemId: string, ownerId: string): Promise<ClosingActionState> {
  const user = await requireUser();
  if (!(await checkAuthorized(user, "UPDATE", "CLOSING", { opportunityId, targetId: itemId }))) {
    return { error: GENERIC_DENIAL };
  }
  let resolved: string | null = null;
  if (ownerId) {
    const member = await prisma.user.findFirst({
      where: { id: ownerId, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!member) return { error: "Selected owner was not found in your organization." };
    resolved = member.id;
  }
  await setItemOwner(user.organizationId, itemId, resolved);
  return done(opportunityId);
}

/** Set (or clear, with "") the item due date. Expects a yyyy-mm-dd string. */
export async function setClosingItemDueDate(opportunityId: string, itemId: string, dueDate: string): Promise<ClosingActionState> {
  const user = await requireUser();
  if (!(await checkAuthorized(user, "UPDATE", "CLOSING", { opportunityId, targetId: itemId }))) {
    return { error: GENERIC_DENIAL };
  }
  let resolved: Date | null = null;
  if (dueDate) {
    const d = new Date(`${dueDate}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime())) return { error: "Enter a valid due date." };
    resolved = d;
  }
  await setItemDueDate(user.organizationId, itemId, resolved);
  return done(opportunityId);
}

/** Link (or clear, with "") a Document as supporting evidence — scoped to this opportunity. */
export async function linkClosingItemDocument(opportunityId: string, itemId: string, documentId: string): Promise<ClosingActionState> {
  const user = await requireUser();
  if (!(await checkAuthorized(user, "UPDATE", "CLOSING", { opportunityId, targetId: itemId }))) {
    return { error: GENERIC_DENIAL };
  }
  let resolved: string | null = null;
  if (documentId) {
    const doc = await prisma.document.findFirst({
      where: { id: documentId, organizationId: user.organizationId, opportunityId },
      select: { id: true },
    });
    if (!doc) return { error: "Selected document was not found on this opportunity." };
    resolved = doc.id;
  }
  await linkItemEvidence(user.organizationId, itemId, { documentId: resolved });
  return done(opportunityId);
}
