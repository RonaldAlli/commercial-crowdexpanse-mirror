// Commercial Intelligence (v1.2, Commit 2c-i) — the DERIVED Property identity
// surface + the immutable external-identifier crosswalk.
//
// PropertyIdentity is NOT a source of truth (PI-A): it is a rebuildable index
// DERIVED purely from the accepted anchor signals in the ledger. `rebuildPropertyIdentity`
// is a deterministic function of (organizationId, propertyId, ledger) → identical
// row every time (invariant #12 / R2), and is content-idempotent — a re-run with
// unchanged evidence performs ZERO writes (R4). `rebuiltFromProjectionAt` is the
// deterministic projection-state WATERMARK the row reflects (the max createdAt of
// the winning anchor signals), never wall-clock — so the row stays a pure function
// of the ledger and index↔projection drift is detectable by comparing watermarks.
//
// The crosswalk is append-only with Signal-style supersession (R3): rows are never
// edited or deleted; a remap SUPERSEDES the prior ACTIVE row and INSERTS a new one,
// so a provider identifier never silently moves (invariant #6). At most one ACTIVE
// row per (organizationId, provider, providerIdentifier), enforced transactionally.
//
// NO resolution/matching behavior lives here (that is Commit 2c-ii) — only the
// derived structure, its rebuild, and the crosswalk primitives.
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { PROPERTY_ANCHOR_FIELDS } from "@/lib/intelligence/property-fields";
import { propertyIdentityFingerprint } from "@/lib/intelligence/property-normalizers";
import { selectWinner } from "@/lib/intelligence/projection-precedence";

type Db = Prisma.TransactionClient | typeof prisma;

/** The canonical strong-parcel key — `${FIPS}|${APN}` — only when BOTH anchors exist (PI-B). */
export function parcelKeyOf(countyFipsCode: string | null, apnNormalized: string | null): string | null {
  return countyFipsCode && apnNormalized ? `${countyFipsCode}|${apnNormalized}` : null;
}

/** The winning ACCEPTED signal for one anchor field (by the shared precedence rule). */
async function winningAnchorSignal(db: Db, organizationId: string, propertyId: string, fieldKey: string) {
  const signals = await db.intelligenceSignal.findMany({
    where: { organizationId, entityType: "PROPERTY", entityId: propertyId, fieldKey, state: "ACCEPTED" },
    select: { id: true, isOverride: true, asOf: true, confidence: true, sourceCategory: true, valueRaw: true, valueNormalized: true, createdAt: true },
  });
  return selectWinner(signals);
}

/**
 * Rebuild the derived PropertyIdentity index for one property PURELY from the
 * accepted anchor signals in the ledger. Deterministic (invariant #12) and
 * content-idempotent (R4): if the derived content is unchanged, performs no write.
 * Returns the current identity row.
 */
export async function rebuildPropertyIdentity(organizationId: string, propertyId: string, db: Db = prisma) {
  const anchors: Record<string, string | null> = { apnNormalized: null, countyFipsCode: null, addressNormalized: null };
  let watermark: Date | null = null;
  for (const fieldKey of PROPERTY_ANCHOR_FIELDS) {
    const winner = await winningAnchorSignal(db, organizationId, propertyId, fieldKey);
    if (!winner) continue;
    anchors[fieldKey] = winner.valueNormalized ?? winner.valueRaw;
    if (!watermark || winner.createdAt.getTime() > watermark.getTime()) watermark = winner.createdAt;
  }
  const parcelKey = parcelKeyOf(anchors.countyFipsCode, anchors.apnNormalized);
  const identityVersion = propertyIdentityFingerprint({
    countyFipsCode: anchors.countyFipsCode,
    apnNormalized: anchors.apnNormalized,
    addressNormalized: anchors.addressNormalized,
  });

  const existing = await db.propertyIdentity.findUnique({ where: { propertyId } });
  const unchanged =
    existing != null &&
    existing.identityVersion === identityVersion &&
    existing.parcelKey === parcelKey &&
    (existing.rebuiltFromProjectionAt?.getTime() ?? null) === (watermark?.getTime() ?? null);
  if (unchanged) return existing; // zero-write idempotent rebuild (R4)

  const values = {
    apnNormalized: anchors.apnNormalized,
    countyFipsCode: anchors.countyFipsCode,
    addressNormalized: anchors.addressNormalized,
    parcelKey,
    identityVersion,
    rebuiltFromProjectionAt: watermark,
  };
  return db.propertyIdentity.upsert({
    where: { propertyId },
    create: { organizationId, propertyId, ...values },
    update: { organizationId, ...values },
  });
}

/** Rebuild every property's identity index for an org (reconstruction / backfill). */
export async function rebuildAllPropertyIdentities(organizationId: string) {
  const properties = await prisma.property.findMany({ where: { organizationId }, select: { id: true } });
  for (const p of properties) await rebuildPropertyIdentity(organizationId, p.id);
  return { properties: properties.length };
}

/**
 * Record an immutable external-identifier crosswalk row (insert-only). Idempotent
 * when the same (org, provider, providerIdentifier) already maps to the SAME
 * property; throws on a CONFLICT (already mapped to a different property) — a real
 * remap is an explicit, audited supersession (see below), never a silent move.
 */
export async function addPropertyExternalIdentifier(
  organizationId: string,
  propertyId: string,
  provider: string,
  providerIdentifier: string,
  asOf: Date | null = null,
  tx?: Prisma.TransactionClient,
) {
  const run = async (t: Prisma.TransactionClient) => {
    const active = await t.propertyExternalIdentifier.findFirst({
      where: { organizationId, provider, providerIdentifier, state: "ACTIVE" },
    });
    if (active) {
      if (active.propertyId === propertyId) return active; // idempotent
      throw new Error(`crosswalk conflict: ${provider}:${providerIdentifier} already maps to a different property`);
    }
    return t.propertyExternalIdentifier.create({
      data: { organizationId, propertyId, provider, providerIdentifier, asOf, state: "ACTIVE" },
    });
  };
  return tx ? run(tx) : prisma.$transaction(run);
}

/**
 * Explicitly remap a crosswalk identifier to a new property by SUPERSEDING the
 * prior ACTIVE row (never rewriting it) and inserting a new ACTIVE row — full
 * history retained (R3, invariant #6). Returns the new ACTIVE row.
 */
export async function supersedePropertyExternalIdentifier(
  organizationId: string,
  provider: string,
  providerIdentifier: string,
  newPropertyId: string,
  asOf: Date | null = null,
  tx?: Prisma.TransactionClient,
) {
  const run = async (t: Prisma.TransactionClient) => {
    const active = await t.propertyExternalIdentifier.findFirst({
      where: { organizationId, provider, providerIdentifier, state: "ACTIVE" },
    });
    const created = await t.propertyExternalIdentifier.create({
      data: { organizationId, propertyId: newPropertyId, provider, providerIdentifier, asOf, state: "ACTIVE" },
    });
    if (active) {
      await t.propertyExternalIdentifier.update({ where: { id: active.id }, data: { state: "SUPERSEDED", supersededById: created.id } });
    }
    return created;
  };
  return tx ? run(tx) : prisma.$transaction(run);
}
