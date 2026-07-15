// Commercial Intelligence (v1.2, Commit 2a-ii) — ledger-backed Property projection.
//
// The Property analogue of projection.ts: COMPUTES the typed Property columns
// (yearBuilt, squareFeet) from the accepted signals via the SAME pure precedence
// engine and writes them. Deterministic: identical ledger → identical projection
// (Volume 12). All functions accept a tx so callers keep append+project atomic.
//
// This is a *parallel* projection writer, not a fork of the substrate — it reuses
// the shared `selectWinner` precedence and the shared ledger tables; only the
// typed-column write is Property-specific (the entity-specific logic the entity
// registry dispatches to). Owner projection is untouched.
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { PROPERTY_PROJECTED_FIELDS, type PropertyProjectedField } from "@/lib/intelligence/property-fields";
import { selectWinner } from "@/lib/intelligence/projection-precedence";

async function winningValue(
  db: Prisma.TransactionClient | typeof prisma,
  organizationId: string,
  propertyId: string,
  fieldKey: string,
): Promise<string | null> {
  const signals = await db.intelligenceSignal.findMany({
    where: { organizationId, entityType: "PROPERTY", entityId: propertyId, fieldKey, state: "ACCEPTED" },
    select: { id: true, isOverride: true, asOf: true, confidence: true, sourceCategory: true, valueRaw: true },
  });
  const winner = selectWinner(signals);
  return winner ? winner.valueRaw : null;
}

/** Recompute one projected Property field from the ledger (writes the typed column). */
export async function recomputePropertyField(
  organizationId: string,
  propertyId: string,
  fieldKey: PropertyProjectedField,
  db: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const value = await winningValue(db, organizationId, propertyId, fieldKey);
  if (value === null) return; // no accepted signal for this field — leave the column as-is
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return; // canonical signal values are always numeric; guard defensively
  const data: Prisma.PropertyUpdateInput = fieldKey === "yearBuilt" ? { yearBuilt: n } : { squareFeet: n };
  await db.property.update({ where: { id: propertyId }, data });
}

/** Recompute every projected Property field from the ledger. */
export async function recomputeProperty(
  organizationId: string,
  propertyId: string,
  db: Prisma.TransactionClient | typeof prisma = prisma,
) {
  for (const f of PROPERTY_PROJECTED_FIELDS) await recomputePropertyField(organizationId, propertyId, f, db);
}

/**
 * Rebuild the Property projection ENTIRELY from the ledger — the disposable-
 * projection contract (the Projection Reconstruction Standard). Functionally
 * identical to recomputeProperty; named to signal "drop and rebuild". Must
 * reproduce the live projection byte-for-byte.
 */
export const rebuildProperty = recomputeProperty;
