"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { OwnerMergeReason } from "@prisma/client";

import { requireUser } from "@/lib/auth";
import { GENERIC_DENIAL } from "@/lib/authorize";
import { canMergeOwners } from "@/lib/permissions";
import { mergeConfirmedPair, unmergeByRecord } from "@/lib/owner-merge";

// Merge/unmerge actions (v1.2, Commit 1d-3b). ADMIN-ONLY (canMergeOwners): merge is
// the only workflow permitted to perform structural identity change. Each action is
// a thin, server-authoritative wrapper over the atomic orchestration — it validates
// the ADMIN gate + inputs, then delegates the merge/resolve (or unmerge/unresolve)
// to ONE transaction. It never trusts submitted counts, loser ids, or decision
// state (those are recomputed in the orchestration) and adds NO ActivityLog: the
// OwnerMergeRecord (+ the decision's resolution stamp) is the authoritative audit,
// so recording another event here would double-count.

/** Execute a merge for a CONFIRMED pair. The ADMIN explicitly submits the winner + reason. */
export async function mergeFromDecisionAction(formData: FormData) {
  const user = await requireUser();
  if (!canMergeOwners(user.role)) throw new Error(GENERIC_DENIAL);

  const decisionId = String(formData.get("decisionId") ?? "");
  const winnerId = String(formData.get("winnerId") ?? "");
  const reasonRaw = String(formData.get("reason") ?? "");
  const note = String(formData.get("note") ?? "").trim() || undefined;
  if (!decisionId || !winnerId) throw new Error("Select the surviving owner to merge.");
  if (!(reasonRaw in OwnerMergeReason)) throw new Error("Choose a valid merge reason.");

  // Atomic merge + decision resolution; the orchestration derives the loser and
  // re-validates the decision/owner state server-side.
  await mergeConfirmedPair(user.organizationId, { decisionId, winnerId, reason: reasonRaw as OwnerMergeReason, note, actorUserId: user.id });

  revalidatePath("/owners/merges");
  revalidatePath("/owners/candidates");
  redirect("/owners/merges");
}

/** Reverse a merge (LIFO), returning the still-CONFIRMED pair to the merge queue. */
export async function unmergeAction(formData: FormData) {
  const user = await requireUser();
  if (!canMergeOwners(user.role)) throw new Error(GENERIC_DENIAL);

  const mergeRecordId = String(formData.get("mergeRecordId") ?? "");
  if (!mergeRecordId) throw new Error("Missing merge record.");

  // Atomic unmerge + decision unresolution.
  await unmergeByRecord(user.organizationId, mergeRecordId, { actorUserId: user.id });

  revalidatePath("/owners/merges");
  revalidatePath("/owners/candidates");
  redirect("/owners/merges");
}
