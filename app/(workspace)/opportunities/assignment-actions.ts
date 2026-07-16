"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { checkAuthorized, GENERIC_DENIAL } from "@/lib/authorize";
import { canExecuteAssignment } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  startAssignment,
  setAssignmentParties,
  generateAssignmentDraft,
  executeAssignment,
  cancelAssignment,
} from "@/lib/assignment-service";

// Server actions for Assignments (Closing Slice 4, AS-G). Authorization is enforced HERE:
// ordinary assignment work (start / set parties / draft the agreement / cancel) needs CLOSING
// write; EXECUTING additionally needs the ADMIN-only canExecuteAssignment (AS-G) because it
// captures the terminal AS-D/AS-H snapshot and freezes the record. The pure lifecycle/snapshot
// rules live in lib/assignment, the DB orchestration in lib/assignment-service, and the
// generated agreement in lib/documents/assignment-agreement-service. Assignment NEVER reads
// into or writes the underwriting engine (AS-13).

export type AssignmentActionState = { error?: string } | undefined;

function done(opportunityId: string): AssignmentActionState {
  revalidatePath(`/opportunities/${opportunityId}`);
  return undefined;
}

function strOrNull(raw: string | undefined) {
  if (raw === undefined) return undefined;
  const t = raw.trim();
  return t ? t : null;
}

/** Materialize the assignment record (NOT_STARTED) so the team can begin tracking. */
export async function startAssignmentAction(opportunityId: string): Promise<AssignmentActionState> {
  const user = await requireUser();
  if (!(await checkAuthorized(user, "CREATE", "CLOSING", { opportunityId }))) return { error: GENERIC_DENIAL };
  await startAssignment(user.organizationId, opportunityId, user.id);
  return done(opportunityId);
}

export type AssignmentPartiesActionInput = {
  assignorSellerId?: string;
  assignorName?: string;
  assignorContact?: string;
  assigneeBuyerId?: string;
  assigneeName?: string;
  assigneeContact?: string;
};

/** Set the assignor/assignee identity (scalar refs and/or free-text). Rejected once terminal. */
export async function setAssignmentPartiesAction(opportunityId: string, input: AssignmentPartiesActionInput): Promise<AssignmentActionState> {
  const user = await requireUser();
  if (!(await checkAuthorized(user, "UPDATE", "CLOSING", { opportunityId }))) return { error: GENERIC_DENIAL };

  // A linked party ref must belong to this org (org-scope integrity); "" clears the link.
  const resolveSeller = async (id: string | undefined) => {
    if (id === undefined) return undefined;
    if (!id) return null;
    const s = await prisma.seller.findFirst({ where: { id, organizationId: user.organizationId }, select: { id: true } });
    if (!s) throw new Error("not found");
    return s.id;
  };
  const resolveBuyer = async (id: string | undefined) => {
    if (id === undefined) return undefined;
    if (!id) return null;
    const b = await prisma.buyer.findFirst({ where: { id, organizationId: user.organizationId }, select: { id: true } });
    if (!b) throw new Error("not found");
    return b.id;
  };

  let assignorSellerId: string | null | undefined;
  let assigneeBuyerId: string | null | undefined;
  try {
    assignorSellerId = await resolveSeller(input.assignorSellerId);
    assigneeBuyerId = await resolveBuyer(input.assigneeBuyerId);
  } catch {
    return { error: "Selected party was not found in this organization." };
  }

  try {
    await setAssignmentParties(user.organizationId, opportunityId, user.id, {
      assignorSellerId,
      assigneeBuyerId,
      assignorName: strOrNull(input.assignorName),
      assignorContact: strOrNull(input.assignorContact),
      assigneeName: strOrNull(input.assigneeName),
      assigneeContact: strOrNull(input.assigneeContact),
    });
  } catch {
    return { error: "Assignment is resolved and can no longer be edited." };
  }
  return done(opportunityId);
}

/**
 * Generate (or regenerate) the draft assignment agreement from current operational data. The
 * first draft moves NOT_STARTED → DRAFTED; disabled once the assignment is resolved (AS-L).
 */
export async function generateAssignmentDraftAction(opportunityId: string): Promise<AssignmentActionState> {
  const user = await requireUser();
  if (!(await checkAuthorized(user, "UPDATE", "CLOSING", { opportunityId }))) return { error: GENERIC_DENIAL };
  try {
    await generateAssignmentDraft(user.organizationId, opportunityId, { id: user.id, display: user.name });
  } catch {
    return { error: "The assignment agreement could not be generated (the assignment may be resolved)." };
  }
  return done(opportunityId);
}

/**
 * Execute the assignment (DRAFTED → EXECUTED) — ADMIN only (AS-G), with an optional note.
 * Captures the AS-D/AS-H snapshot + freezes the record in the service.
 */
export async function executeAssignmentAction(opportunityId: string, note?: string): Promise<AssignmentActionState> {
  const user = await requireUser();
  if (!(await checkAuthorized(user, "UPDATE", "CLOSING", { opportunityId }))) return { error: GENERIC_DENIAL };
  if (!canExecuteAssignment(user.role)) return { error: GENERIC_DENIAL };
  try {
    await executeAssignment(user.organizationId, opportunityId, user.id, note);
  } catch {
    return { error: "An assignment can only be executed once, from a drafted status." };
  }
  return done(opportunityId);
}

/** Cancel the assignment (NOT_STARTED / DRAFTED → CANCELLED) with a mandatory reason. */
export async function cancelAssignmentAction(opportunityId: string, reason: string): Promise<AssignmentActionState> {
  const user = await requireUser();
  if (!(await checkAuthorized(user, "UPDATE", "CLOSING", { opportunityId }))) return { error: GENERIC_DENIAL };
  if (!reason.trim()) return { error: "A cancellation reason is required." };
  try {
    await cancelAssignment(user.organizationId, opportunityId, user.id, reason);
  } catch {
    return { error: "This assignment cannot be cancelled from its current status." };
  }
  return done(opportunityId);
}
