"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { OwnerEntityType } from "@prisma/client";

import { requireUser } from "@/lib/auth";
import { checkAuthorized, GENERIC_DENIAL } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import { createOwner as createOwnerService, findCandidatesForInput, getOwner, updateOwnerField } from "@/lib/owners";
import { clearOwnerOverride as clearOwnerOverrideService } from "@/lib/intelligence/projection";

// Owner UI server actions (v1.2, Commit 1d-1). THIN wrappers: authorize → call the
// domain service (which owns the Observation → Signal → Projection write path) →
// audit → revalidate. They NEVER write displayName/entityType/matchKey directly —
// the ledger stays the single source of truth (Volume 12: "the UI never writes
// projections directly"). Owner events are logged into ActivityLog.eventBody with
// no ownerId FK (migration-free); field-level history already lives in the ledger.

const ENTITY_TYPES = new Set<string>(Object.values(OwnerEntityType));
function parseEntityType(raw: string): OwnerEntityType {
  return (ENTITY_TYPES.has(raw) ? raw : "UNKNOWN") as OwnerEntityType;
}

export type OwnerCandidateView = { id: string; displayName: string; identityConfidence: number; reason: string };
export type OwnerFormState =
  | { error?: string; candidates?: OwnerCandidateView[]; values?: { displayName: string; entityType: string } }
  | undefined;

/**
 * Create an Owner. Create-time candidate review: unless the form confirms, we
 * surface possible duplicates (proposal only — never links) and let the user
 * "Create anyway". All creation flows through the ledger-native createOwner.
 */
export async function createOwnerAction(_prev: OwnerFormState, formData: FormData): Promise<OwnerFormState> {
  const user = await requireUser();
  if (!(await checkAuthorized(user, "CREATE", "OWNER"))) return { error: GENERIC_DENIAL };

  const displayName = String(formData.get("displayName") ?? "").trim();
  const entityType = parseEntityType(String(formData.get("entityType") ?? "UNKNOWN").trim());
  const confirmed = String(formData.get("confirm") ?? "") === "true";
  if (!displayName) return { error: "Owner name is required." };

  // Create-time duplicate warning (server round-trip; proposal only).
  if (!confirmed) {
    const candidates = await findCandidatesForInput(user.organizationId, { displayName });
    if (candidates.length) {
      const owners = await prisma.owner.findMany({
        where: { organizationId: user.organizationId, id: { in: candidates.map((c) => c.ownerId) } },
        select: { id: true, displayName: true },
      });
      const nameById = new Map(owners.map((o) => [o.id, o.displayName]));
      return {
        candidates: candidates.map((c) => ({ id: c.ownerId, displayName: nameById.get(c.ownerId) ?? "(unknown)", identityConfidence: c.identityConfidence, reason: c.reason })),
        values: { displayName, entityType },
      };
    }
  }

  const owner = await createOwnerService(user.organizationId, { displayName, entityType, actorUserId: user.id });
  await prisma.activityLog.create({
    data: { organizationId: user.organizationId, actorId: user.id, eventType: "owner.created", eventLabel: `Owner created: ${displayName}`, eventBody: JSON.stringify({ ownerId: owner.id, entityType }) },
  });
  revalidatePath("/owners");
  redirect(`/owners/${owner.id}`);
}

/**
 * Update the projected Owner fields. Each changed field is appended to the ledger
 * (and optionally pinned as an override) via updateOwnerField, then reprojected —
 * never a direct column write.
 */
export async function updateOwnerFieldsAction(id: string, _prev: OwnerFormState, formData: FormData): Promise<OwnerFormState> {
  const user = await requireUser();
  if (!(await checkAuthorized(user, "UPDATE", "OWNER", { targetId: id }))) return { error: GENERIC_DENIAL };

  const owner = await getOwner(user.organizationId, id);
  if (!owner) return { error: "Owner not found." };

  const displayName = String(formData.get("displayName") ?? "").trim();
  const entityType = parseEntityType(String(formData.get("entityType") ?? "UNKNOWN").trim());
  const pinDisplayName = String(formData.get("pinDisplayName") ?? "") === "true";
  const pinEntityType = String(formData.get("pinEntityType") ?? "") === "true";
  if (!displayName) return { error: "Owner name is required." };

  const changed: string[] = [];
  if (displayName !== owner.displayName || pinDisplayName) {
    await updateOwnerField(user.organizationId, id, "displayName", displayName, { isOverride: pinDisplayName, actorUserId: user.id });
    changed.push("displayName");
  }
  if (entityType !== owner.entityType || pinEntityType) {
    await updateOwnerField(user.organizationId, id, "entityType", entityType, { isOverride: pinEntityType, actorUserId: user.id });
    changed.push("entityType");
  }

  if (changed.length) {
    await prisma.activityLog.create({
      data: { organizationId: user.organizationId, actorId: user.id, eventType: "owner.updated", eventLabel: `Owner updated: ${displayName}`, eventBody: JSON.stringify({ ownerId: id, changed }) },
    });
  }
  revalidatePath("/owners");
  revalidatePath(`/owners/${id}`);
  redirect(`/owners/${id}`);
}

/** Clear an active override pin on a projected field; projection falls back to the next-best signal. */
export async function clearOverrideAction(id: string, fieldKey: "displayName" | "entityType") {
  const user = await requireUser();
  if (!(await checkAuthorized(user, "UPDATE", "OWNER", { targetId: id }))) throw new Error(GENERIC_DENIAL);

  const owner = await getOwner(user.organizationId, id);
  if (!owner) throw new Error("Owner not found.");

  await clearOwnerOverrideService(user.organizationId, id, fieldKey);
  await prisma.activityLog.create({
    data: { organizationId: user.organizationId, actorId: user.id, eventType: "owner.override_cleared", eventLabel: `Owner override cleared: ${fieldKey}`, eventBody: JSON.stringify({ ownerId: id, fieldKey }) },
  });
  revalidatePath(`/owners/${id}`);
}
