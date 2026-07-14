// Commercial Intelligence (v1.2, Commit 1a) — Owner data-access.
//
// The single home for reading/writing the Owner identity graph. Every function
// is ORG-SCOPED by construction (the load-bearing invariant: no query crosses
// organizationId). Permission enforcement lives in the server actions that wrap
// these (arriving with the UI in 1d) — matching the Authorization Principles
// (policy in lib/permissions, enforcement at the action call-site).
//
// Walking skeleton (Volume 12, S1-2): in 1a, displayName/entityType are written
// DIRECTLY here. In 1b the ProjectionService becomes their authoritative writer
// (Observation → Signal → Projection), and createOwner is refactored to route
// through it. Merge/unmerge is Commit 1a-2 — not here.
import type { OwnerEntityType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { computeMatchKey, findOwnerCandidates, type OwnerCandidate, type OwnerIdentityInput } from "@/lib/intelligence/owner-identity";

/** Create an owner. Computes the identity match key from the display name. */
export async function createOwner(
  organizationId: string,
  input: { displayName: string; entityType?: OwnerEntityType },
) {
  const matchKey = computeMatchKey({ displayName: input.displayName });
  return prisma.owner.create({
    data: {
      organizationId,
      displayName: input.displayName,
      entityType: input.entityType ?? "UNKNOWN",
      matchKey,
    },
  });
}

/** Fetch one owner, scoped to its org (returns null if not in this org). */
export async function getOwner(organizationId: string, id: string) {
  return prisma.owner.findFirst({ where: { id, organizationId } });
}

/** List an org's owners, newest first, with simple skip/take pagination. */
export async function listOwners(organizationId: string, { skip = 0, take = 20 } = {}) {
  return prisma.owner.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    skip,
    take,
  });
}

/** Link a seller to an owner. Both must belong to the org (else throws). */
export async function linkSellerToOwner(organizationId: string, sellerId: string, ownerId: string) {
  await assertInOrg(organizationId, ownerId, sellerId, "seller");
  return prisma.seller.update({ where: { id: sellerId }, data: { ownerId } });
}

/** Link a property to an owner. Both must belong to the org (else throws). */
export async function linkPropertyToOwner(organizationId: string, propertyId: string, ownerId: string) {
  await assertInOrg(organizationId, ownerId, propertyId, "property");
  return prisma.property.update({ where: { id: propertyId }, data: { ownerId } });
}

/**
 * Record a provider→owner mapping. IMMUTABLE (Volume 12 §7): this only ever
 * INSERTS — there is deliberately no update or delete of a crosswalk row. A
 * changed mapping is a new row. Unused until a provider adapter exists (1c+).
 */
export async function addOwnerExternalIdentifier(
  organizationId: string,
  ownerId: string,
  input: { provider: string; externalId: string; asOf?: Date },
) {
  const owner = await prisma.owner.findFirst({ where: { id: ownerId, organizationId }, select: { id: true } });
  if (!owner) throw new Error("Owner not found in organization");
  return prisma.ownerExternalIdentifier.create({
    data: { organizationId, ownerId, provider: input.provider, externalId: input.externalId, asOf: input.asOf },
  });
}

/**
 * Propose candidate owner matches for an input, within the org. Delegates to the
 * pure identity library; returns proposals only (never links — S1-4/S1-5).
 */
export async function findCandidatesForInput(
  organizationId: string,
  input: OwnerIdentityInput,
): Promise<OwnerCandidate[]> {
  const owners = await prisma.owner.findMany({
    where: { organizationId, status: "ACTIVE" },
    select: { id: true, matchKey: true, aliases: { select: { normalizedValue: true } } },
  });
  return findOwnerCandidates(
    input,
    owners.map((o) => ({ id: o.id, matchKey: o.matchKey, aliasNormalizedValues: o.aliases.map((a) => a.normalizedValue) })),
  );
}

// Guard: the owner and the target (seller/property) must both be in the org.
async function assertInOrg(organizationId: string, ownerId: string, targetId: string, kind: "seller" | "property") {
  const owner = await prisma.owner.findFirst({ where: { id: ownerId, organizationId }, select: { id: true } });
  if (!owner) throw new Error("Owner not found in organization");
  const target =
    kind === "seller"
      ? await prisma.seller.findFirst({ where: { id: targetId, organizationId }, select: { id: true } })
      : await prisma.property.findFirst({ where: { id: targetId, organizationId }, select: { id: true } });
  if (!target) throw new Error(`${kind[0].toUpperCase() + kind.slice(1)} not found in organization`);
}
