// Commercial Intelligence (v1.2, Commit 1b-2) — ledger-backed projection engine.
//
// The ProjectionService COMPUTES the typed Owner columns from the accepted
// signals (via the pure precedence engine) and writes them. It is the
// authoritative writer of displayName/entityType; matchKey is derived from the
// projected displayName. Deterministic: identical ledger → identical projection
// (Volume 12). All functions accept a tx so callers can keep the append+project
// chain atomic ("projection writes are transactional").
import type { OwnerEntityType, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { computeMatchKey } from "@/lib/intelligence/owner-identity";
import { OWNER_PROJECTED_FIELDS, type OwnerProjectedField } from "@/lib/intelligence/owner-fields";
import { selectWinner } from "@/lib/intelligence/projection-precedence";

// The projected-field list lives in the pure owner-fields module; re-exported
// here so existing importers (owners.ts, tests) keep their import path.
export { OWNER_PROJECTED_FIELDS };

async function winningValue(
  db: Prisma.TransactionClient | typeof prisma,
  organizationId: string,
  ownerId: string,
  fieldKey: string,
): Promise<string | null> {
  const signals = await db.intelligenceSignal.findMany({
    where: { organizationId, entityType: "OWNER", entityId: ownerId, fieldKey, state: "ACCEPTED" },
    select: { id: true, isOverride: true, asOf: true, confidence: true, sourceCategory: true, valueRaw: true },
  });
  const winner = selectWinner(signals);
  return winner ? winner.valueRaw : null;
}

/** Recompute one projected Owner field (and matchKey when displayName changes) from the ledger. */
export async function recomputeOwnerField(
  organizationId: string,
  ownerId: string,
  fieldKey: OwnerProjectedField,
  db: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const value = await winningValue(db, organizationId, ownerId, fieldKey);
  if (value === null) return; // no accepted signal for this field — leave the column as-is
  if (fieldKey === "displayName") {
    await db.owner.update({ where: { id: ownerId }, data: { displayName: value, matchKey: computeMatchKey({ displayName: value }) } });
  } else {
    await db.owner.update({ where: { id: ownerId }, data: { entityType: value as OwnerEntityType } });
  }
}

/** Recompute every projected Owner field from the ledger. */
export async function recomputeOwner(
  organizationId: string,
  ownerId: string,
  db: Prisma.TransactionClient | typeof prisma = prisma,
) {
  for (const f of OWNER_PROJECTED_FIELDS) await recomputeOwnerField(organizationId, ownerId, f, db);
}

/**
 * Rebuild the Owner projection ENTIRELY from the ledger — the disposable-
 * projection contract. Functionally identical to recomputeOwner; named to signal
 * "drop and rebuild." Must reproduce the live projection byte-for-byte.
 */
export const rebuildOwner = recomputeOwner;

/**
 * Clear an active override pin on a field: supersede the pinned signal (terminal
 * SUPERSEDED, no successor — an explicit user action, per the immutability rule)
 * and recompute so the projection falls back to the next-best signal. Atomic.
 */
export async function clearOwnerOverride(organizationId: string, ownerId: string, fieldKey: OwnerProjectedField) {
  return prisma.$transaction(async (tx) => {
    const pin = await tx.intelligenceSignal.findFirst({
      where: { organizationId, entityType: "OWNER", entityId: ownerId, fieldKey, state: "ACCEPTED", isOverride: true },
    });
    if (!pin) throw new Error("No active override to clear");
    await tx.intelligenceSignal.update({ where: { id: pin.id }, data: { state: "SUPERSEDED" } });
    await recomputeOwnerField(organizationId, ownerId, fieldKey, tx);
  });
}
