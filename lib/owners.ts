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
import type { OwnerEntityType, OwnerMergeReason } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { computeMatchKey, findOwnerCandidates, normalizeOwnerName, type OwnerCandidate, type OwnerIdentityInput } from "@/lib/intelligence/owner-identity";
import { acceptObservationAsSignalTx, recordObservation } from "@/lib/intelligence/provenance";
import { recomputeOwner, recomputeOwnerField } from "@/lib/intelligence/projection";

type OwnerProjectedField = "displayName" | "entityType";

/**
 * Create a **ledger-native** owner (1b-2): the row's displayName/entityType are
 * seeded as USER_ENTERED signals and then projected, so the columns are backed
 * by the ledger from creation. The whole chain (row → signals → projection) is
 * one transaction — projection writes are transactional.
 */
export async function createOwner(
  organizationId: string,
  input: { displayName: string; entityType?: OwnerEntityType; actorUserId?: string },
) {
  const displayName = input.displayName;
  const entityType = input.entityType ?? "UNKNOWN";
  const matchKey = computeMatchKey({ displayName });
  const sourceId = input.actorUserId ?? "user";
  return prisma.$transaction(async (tx) => {
    const owner = await tx.owner.create({ data: { organizationId, displayName, entityType, matchKey } });
    const now = new Date();
    const nameObs = await recordObservation(organizationId, { entityType: "OWNER", entityId: owner.id, fieldKey: "displayName", valueRaw: displayName, valueNormalized: matchKey, sourceCategory: "USER_ENTERED", sourceId, asOf: now, method: "create" }, tx);
    await acceptObservationAsSignalTx(tx, organizationId, nameObs.id);
    const typeObs = await recordObservation(organizationId, { entityType: "OWNER", entityId: owner.id, fieldKey: "entityType", valueRaw: entityType, sourceCategory: "USER_ENTERED", sourceId, asOf: now, method: "create" }, tx);
    await acceptObservationAsSignalTx(tx, organizationId, typeObs.id);
    await recomputeOwner(organizationId, owner.id, tx);
    return tx.owner.findUniqueOrThrow({ where: { id: owner.id } });
  });
}

/**
 * Update a projected Owner field by appending a signal and reprojecting — the
 * write path the UI (1d) calls. Atomic: observation → signal → projection commit
 * together. `isOverride` writes a sticky user pin (Volume 12 S1-6).
 */
export async function updateOwnerField(
  organizationId: string,
  ownerId: string,
  fieldKey: OwnerProjectedField,
  value: string,
  opts: { isOverride?: boolean; actorUserId?: string } = {},
) {
  return prisma.$transaction(async (tx) => {
    const owner = await tx.owner.findFirst({ where: { id: ownerId, organizationId }, select: { id: true } });
    if (!owner) throw new Error("Owner not found in organization");
    const valueNormalized = fieldKey === "displayName" ? normalizeOwnerName(value) : value;
    const obs = await recordObservation(organizationId, { entityType: "OWNER", entityId: ownerId, fieldKey, valueRaw: value, valueNormalized, sourceCategory: "USER_ENTERED", sourceId: opts.actorUserId ?? "user", asOf: new Date(), method: "manual" }, tx);
    await acceptObservationAsSignalTx(tx, organizationId, obs.id, { isOverride: opts.isOverride });
    await recomputeOwnerField(organizationId, ownerId, fieldKey, tx);
    return tx.owner.findUniqueOrThrow({ where: { id: ownerId } });
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

// ── Merge / unmerge (Commit 1a-2) — reversible, structural only ───────────────
// Merge is STRUCTURAL (Volume 12): it repoints the mutable operational graph
// (Property/Seller.ownerId) and tombstones the loser (status=MERGED,
// mergedIntoId=winner). It never moves immutable identity rows — external ids
// stay on the loser and resolution follows the merge chain — and never
// reconciles business data (contacts/notes/intelligence/provenance/scores). The
// exact reversal payload is recorded so unmerge restores the graph precisely.

/** Merge `loserId` into `winnerId`. Both must be ACTIVE + same org. Transactional. */
export async function mergeOwners(
  organizationId: string,
  input: { winnerId: string; loserId: string; reason: OwnerMergeReason; note?: string; actorUserId?: string },
) {
  const { winnerId, loserId, reason, note, actorUserId } = input;
  if (winnerId === loserId) throw new Error("Cannot merge an owner into itself");

  return prisma.$transaction(async (tx) => {
    const winner = await tx.owner.findFirst({ where: { id: winnerId, organizationId } });
    const loser = await tx.owner.findFirst({ where: { id: loserId, organizationId } });
    if (!winner || winner.status !== "ACTIVE") throw new Error("Winner not found or not ACTIVE");
    if (!loser || loser.status !== "ACTIVE") throw new Error("Loser not found or not ACTIVE");

    // Repoint the mutable operational graph loser → winner (record for reversal).
    const sellers = await tx.seller.findMany({ where: { organizationId, ownerId: loserId }, select: { id: true } });
    const properties = await tx.property.findMany({ where: { organizationId, ownerId: loserId }, select: { id: true } });
    const movedSellerIds = sellers.map((s) => s.id);
    const movedPropertyIds = properties.map((p) => p.id);
    if (movedSellerIds.length) await tx.seller.updateMany({ where: { id: { in: movedSellerIds } }, data: { ownerId: winnerId } });
    if (movedPropertyIds.length) await tx.property.updateMany({ where: { id: { in: movedPropertyIds } }, data: { ownerId: winnerId } });

    // Preserve the loser's names as merge-derived aliases on the winner (so the
    // winner stays findable). These are additive and tracked for exact removal.
    const loserAliases = await tx.ownerAlias.findMany({ where: { ownerId: loserId }, select: { value: true } });
    const aliasValues = [loser.displayName, ...loserAliases.map((a) => a.value)];
    const addedAliasIds: string[] = [];
    for (const value of aliasValues) {
      const alias = await tx.ownerAlias.create({
        data: { ownerId: winnerId, value, normalizedValue: normalizeOwnerName(value), sourceCategory: "CALCULATION" },
      });
      addedAliasIds.push(alias.id);
    }

    // Tombstone the loser (external-id rows stay on it, immutable).
    await tx.owner.update({ where: { id: loserId }, data: { status: "MERGED", mergedIntoId: winnerId } });

    return tx.ownerMergeRecord.create({
      data: { organizationId, winnerId, loserId, reason, note, movedSellerIds, movedPropertyIds, addedAliasIds, mergedByUserId: actorUserId },
    });
  });
}

/** Reverse an ACTIVE merge record, restoring the graph exactly. Transactional. */
export async function unmergeOwners(organizationId: string, mergeRecordId: string, opts: { actorUserId?: string } = {}) {
  return prisma.$transaction(async (tx) => {
    const rec = await tx.ownerMergeRecord.findFirst({ where: { id: mergeRecordId, organizationId } });
    if (!rec) throw new Error("Merge record not found");
    if (rec.status !== "ACTIVE") throw new Error("Merge already reversed");
    // LIFO: the winner must still be ACTIVE (not itself since merged away).
    const winner = await tx.owner.findFirst({ where: { id: rec.winnerId, organizationId } });
    if (!winner || winner.status !== "ACTIVE") throw new Error("Winner is not ACTIVE — reverse later merges first (LIFO)");

    if (rec.movedSellerIds.length) await tx.seller.updateMany({ where: { id: { in: rec.movedSellerIds } }, data: { ownerId: rec.loserId } });
    if (rec.movedPropertyIds.length) await tx.property.updateMany({ where: { id: { in: rec.movedPropertyIds } }, data: { ownerId: rec.loserId } });
    if (rec.addedAliasIds.length) await tx.ownerAlias.deleteMany({ where: { id: { in: rec.addedAliasIds } } });
    await tx.owner.update({ where: { id: rec.loserId }, data: { status: "ACTIVE", mergedIntoId: null } });

    return tx.ownerMergeRecord.update({
      where: { id: rec.id },
      data: { status: "REVERSED", reversedByUserId: opts.actorUserId, reversedAt: new Date() },
    });
  });
}

/**
 * Follow the merge chain to the surviving canonical owner. A MERGED owner points
 * (via mergedIntoId) to its winner; this returns the first ACTIVE owner reached.
 * Forward-useful for external-id resolution (1c). Cycle-guarded.
 */
export async function resolveCanonicalOwner(organizationId: string, ownerId: string) {
  let current = await prisma.owner.findFirst({ where: { id: ownerId, organizationId } });
  const seen = new Set<string>();
  while (current && current.status === "MERGED" && current.mergedIntoId && !seen.has(current.id)) {
    seen.add(current.id);
    current = await prisma.owner.findFirst({ where: { id: current.mergedIntoId, organizationId } });
  }
  return current;
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
