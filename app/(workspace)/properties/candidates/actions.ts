"use server";

import { revalidatePath } from "next/cache";
import type { PropertyMatchStatus } from "@prisma/client";

import { requireUser } from "@/lib/auth";
import { checkAuthorized, GENERIC_DENIAL } from "@/lib/authorize";
import { canReopenMatchDecision } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { pairContextProperty, recordPropertyMatchDecision, reopenPropertyMatchDecision } from "@/lib/property-match";

// Property candidate-review actions (v1.2, Commit 2c-iii). Decision-support ONLY:
// they write PropertyMatchDecision rows + audit events — never resolve, create,
// delete, repoint, or merge a Property, and never write Observations/Signals
// (Human Review Principles P3). The basis + fingerprint are recomputed SERVER-SIDE
// from current identity state (pairContextProperty); client-supplied values are
// never trusted. The UI exposes the engine's outcomes — it does not create new ones.

async function decide(formData: FormData, status: PropertyMatchStatus) {
  const user = await requireUser();
  if (!(await checkAuthorized(user, "MANAGE", "PROPERTY_IDENTITY"))) throw new Error(GENERIC_DENIAL);
  const ctx = await pairContextProperty(user.organizationId, String(formData.get("propertyIdA") ?? ""), String(formData.get("propertyIdB") ?? ""));
  await recordPropertyMatchDecision(user.organizationId, { ...ctx, status, decidedByUserId: user.id });
  await prisma.activityLog.create({
    data: {
      organizationId: user.organizationId,
      propertyId: ctx.propertyIdA,
      actorId: user.id,
      eventType: status === "CONFIRMED" ? "property.candidate_confirmed" : "property.candidate_dismissed",
      eventLabel: `Property candidate ${status === "CONFIRMED" ? "confirmed" : "dismissed"}`,
      eventBody: JSON.stringify({ propertyIdA: ctx.propertyIdA, propertyIdB: ctx.propertyIdB, basis: ctx.basis, fingerprint: ctx.fingerprint, actorUserId: user.id }),
    },
  });
  revalidatePath("/properties/candidates");
}

/** Confirm a pair as the same identity — records a decision only; NEVER merges (candidate ≠ merge; merge deferred). */
export async function confirmPropertyCandidateAction(formData: FormData) {
  return decide(formData, "CONFIRMED");
}

/** Dismiss a pair as distinct properties — suppressed until a material identity change or ADMIN reopen. */
export async function dismissPropertyCandidateAction(formData: FormData) {
  return decide(formData, "DISMISSED");
}

/** ADMIN-only: explicitly reopen a decision so the pair returns to the pending queue. */
export async function reopenPropertyCandidateAction(formData: FormData) {
  const user = await requireUser();
  if (!canReopenMatchDecision(user.role)) throw new Error(GENERIC_DENIAL);
  const propertyIdA = String(formData.get("propertyIdA") ?? "");
  const propertyIdB = String(formData.get("propertyIdB") ?? "");
  await reopenPropertyMatchDecision(user.organizationId, propertyIdA, propertyIdB, user.id);
  await prisma.activityLog.create({
    data: {
      organizationId: user.organizationId,
      propertyId: propertyIdA,
      actorId: user.id,
      eventType: "property.candidate_reopened",
      eventLabel: "Property candidate reopened",
      eventBody: JSON.stringify({ propertyIdA, propertyIdB, actorUserId: user.id }),
    },
  });
  revalidatePath("/properties/candidates");
}
