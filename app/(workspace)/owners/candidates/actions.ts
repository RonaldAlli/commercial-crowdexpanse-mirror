"use server";

import { revalidatePath } from "next/cache";
import type { OwnerMatchStatus } from "@prisma/client";

import { requireUser } from "@/lib/auth";
import { checkAuthorized, GENERIC_DENIAL } from "@/lib/authorize";
import { canReopenMatchDecision } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { pairContext, recordDecision, reopenDecision } from "@/lib/owner-match";

// Candidate-review actions (v1.2, Commit 1d-2b). Decision-support ONLY: they write
// OwnerMatchDecision rows and audit events — never mergeOwners, never owner
// create/delete, never Observations/Signals (Volume 12: "Candidate Review records
// human decisions only"). The reason + fingerprint are recomputed SERVER-SIDE from
// current owner state; client-supplied values are never trusted.

async function decide(formData: FormData, status: OwnerMatchStatus) {
  const user = await requireUser();
  if (!(await checkAuthorized(user, "MANAGE", "OWNER_IDENTITY"))) throw new Error(GENERIC_DENIAL);
  const ctx = await pairContext(user.organizationId, String(formData.get("ownerIdA") ?? ""), String(formData.get("ownerIdB") ?? ""));
  await recordDecision(user.organizationId, { ...ctx, status, decidedByUserId: user.id });
  await prisma.activityLog.create({
    data: {
      organizationId: user.organizationId,
      actorId: user.id,
      eventType: status === "CONFIRMED" ? "owner.candidate_confirmed" : "owner.candidate_dismissed",
      eventLabel: `Owner candidate ${status === "CONFIRMED" ? "confirmed" : "dismissed"}`,
      eventBody: JSON.stringify({ ownerIdA: ctx.ownerIdA, ownerIdB: ctx.ownerIdB, reason: ctx.reason, fingerprint: ctx.fingerprint, actorUserId: user.id }),
    },
  });
  revalidatePath("/owners/candidates");
}

/** Confirm a pair as the same identity — records a decision only; NEVER merges (candidate ≠ merge). */
export async function confirmCandidateAction(formData: FormData) {
  return decide(formData, "CONFIRMED");
}

/** Dismiss a pair as distinct owners — suppressed until a material identity change or ADMIN reopen. */
export async function dismissCandidateAction(formData: FormData) {
  return decide(formData, "DISMISSED");
}

/** ADMIN-only: explicitly reopen a decision so the pair returns to the pending queue. */
export async function reopenCandidateAction(formData: FormData) {
  const user = await requireUser();
  if (!canReopenMatchDecision(user.role)) throw new Error(GENERIC_DENIAL);
  const ownerIdA = String(formData.get("ownerIdA") ?? "");
  const ownerIdB = String(formData.get("ownerIdB") ?? "");
  await reopenDecision(user.organizationId, ownerIdA, ownerIdB, user.id);
  await prisma.activityLog.create({
    data: {
      organizationId: user.organizationId,
      actorId: user.id,
      eventType: "owner.candidate_reopened",
      eventLabel: "Owner candidate reopened",
      eventBody: JSON.stringify({ ownerIdA, ownerIdB, actorUserId: user.id }),
    },
  });
  revalidatePath("/owners/candidates");
}
