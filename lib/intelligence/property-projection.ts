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
import { PROPERTY_FIELDS, PROPERTY_PROJECTED_FIELDS, isPropertyAnchorField, type PropertyProjectedField } from "@/lib/intelligence/property-fields";
import { selectWinner } from "@/lib/intelligence/projection-precedence";
import { rebuildPropertyIdentity } from "@/lib/intelligence/property-identity";

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * The winning NORMALIZED value for a field. Reads `valueNormalized` (the canonical
 * projection value) — raw is preserved separately in the ledger (invariant #3), so
 * projection must NOT read valueRaw.
 */
async function winningValue(db: Db, organizationId: string, propertyId: string, fieldKey: string): Promise<string | null> {
  const signals = await db.intelligenceSignal.findMany({
    where: { organizationId, entityType: "PROPERTY", entityId: propertyId, fieldKey, state: "ACCEPTED" },
    select: { id: true, isOverride: true, asOf: true, confidence: true, sourceCategory: true, valueRaw: true, valueNormalized: true },
  });
  const winner = selectWinner(signals);
  return winner ? (winner.valueNormalized ?? winner.valueRaw) : null;
}

/** Recompute one projected Property field from the ledger (writes the typed column, coerced by type). */
export async function recomputePropertyField(
  organizationId: string,
  propertyId: string,
  fieldKey: PropertyProjectedField,
  db: Db = prisma,
) {
  const value = await winningValue(db, organizationId, propertyId, fieldKey);
  if (value === null) return; // no accepted signal for this field — leave the column as-is
  let data: Prisma.PropertyUpdateInput;
  if (PROPERTY_FIELDS[fieldKey].type === "integer") {
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n)) return; // canonical integer signals are always numeric; guard defensively
    data = { [fieldKey]: n } as Prisma.PropertyUpdateInput;
  } else {
    data = { [fieldKey]: value } as Prisma.PropertyUpdateInput; // string-anchor: the normalized text is canonical
  }
  await db.property.update({ where: { id: propertyId }, data });
  // Anchors feed the derived identity index — keep it in sync on every path (domain write, refresh, rebuild).
  if (isPropertyAnchorField(fieldKey)) await rebuildPropertyIdentity(organizationId, propertyId, db);
}

/** Recompute every projected Property field from the ledger, then ensure the identity index is synced. */
export async function recomputeProperty(organizationId: string, propertyId: string, db: Db = prisma) {
  for (const f of PROPERTY_PROJECTED_FIELDS) await recomputePropertyField(organizationId, propertyId, f, db);
  await rebuildPropertyIdentity(organizationId, propertyId, db); // guarantees a row even when no anchors are set
}

/**
 * Rebuild the Property projection ENTIRELY from the ledger — the disposable-
 * projection contract (the Projection Reconstruction Standard). Functionally
 * identical to recomputeProperty; named to signal "drop and rebuild". Must
 * reproduce the live projection byte-for-byte.
 */
export const rebuildProperty = recomputeProperty;
