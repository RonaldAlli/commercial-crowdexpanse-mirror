"use server";

import { FinancingStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { checkAuthorized, GENERIC_DENIAL } from "@/lib/authorize";
import { canResolveFinancing } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  startFinancing,
  advanceFinancingStatus,
  setFinancingLender,
  setFinancingMilestone,
  linkFinancingDocuments,
  resolveFinancing,
  type MilestoneField,
} from "@/lib/financing-service";

// Server actions for Financing (Closing Slice 3, FC-G). Authorization is enforced HERE:
// ordinary financing work needs CLOSING write; resolving to a terminal outcome (funded /
// denied / withdrawn) additionally needs the ADMIN-only canResolveFinancing (FC-6). The pure
// lifecycle/snapshot rules live in lib/financing and the DB orchestration in lib/financing-
// service. Financing NEVER reads into or writes the underwriting engine (FC-0/FC-1/FC-11..14).

export type FinancingActionState = { error?: string } | undefined;

const NON_TERMINAL = new Set<string>(["APPLIED", "COMMITTED", "CLEARED"]);
const TERMINAL = new Set<string>(["FUNDED", "DENIED", "WITHDRAWN"]);
const MILESTONE = new Set<string>(["appraisalOrderedDate", "appraisalCompletedDate", "conditionsReceivedDate", "closingPackageReceivedDate"]);

function done(opportunityId: string): FinancingActionState {
  revalidatePath(`/opportunities/${opportunityId}`);
  return undefined;
}

function strOrNull(raw: string | undefined) {
  if (raw === undefined) return undefined;
  const t = raw.trim();
  return t ? t : null;
}

function dateOrNull(raw: string | undefined) {
  if (raw === undefined) return undefined;
  if (!raw) return null;
  const d = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Materialize the financing record (NOT_STARTED) so the team can begin tracking. */
export async function startFinancingAction(opportunityId: string): Promise<FinancingActionState> {
  const user = await requireUser();
  if (!(await checkAuthorized(user, "CREATE", "CLOSING", { opportunityId }))) return { error: GENERIC_DENIAL };
  await startFinancing(user.organizationId, opportunityId, user.id);
  return done(opportunityId);
}

/** Advance along a non-terminal edge (APPLIED / COMMITTED / CLEARED), stamping its milestone date. */
export async function advanceFinancingAction(opportunityId: string, target: string): Promise<FinancingActionState> {
  const user = await requireUser();
  if (!(await checkAuthorized(user, "UPDATE", "CLOSING", { opportunityId }))) return { error: GENERIC_DENIAL };
  if (!NON_TERMINAL.has(target)) return { error: "Invalid financing transition." };
  try {
    await advanceFinancingStatus(user.organizationId, opportunityId, user.id, target as FinancingStatus);
  } catch {
    return { error: "That financing transition is not allowed from the current status." };
  }
  return done(opportunityId);
}

export type FinancingLenderInput = { lenderName?: string; lenderContact?: string };

/** Update the free-text lender fields. Rejected once terminal. */
export async function setFinancingLenderAction(opportunityId: string, input: FinancingLenderInput): Promise<FinancingActionState> {
  const user = await requireUser();
  if (!(await checkAuthorized(user, "UPDATE", "CLOSING", { opportunityId }))) return { error: GENERIC_DENIAL };
  try {
    await setFinancingLender(user.organizationId, opportunityId, user.id, {
      lenderName: strOrNull(input.lenderName),
      lenderContact: strOrNull(input.lenderContact),
    });
  } catch {
    return { error: "Financing is resolved and can no longer be edited." };
  }
  return done(opportunityId);
}

/** Set (or clear, with "") one informational milestone date. Rejected once terminal. */
export async function setFinancingMilestoneAction(opportunityId: string, field: string, date: string): Promise<FinancingActionState> {
  const user = await requireUser();
  if (!(await checkAuthorized(user, "UPDATE", "CLOSING", { opportunityId }))) return { error: GENERIC_DENIAL };
  if (!MILESTONE.has(field)) return { error: "Unknown milestone field." };
  try {
    await setFinancingMilestone(user.organizationId, opportunityId, user.id, field as MilestoneField, dateOrNull(date) ?? null);
  } catch {
    return { error: "Financing is resolved and can no longer be edited." };
  }
  return done(opportunityId);
}

export type FinancingDocumentsInput = { commitmentLetterDocumentId?: string; appraisalDocumentId?: string };

/** Link (or clear, with "") the commitment-letter and/or appraisal Documents, scoped to this opportunity. */
export async function linkFinancingDocumentsAction(opportunityId: string, input: FinancingDocumentsInput): Promise<FinancingActionState> {
  const user = await requireUser();
  if (!(await checkAuthorized(user, "UPDATE", "CLOSING", { opportunityId }))) return { error: GENERIC_DENIAL };

  const resolve = async (id: string | undefined) => {
    if (id === undefined) return undefined;
    if (!id) return null;
    const doc = await prisma.document.findFirst({
      where: { id, organizationId: user.organizationId, opportunityId },
      select: { id: true },
    });
    if (!doc) throw new Error("not found");
    return doc.id;
  };

  let commitment: string | null | undefined;
  let appraisal: string | null | undefined;
  try {
    commitment = await resolve(input.commitmentLetterDocumentId);
    appraisal = await resolve(input.appraisalDocumentId);
  } catch {
    return { error: "Selected document was not found on this opportunity." };
  }

  try {
    await linkFinancingDocuments(user.organizationId, opportunityId, user.id, {
      commitmentLetterDocumentId: commitment,
      appraisalDocumentId: appraisal,
    });
  } catch {
    return { error: "Financing is resolved and can no longer be edited." };
  }
  return done(opportunityId);
}

/**
 * Resolve financing to a terminal outcome (funded / denied / withdrawn) — ADMIN only (FC-G/FC-6),
 * with a mandatory reason. Captures the FC-J snapshot + freezes the record in the service.
 */
export async function resolveFinancingAction(opportunityId: string, target: string, reason: string): Promise<FinancingActionState> {
  const user = await requireUser();
  if (!(await checkAuthorized(user, "UPDATE", "CLOSING", { opportunityId }))) return { error: GENERIC_DENIAL };
  if (!canResolveFinancing(user.role)) return { error: GENERIC_DENIAL };
  if (!TERMINAL.has(target)) return { error: "Invalid financing resolution." };
  if (!reason.trim()) return { error: "A resolution reason is required." };
  try {
    await resolveFinancing(user.organizationId, opportunityId, user.id, target as FinancingStatus, reason);
  } catch {
    return { error: "Financing can only be resolved once, from an active status." };
  }
  return done(opportunityId);
}
