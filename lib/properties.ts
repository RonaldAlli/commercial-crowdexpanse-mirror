// Commercial Intelligence (v1.2, Commit 2a-ii) — Property domain writes.
//
// The single home for writing a Property. Org-scoped by construction. The two
// projected fields (yearBuilt, squareFeet) are written ONLY through the ledger
// (Observation → Signal → Projection) — never as direct column writes, upholding
// the "no direct projection writes" invariant. Operational columns are written
// directly. Everything is one transaction so row + ledger + projection commit
// together (mirrors createOwner / updateOwnerField).
//
// Direction (not implemented broadly in Slice 2): Property CRUD server actions
// become thin callers of this domain module — the action validates + authorizes,
// the domain owns persistence.
//
// Scope boundary (READ BEFORE EXTENDING): operational persistence and intelligence
// orchestration currently coexist only for the Slice 2 walking skeleton. As Property
// Intelligence expands, orchestration should migrate into dedicated intelligence-
// domain services while operational CRUD remains focused on entity lifecycle. This
// module is NOT meant to become the permanent home of all Property Intelligence.
import type { AssetType, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { acceptObservationAsSignalTx, appendSignal, recordObservation } from "@/lib/intelligence/provenance";
import { recomputePropertyField } from "@/lib/intelligence/property-projection";
import { rebuildPropertyIdentity } from "@/lib/intelligence/property-identity";
import { PROPERTY_PROJECTED_FIELDS, isPropertyAnchorField, normalizePropertyValue, type PropertyProjectedField } from "@/lib/intelligence/property-fields";

/** The Property columns written as ordinary (non-projected) operational data. */
export interface PropertyOperationalPayload {
  name: string;
  assetType: AssetType;
  status: string | null;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string | null;
  county: string | null;
  sellerId: string | null;
  unitCount: number | null;
  acreage: number | null;
  occupancyRate: number | null;
  noiAnnualUsd: number | null;
  askingPriceUsd: number | null;
  estimatedValueUsd: number | null;
  capRate: number | null;
}

/**
 * The ledger-backed projected fields, supplied as RAW inputs (string or number, or
 * null to skip). Integers may be passed as numbers; anchors as raw strings — the
 * domain writer normalizes deterministically and preserves the raw in the ledger.
 */
export type PropertyProjectedValues = Partial<Record<PropertyProjectedField, string | number | null>>;

interface WriteOpts {
  actorUserId?: string;
  method?: string;
}

/**
 * Write one projected field through the ledger, within the caller's tx. Skips
 * when the value is unchanged (value-grain: no redundant signal on an unchanged
 * save) and when null/undefined (clearing a projected field to null is a separate,
 * later affordance — the skeleton never direct-writes the column).
 */
async function setPropertyProjectedFieldTx(
  tx: Prisma.TransactionClient,
  organizationId: string,
  propertyId: string,
  fieldKey: PropertyProjectedField,
  rawInput: string | number | null | undefined,
  opts: WriteOpts,
) {
  if (rawInput === null || rawInput === undefined) return;
  const raw = String(rawInput);
  const normalized = normalizePropertyValue(fieldKey, raw);
  if (normalized === null) return; // invalid input records nothing (domain callers pass validated data)
  const current = await tx.property.findFirst({
    where: { id: propertyId, organizationId },
    select: { yearBuilt: true, squareFeet: true, apnNormalized: true, countyFipsCode: true, addressNormalized: true },
  });
  if (current) {
    const col = (current as Record<string, unknown>)[fieldKey];
    const currentNormalized = col === null || col === undefined ? null : String(col);
    if (currentNormalized === normalized) return; // unchanged — no new signal
  }
  const obs = await recordObservation(
    organizationId,
    {
      entityType: "PROPERTY",
      entityId: propertyId,
      fieldKey,
      valueRaw: raw, // preserve the true raw submission (invariant #3)
      valueNormalized: normalized,
      sourceCategory: "USER_ENTERED",
      sourceId: opts.actorUserId ?? "user",
      asOf: new Date(),
      method: opts.method ?? "manual",
    },
    tx,
  );
  await acceptObservationAsSignalTx(tx, organizationId, obs.id);
  await recomputePropertyField(organizationId, propertyId, fieldKey, tx);
}

/**
 * Create a Property: operational columns are written directly; the projected
 * fields are seeded as USER_ENTERED genesis signals and projected — so those
 * columns are ledger-backed from creation. One transaction.
 */
export async function createPropertyRecord(
  organizationId: string,
  operational: PropertyOperationalPayload,
  projected: PropertyProjectedValues,
  opts: WriteOpts = {},
) {
  return prisma.$transaction(async (tx) => {
    const property = await tx.property.create({ data: { organizationId, ...operational } });
    for (const fieldKey of PROPERTY_PROJECTED_FIELDS) {
      await setPropertyProjectedFieldTx(tx, organizationId, property.id, fieldKey, projected[fieldKey], { ...opts, method: opts.method ?? "create" });
    }
    await rebuildPropertyIdentity(organizationId, property.id, tx); // every property has a derived identity row
    return tx.property.findUniqueOrThrow({ where: { id: property.id } });
  });
}

/**
 * Update a Property: operational columns updated directly; projected fields routed
 * through the ledger (append signal → reproject). Org-scoped. One transaction.
 */
export async function updatePropertyRecord(
  organizationId: string,
  propertyId: string,
  operational: PropertyOperationalPayload,
  projected: PropertyProjectedValues,
  opts: WriteOpts = {},
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.property.findFirst({ where: { id: propertyId, organizationId }, select: { id: true } });
    if (!existing) throw new Error("Property not found in organization");
    await tx.property.update({ where: { id: existing.id }, data: operational });
    for (const fieldKey of PROPERTY_PROJECTED_FIELDS) {
      await setPropertyProjectedFieldTx(tx, organizationId, existing.id, fieldKey, projected[fieldKey], opts);
    }
    await rebuildPropertyIdentity(organizationId, existing.id, tx);
    return tx.property.findUniqueOrThrow({ where: { id: existing.id } });
  });
}

/**
 * Seed genesis signals for properties whose projected columns predate the ledger
 * (idempotent). For each property with a non-null projected column and no signal
 * for that field, record + accept a USER_ENTERED genesis observation from the
 * current column value (asOf = the property's createdAt — deterministic). The
 * column already holds the value, so no reprojection is needed; this backs it so
 * the reconstruction invariant holds. Run once per org after the enum migration.
 */
export async function backfillPropertyGenesisSignals(organizationId: string) {
  const properties = await prisma.property.findMany({
    where: { organizationId },
    select: { id: true, yearBuilt: true, squareFeet: true, createdAt: true },
  });
  let backfilled = 0;
  for (const p of properties) {
    let touched = false;
    for (const fieldKey of PROPERTY_PROJECTED_FIELDS) {
      // Anchors (APN/FIPS/address) have no legacy column source and are NOT
      // synthesized during genesis (Decision C) — only explicit observations
      // create anchor lineage. Backfill covers the integer projected columns.
      if (isPropertyAnchorField(fieldKey)) continue;
      const value = (p as Record<string, unknown>)[fieldKey];
      if (value === null || value === undefined) continue;
      const has = await prisma.intelligenceSignal.findFirst({
        where: { organizationId, entityType: "PROPERTY", entityId: p.id, fieldKey },
        select: { id: true },
      });
      if (has) continue;
      await appendSignal(organizationId, {
        entityType: "PROPERTY",
        entityId: p.id,
        fieldKey,
        valueRaw: String(value),
        valueNormalized: String(value),
        sourceCategory: "USER_ENTERED",
        sourceId: "genesis",
        asOf: p.createdAt,
        method: "backfill",
      });
      touched = true;
    }
    await rebuildPropertyIdentity(organizationId, p.id); // ensure the derived identity row exists (all-null anchors → all-null row)
    if (touched) backfilled += 1;
  }
  return { properties: properties.length, backfilled };
}
