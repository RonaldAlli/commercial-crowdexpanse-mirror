"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { OwnerEntityType } from "@prisma/client";

import { requireUser } from "@/lib/auth";
import { authorize, checkAuthorized, GENERIC_DENIAL } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import { createOwner as createOwnerService, findCandidatesForInput, getOwner, linkSellerToOwner, linkPropertyToOwner, unlinkSellerFromOwner, unlinkPropertyFromOwner, updateOwnerField } from "@/lib/owners";
import { clearOwnerOverride as clearOwnerOverrideService } from "@/lib/intelligence/projection";
import { safeInternalPath } from "@/lib/safe-redirect";

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
export type OwnerContactFormState = { error?: string } | undefined;

function parseOwnerContact(formData: FormData) {
  const value = (key: string) => String(formData.get(key) ?? "").trim();
  return {
    label: value("label"),
    contactName: value("contactName"),
    company: value("company"),
    email: value("email"),
    phone: value("phone"),
    mailingAddress: value("mailingAddress"),
    notes: value("notes"),
    isPrimary: String(formData.get("isPrimary") ?? "") === "true",
  };
}

function orNull(value: string) {
  return value.length ? value : null;
}

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

// ── Linking / unlinking (Commit 1d-2a) ───────────────────────────────────────
// Operational-graph edits only: they change Seller.ownerId / Property.ownerId and
// NOTHING else — never identity, ledger, or projection (Volume 12: "linking never
// changes identity"). A move (re-link A→B) is a single atomic ownerId update via
// the domain service — there is never an intermediate null. Audit distinguishes
// owner.linked (was null) / owner.moved (A→B) / owner.unlinked (cleared).

async function logLink(
  user: { id: string; organizationId: string },
  kind: "seller" | "property",
  recordId: string,
  previousOwnerId: string | null,
  newOwnerId: string | null,
) {
  const eventType = newOwnerId === null ? "owner.unlinked" : previousOwnerId === null ? "owner.linked" : "owner.moved";
  await prisma.activityLog.create({
    data: {
      organizationId: user.organizationId,
      actorId: user.id,
      sellerId: kind === "seller" ? recordId : null,
      propertyId: kind === "property" ? recordId : null,
      eventType,
      eventLabel: `${kind[0].toUpperCase()}${kind.slice(1)} ${eventType.split(".")[1]}`,
      eventBody: JSON.stringify({ [`${kind}Id`]: recordId, previousOwnerId, newOwnerId, actorUserId: user.id }),
    },
  });
}

export async function linkSellerAction(formData: FormData) {
  const user = await requireUser();
  if (!(await checkAuthorized(user, "UPDATE", "OWNER"))) throw new Error(GENERIC_DENIAL);
  const sellerId = String(formData.get("sellerId") ?? "");
  const ownerId = String(formData.get("ownerId") ?? "");
  const redirectTo = safeInternalPath(formData.get("redirectTo"), `/owners/${ownerId}`);

  const seller = await prisma.seller.findFirst({ where: { id: sellerId, organizationId: user.organizationId }, select: { id: true, ownerId: true } });
  if (!seller) throw new Error("Seller not found.");
  const previousOwnerId = seller.ownerId;
  await linkSellerToOwner(user.organizationId, sellerId, ownerId); // atomic single update A→B
  await logLink(user, "seller", sellerId, previousOwnerId, ownerId);

  revalidatePath(`/owners/${ownerId}`);
  if (previousOwnerId && previousOwnerId !== ownerId) revalidatePath(`/owners/${previousOwnerId}`);
  revalidatePath(`/sellers/${sellerId}`);
  redirect(redirectTo);
}

export async function linkPropertyAction(formData: FormData) {
  const user = await requireUser();
  if (!(await checkAuthorized(user, "UPDATE", "OWNER"))) throw new Error(GENERIC_DENIAL);
  const propertyId = String(formData.get("propertyId") ?? "");
  const ownerId = String(formData.get("ownerId") ?? "");
  const redirectTo = safeInternalPath(formData.get("redirectTo"), `/owners/${ownerId}`);

  const property = await prisma.property.findFirst({ where: { id: propertyId, organizationId: user.organizationId }, select: { id: true, ownerId: true } });
  if (!property) throw new Error("Property not found.");
  const previousOwnerId = property.ownerId;
  await linkPropertyToOwner(user.organizationId, propertyId, ownerId); // atomic single update A→B
  await logLink(user, "property", propertyId, previousOwnerId, ownerId);

  revalidatePath(`/owners/${ownerId}`);
  if (previousOwnerId && previousOwnerId !== ownerId) revalidatePath(`/owners/${previousOwnerId}`);
  revalidatePath(`/properties/${propertyId}`);
  redirect(redirectTo);
}

export async function unlinkSellerAction(formData: FormData) {
  const user = await requireUser();
  if (!(await checkAuthorized(user, "UPDATE", "OWNER"))) throw new Error(GENERIC_DENIAL);
  const sellerId = String(formData.get("sellerId") ?? "");
  const redirectTo = safeInternalPath(formData.get("redirectTo"), `/sellers/${sellerId}`);

  const seller = await prisma.seller.findFirst({ where: { id: sellerId, organizationId: user.organizationId }, select: { id: true, ownerId: true } });
  if (!seller) throw new Error("Seller not found.");
  const previousOwnerId = seller.ownerId;
  await unlinkSellerFromOwner(user.organizationId, sellerId);
  if (previousOwnerId) {
    await logLink(user, "seller", sellerId, previousOwnerId, null);
    revalidatePath(`/owners/${previousOwnerId}`);
  }
  revalidatePath(`/sellers/${sellerId}`);
  redirect(redirectTo);
}

export async function unlinkPropertyAction(formData: FormData) {
  const user = await requireUser();
  if (!(await checkAuthorized(user, "UPDATE", "OWNER"))) throw new Error(GENERIC_DENIAL);
  const propertyId = String(formData.get("propertyId") ?? "");
  const redirectTo = safeInternalPath(formData.get("redirectTo"), `/properties/${propertyId}`);

  const property = await prisma.property.findFirst({ where: { id: propertyId, organizationId: user.organizationId }, select: { id: true, ownerId: true } });
  if (!property) throw new Error("Property not found.");
  const previousOwnerId = property.ownerId;
  await unlinkPropertyFromOwner(user.organizationId, propertyId);
  if (previousOwnerId) {
    await logLink(user, "property", propertyId, previousOwnerId, null);
    revalidatePath(`/owners/${previousOwnerId}`);
  }
  revalidatePath(`/properties/${propertyId}`);
  redirect(redirectTo);
}

function hasOwnerContactValue(data: ReturnType<typeof parseOwnerContact>) {
  return Boolean(data.label || data.contactName || data.company || data.email || data.phone || data.mailingAddress || data.notes);
}

export async function createOwnerContactAction(
  ownerId: string,
  _prev: OwnerContactFormState,
  formData: FormData,
): Promise<OwnerContactFormState> {
  const user = await requireUser();
  if (!(await checkAuthorized(user, "UPDATE", "OWNER", { targetId: ownerId }))) return { error: GENERIC_DENIAL };

  const owner = await prisma.owner.findFirst({ where: { id: ownerId, organizationId: user.organizationId }, select: { id: true, displayName: true } });
  if (!owner) return { error: "Owner not found." };

  const data = parseOwnerContact(formData);
  if (!hasOwnerContactValue(data)) {
    return { error: "Enter at least one piece of contact information." };
  }

  const contact = await prisma.$transaction(async (tx) => {
    if (data.isPrimary) {
      await tx.ownerContact.updateMany({
        where: { organizationId: user.organizationId, ownerId },
        data: { isPrimary: false },
      });
    }

    return tx.ownerContact.create({
      data: {
        organizationId: user.organizationId,
        ownerId,
        label: orNull(data.label),
        contactName: orNull(data.contactName),
        company: orNull(data.company),
        email: orNull(data.email),
        phone: orNull(data.phone),
        mailingAddress: orNull(data.mailingAddress),
        notes: orNull(data.notes),
        isPrimary: data.isPrimary,
      },
    });
  });

  await prisma.activityLog.create({
    data: {
      organizationId: user.organizationId,
      actorId: user.id,
      eventType: "owner.contact_created",
      eventLabel: `Owner contact added: ${owner.displayName}`,
      eventBody: JSON.stringify({ ownerId, ownerContactId: contact.id }),
    },
  });

  revalidatePath(`/owners/${ownerId}`);
  redirect(`/owners/${ownerId}`);
}

export async function updateOwnerContactAction(
  ownerId: string,
  contactId: string,
  _prev: OwnerContactFormState,
  formData: FormData,
): Promise<OwnerContactFormState> {
  const user = await requireUser();
  if (!(await checkAuthorized(user, "UPDATE", "OWNER", { targetId: ownerId }))) return { error: GENERIC_DENIAL };

  const [owner, existing] = await Promise.all([
    prisma.owner.findFirst({ where: { id: ownerId, organizationId: user.organizationId }, select: { id: true, displayName: true } }),
    prisma.ownerContact.findFirst({ where: { id: contactId, ownerId, organizationId: user.organizationId } }),
  ]);
  if (!owner) return { error: "Owner not found." };
  if (!existing) return { error: "Owner contact not found." };

  const data = parseOwnerContact(formData);
  if (!hasOwnerContactValue(data)) {
    return { error: "Enter at least one piece of contact information." };
  }

  await prisma.$transaction(async (tx) => {
    if (data.isPrimary) {
      await tx.ownerContact.updateMany({
        where: { organizationId: user.organizationId, ownerId, id: { not: contactId } },
        data: { isPrimary: false },
      });
    }

    await tx.ownerContact.update({
      where: { id: existing.id },
      data: {
        label: orNull(data.label),
        contactName: orNull(data.contactName),
        company: orNull(data.company),
        email: orNull(data.email),
        phone: orNull(data.phone),
        mailingAddress: orNull(data.mailingAddress),
        notes: orNull(data.notes),
        isPrimary: data.isPrimary,
      },
    });
  });

  await prisma.activityLog.create({
    data: {
      organizationId: user.organizationId,
      actorId: user.id,
      eventType: "owner.contact_updated",
      eventLabel: `Owner contact updated: ${owner.displayName}`,
      eventBody: JSON.stringify({ ownerId, ownerContactId: existing.id }),
    },
  });

  revalidatePath(`/owners/${ownerId}`);
  redirect(`/owners/${ownerId}`);
}

export async function deleteOwnerContactAction(ownerId: string, contactId: string) {
  const user = await requireUser();
  await authorize(user, "UPDATE", "OWNER", { targetId: ownerId });

  const [owner, existing] = await Promise.all([
    prisma.owner.findFirst({ where: { id: ownerId, organizationId: user.organizationId }, select: { id: true, displayName: true } }),
    prisma.ownerContact.findFirst({ where: { id: contactId, ownerId, organizationId: user.organizationId } }),
  ]);
  if (!owner || !existing) {
    redirect(`/owners/${ownerId}`);
  }

  await prisma.ownerContact.delete({ where: { id: existing.id } });
  await prisma.activityLog.create({
    data: {
      organizationId: user.organizationId,
      actorId: user.id,
      eventType: "owner.contact_deleted",
      eventLabel: `Owner contact deleted: ${owner.displayName}`,
      eventBody: JSON.stringify({ ownerId, ownerContactId: existing.id }),
    },
  });

  revalidatePath(`/owners/${ownerId}`);
  redirect(`/owners/${ownerId}`);
}
