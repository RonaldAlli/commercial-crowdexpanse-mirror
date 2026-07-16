"use server";

import { EscrowStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { checkAuthorized, GENERIC_DENIAL } from "@/lib/authorize";
import { canResolveEscrow } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  openEscrow,
  setEscrowDetails,
  markEscrowDeposited,
  linkEscrowProof,
  resolveEscrow,
  type EscrowDetails,
} from "@/lib/escrow-service";

// Server actions for Escrow (Closing Slice 2, EC-G). Authorization is enforced HERE: ordinary
// escrow work needs CLOSING write; resolving to a terminal money outcome additionally needs
// the ADMIN-only canResolveEscrow (EC-4). The pure lifecycle/snapshot rules live in lib/escrow
// and the DB orchestration in lib/escrow-service. Escrow never touches underwriting (EC-1).

export type EscrowActionState = { error?: string } | undefined;

const TERMINAL = new Set<string>(["RELEASED", "REFUNDED", "FORFEITED"]);

function done(opportunityId: string): EscrowActionState {
  revalidatePath(`/opportunities/${opportunityId}`);
  return undefined;
}

function intOrNull(raw: string | undefined) {
  if (raw === undefined) return undefined;
  const cleaned = raw.replace(/[,$%\s]/g, "");
  if (!cleaned) return null;
  const n = Number.parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : null;
}

function dateOrNull(raw: string | undefined) {
  if (raw === undefined) return undefined;
  if (!raw) return null;
  const d = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function strOrNull(raw: string | undefined) {
  if (raw === undefined) return undefined;
  const t = raw.trim();
  return t ? t : null;
}

export type EscrowDetailsInput = {
  earnestAmountUsd?: string;
  escrowHolderName?: string;
  escrowHolderContact?: string;
  earnestDueDate?: string;
  contingencyDeadline?: string;
};

function parseDetails(input: EscrowDetailsInput): EscrowDetails {
  return {
    earnestAmountUsd: intOrNull(input.earnestAmountUsd),
    escrowHolderName: strOrNull(input.escrowHolderName),
    escrowHolderContact: strOrNull(input.escrowHolderContact),
    earnestDueDate: dateOrNull(input.earnestDueDate),
    contingencyDeadline: dateOrNull(input.contingencyDeadline),
  };
}

/** Open escrow (materializes the record + OPENED), optionally seeding details. */
export async function openEscrowAction(opportunityId: string, input: EscrowDetailsInput = {}): Promise<EscrowActionState> {
  const user = await requireUser();
  if (!(await checkAuthorized(user, "CREATE", "CLOSING", { opportunityId }))) return { error: GENERIC_DENIAL };
  await openEscrow(user.organizationId, opportunityId, user.id, parseDetails(input));
  return done(opportunityId);
}

/** Update the mutable escrow fields (amount, holder, key dates). Rejected once terminal. */
export async function updateEscrowDetailsAction(opportunityId: string, input: EscrowDetailsInput): Promise<EscrowActionState> {
  const user = await requireUser();
  if (!(await checkAuthorized(user, "UPDATE", "CLOSING", { opportunityId }))) return { error: GENERIC_DENIAL };
  try {
    await setEscrowDetails(user.organizationId, opportunityId, user.id, parseDetails(input));
  } catch {
    return { error: "Escrow is resolved and can no longer be edited." };
  }
  return done(opportunityId);
}

/** Mark earnest money deposited (OPENED → DEPOSITED). */
export async function markEscrowDepositedAction(opportunityId: string, depositedDate?: string): Promise<EscrowActionState> {
  const user = await requireUser();
  if (!(await checkAuthorized(user, "UPDATE", "CLOSING", { opportunityId }))) return { error: GENERIC_DENIAL };
  try {
    await markEscrowDeposited(user.organizationId, opportunityId, user.id, dateOrNull(depositedDate) ?? undefined);
  } catch {
    return { error: "Escrow must be opened before it can be marked deposited." };
  }
  return done(opportunityId);
}

/** Link (or clear, with "") a proof-of-deposit Document scoped to this opportunity. */
export async function linkEscrowProofAction(opportunityId: string, documentId: string): Promise<EscrowActionState> {
  const user = await requireUser();
  if (!(await checkAuthorized(user, "UPDATE", "CLOSING", { opportunityId }))) return { error: GENERIC_DENIAL };
  let resolved: string | null = null;
  if (documentId) {
    const doc = await prisma.document.findFirst({
      where: { id: documentId, organizationId: user.organizationId, opportunityId },
      select: { id: true },
    });
    if (!doc) return { error: "Selected document was not found on this opportunity." };
    resolved = doc.id;
  }
  try {
    await linkEscrowProof(user.organizationId, opportunityId, user.id, resolved);
  } catch {
    return { error: "Escrow is resolved and can no longer be edited." };
  }
  return done(opportunityId);
}

/**
 * Resolve escrow to a terminal outcome (released/refunded/forfeited) — ADMIN only (EC-G/EC-4),
 * with a mandatory reason. Writes the immutable snapshot + freezes the record in the service.
 */
export async function resolveEscrowAction(opportunityId: string, target: string, reason: string): Promise<EscrowActionState> {
  const user = await requireUser();
  if (!(await checkAuthorized(user, "UPDATE", "CLOSING", { opportunityId }))) return { error: GENERIC_DENIAL };
  if (!canResolveEscrow(user.role)) return { error: GENERIC_DENIAL };
  if (!TERMINAL.has(target)) return { error: "Invalid escrow resolution." };
  if (!reason.trim()) return { error: "A resolution reason is required." };
  try {
    await resolveEscrow(user.organizationId, opportunityId, user.id, target as EscrowStatus, reason);
  } catch {
    return { error: "Escrow can only be resolved once, from a deposited state." };
  }
  return done(opportunityId);
}
