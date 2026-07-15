// Commercial Intelligence (v1.2, Commit 2c-ii) — Property-identity candidate store.
//
// Persists the possible-match pairs that resolution surfaces (Tier 1B / Tier 2) and
// the human decisions on them. Decision-support ONLY: it makes NO structural change
// (no merge / create / delete / repoint, no Signal write) — a CONFIRMED pair simply
// feeds a future (deferred) merge. Mirrors lib/owner-match.ts.
//
// Resurfacing reuses the 2c-i identityVersion: `evidenceFingerprint` snapshots both
// sides' identityVersion + basis, and the queue compares it to the CURRENT fingerprint
// — so a DISMISSED pair re-surfaces exactly when either property's identity materially
// changes (or on an explicit ADMIN reopen). Org-scoped throughout. The pure pair-key +
// fingerprint helpers live in property-resolution (unit-tested there).
import type { Prisma, PropertyMatchStatus, ResolutionBasis } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { computePairFingerprint, propertyPairKey } from "@/lib/intelligence/property-resolution";

type Db = Prisma.TransactionClient | typeof prisma;

async function identityVersionOf(db: Db, organizationId: string, propertyId: string): Promise<string | null> {
  const row = await db.propertyIdentity.findFirst({ where: { organizationId, propertyId }, select: { identityVersion: true } });
  return row?.identityVersion ?? null;
}

/** The current fingerprint for a canonical pair, from live identity state + basis. */
async function currentFingerprint(db: Db, organizationId: string, propertyIdA: string, propertyIdB: string, basis: ResolutionBasis): Promise<string> {
  const [va, vb] = await Promise.all([identityVersionOf(db, organizationId, propertyIdA), identityVersionOf(db, organizationId, propertyIdB)]);
  return computePairFingerprint(va, vb, basis);
}

/**
 * Upsert a candidate pair as PENDING (the Candidate step of resolution), on the
 * caller's tx so it commits with the resolve/create transaction. Canonical pair.
 *   • no row        → create PENDING with the current fingerprint
 *   • PENDING        → refresh basis + fingerprint (stays pending)
 *   • CONFIRMED      → leave (decided)
 *   • DISMISSED      → leave (the queue resurfaces it on fingerprint drift — the
 *                      stored fingerprint is the as-dismissed snapshot, never rewritten here)
 */
export async function upsertPropertyMatchCandidateTx(
  tx: Prisma.TransactionClient,
  organizationId: string,
  subjectPropertyId: string,
  candidatePropertyId: string,
  basis: ResolutionBasis,
) {
  const [propertyIdA, propertyIdB] = propertyPairKey(subjectPropertyId, candidatePropertyId);
  if (propertyIdA === propertyIdB) return null; // never pair a property with itself
  const fingerprint = await currentFingerprint(tx, organizationId, propertyIdA, propertyIdB, basis);

  const existing = await tx.propertyMatchDecision.findUnique({
    where: { organizationId_propertyIdA_propertyIdB: { organizationId, propertyIdA, propertyIdB } },
  });
  if (!existing) {
    return tx.propertyMatchDecision.create({
      data: { organizationId, propertyIdA, propertyIdB, basis, status: "PENDING", evidenceFingerprint: fingerprint },
    });
  }
  if (existing.status === "PENDING") {
    return tx.propertyMatchDecision.update({ where: { id: existing.id }, data: { basis, evidenceFingerprint: fingerprint } });
  }
  return existing; // CONFIRMED or DISMISSED — left untouched
}

/**
 * The pending candidate-review queue: every decision that still needs a human, minus
 * those a decision suppresses. A pair is suppressed when (not reopened) it is CONFIRMED
 * or it is DISMISSED and its stored fingerprint still matches the CURRENT identity
 * state. A DISMISSED pair whose identity materially changed (fingerprint drift), or any
 * reopened pair, is pending again. Paginated over the computed set.
 */
export async function generatePropertyCandidateQueue(organizationId: string, { skip = 0, take = 20 }: { skip?: number; take?: number } = {}) {
  const decisions = await prisma.propertyMatchDecision.findMany({ where: { organizationId } });
  const ids = Array.from(new Set(decisions.flatMap((d) => [d.propertyIdA, d.propertyIdB])));
  const identities = await prisma.propertyIdentity.findMany({ where: { organizationId, propertyId: { in: ids } }, select: { propertyId: true, identityVersion: true } });
  const verById = new Map(identities.map((i) => [i.propertyId, i.identityVersion]));

  const pending = [];
  for (const d of decisions) {
    const current = computePairFingerprint(verById.get(d.propertyIdA) ?? null, verById.get(d.propertyIdB) ?? null, d.basis);
    const suppressed = !d.reopenedAt && (d.status === "CONFIRMED" || (d.status === "DISMISSED" && d.evidenceFingerprint === current));
    if (suppressed) continue;
    pending.push({ id: d.id, propertyIdA: d.propertyIdA, propertyIdB: d.propertyIdB, basis: d.basis, status: d.status, reason: d.reason });
  }
  return { pending: pending.slice(skip, skip + take), total: pending.length };
}

/**
 * Server-authoritative context for a pair (actions never trust a client-supplied
 * fingerprint/basis). Both properties must be in the org. Basis comes from the
 * existing decision row when present; the fingerprint is recomputed from live state.
 */
export async function pairContextProperty(organizationId: string, id1: string, id2: string) {
  const [propertyIdA, propertyIdB] = propertyPairKey(id1, id2);
  if (propertyIdA === propertyIdB) throw new Error("A candidate pair must reference two distinct properties");
  const existing = await prisma.propertyMatchDecision.findUnique({ where: { organizationId_propertyIdA_propertyIdB: { organizationId, propertyIdA, propertyIdB } } });
  const basis: ResolutionBasis = existing?.basis ?? "PARCEL_CONFLICT";
  const fingerprint = await currentFingerprint(prisma, organizationId, propertyIdA, propertyIdB, basis);
  return { propertyIdA, propertyIdB, basis, fingerprint };
}

/** Record a human decision on a canonical pair (idempotent, order-independent). Resets any prior reopen. */
export async function recordPropertyMatchDecision(
  organizationId: string,
  input: {
    propertyIdA: string;
    propertyIdB: string;
    basis: ResolutionBasis;
    status: PropertyMatchStatus;
    fingerprint: string;
    reason?: string | null;
    note?: string | null;
    decidedByUserId?: string;
  },
) {
  const { propertyIdA, propertyIdB, basis, status, fingerprint, reason, note, decidedByUserId } = input;
  return prisma.propertyMatchDecision.upsert({
    where: { organizationId_propertyIdA_propertyIdB: { organizationId, propertyIdA, propertyIdB } },
    create: { organizationId, propertyIdA, propertyIdB, basis, status, evidenceFingerprint: fingerprint, reason: reason ?? null, note: note ?? null, decidedByUserId, decidedAt: new Date() },
    update: { status, basis, evidenceFingerprint: fingerprint, reason: reason ?? null, note: note ?? null, decidedByUserId, decidedAt: new Date(), reopenedAt: null, reopenedByUserId: null },
  });
}

/** Explicit ADMIN reopen of a decision — makes it inactive so the pair returns to pending. */
export async function reopenPropertyMatchDecision(organizationId: string, id1: string, id2: string, reopenedByUserId: string) {
  const [propertyIdA, propertyIdB] = propertyPairKey(id1, id2);
  const dec = await prisma.propertyMatchDecision.findUnique({ where: { organizationId_propertyIdA_propertyIdB: { organizationId, propertyIdA, propertyIdB } } });
  if (!dec) throw new Error("Decision not found in organization");
  return prisma.propertyMatchDecision.update({ where: { id: dec.id }, data: { reopenedAt: new Date(), reopenedByUserId } });
}

/** List active decisions of a status (DISMISSED / CONFIRMED views). Reopened rows are excluded. */
export async function listPropertyDecisions(organizationId: string, status: PropertyMatchStatus, { skip = 0, take = 20 }: { skip?: number; take?: number } = {}) {
  const where = { organizationId, status, reopenedAt: null };
  const [total, decisions] = await Promise.all([
    prisma.propertyMatchDecision.count({ where }),
    prisma.propertyMatchDecision.findMany({ where, orderBy: { decidedAt: "desc" }, skip, take }),
  ]);
  return { decisions, total };
}
