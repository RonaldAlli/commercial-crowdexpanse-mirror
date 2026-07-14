// Commercial Intelligence (v1.2, Commit 1d-2b) — candidate-review data access.
//
// Assembles the candidate-review queue and persists human decisions. It composes
// the PURE owner-duplicates detector with the OwnerMatchDecision store — it makes
// NO structural identity change: it never links, creates/deletes owners, writes
// signals, or merges (candidate ≠ merge). Org-scoped throughout.
import type { OwnerMatchStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { computeFingerprint, findDuplicatePairs, pairKey, type DuplicateOwnerInput } from "@/lib/intelligence/owner-duplicates";

type OwnerLite = DuplicateOwnerInput & { displayName: string; entityType: string };

async function loadActiveOwners(organizationId: string): Promise<OwnerLite[]> {
  const owners = await prisma.owner.findMany({
    where: { organizationId, status: "ACTIVE" },
    select: { id: true, displayName: true, entityType: true, matchKey: true, aliases: { select: { normalizedValue: true } } },
  });
  return owners.map((o) => ({ id: o.id, displayName: o.displayName, entityType: o.entityType, matchKey: o.matchKey, aliasNormalizedValues: o.aliases.map((a) => a.normalizedValue) }));
}

const ownerView = (o: OwnerLite) => ({ id: o.id, displayName: o.displayName, entityType: o.entityType });

/**
 * The pending candidate queue: generated duplicate pairs minus any that a decision
 * suppresses. A pair is pending when it has no decision, or its DISMISSED decision
 * was reopened, or the DISMISSED fingerprint no longer matches the current identity
 * state (a MATERIAL change re-surfaces it). CONFIRMED pairs are excluded (they feed
 * the merge queue). Paginated over the computed set.
 */
export async function generateCandidateQueue(organizationId: string, { skip = 0, take = 20 }: { skip?: number; take?: number } = {}) {
  const owners = await loadActiveOwners(organizationId);
  const byId = new Map(owners.map((o) => [o.id, o]));
  const pairs = findDuplicatePairs(owners);

  const decisions = await prisma.ownerMatchDecision.findMany({ where: { organizationId } });
  const decByKey = new Map(decisions.map((d) => [`${d.ownerIdA}|${d.ownerIdB}`, d]));

  const pending = [];
  for (const p of pairs) {
    const a = byId.get(p.ownerIdA)!;
    const b = byId.get(p.ownerIdB)!;
    const dec = decByKey.get(`${p.ownerIdA}|${p.ownerIdB}`);
    const suppressed = dec && !dec.reopenedAt && (dec.status === "CONFIRMED" || (dec.status === "DISMISSED" && dec.signalFingerprint === computeFingerprint(a, b)));
    if (suppressed) continue;
    pending.push({ ownerIdA: p.ownerIdA, ownerIdB: p.ownerIdB, reason: p.reason, identityConfidence: p.identityConfidence, a: ownerView(a), b: ownerView(b) });
  }
  return { pending: pending.slice(skip, skip + take), total: pending.length };
}

/**
 * Count decisions AWAITING MERGE — CONFIRMED, not reopened, not yet resolved by a
 * merge (Commit 1d-3b adds the `resolvedAt: null` clause). This is the merge-queue
 * size; a merged pair leaves the queue, an unmerged pair returns to it.
 */
export function countConfirmed(organizationId: string) {
  return prisma.ownerMatchDecision.count({ where: { organizationId, status: "CONFIRMED", reopenedAt: null, resolvedAt: null } });
}

/**
 * List active decisions of a status (DISMISSED / CONFIRMED views), with owner display.
 * CONFIRMED here means "awaiting merge": resolved (merged) decisions are excluded via
 * `resolvedAt: null` (Commit 1d-3b). Harmless for DISMISSED (never resolved).
 */
export async function listDecisions(organizationId: string, status: OwnerMatchStatus, { skip = 0, take = 20 }: { skip?: number; take?: number } = {}) {
  const where = { organizationId, status, reopenedAt: null, resolvedAt: null };
  const [total, decisions] = await Promise.all([
    prisma.ownerMatchDecision.count({ where }),
    prisma.ownerMatchDecision.findMany({ where, orderBy: { decidedAt: "desc" }, skip, take }),
  ]);
  const ids = Array.from(new Set(decisions.flatMap((d) => [d.ownerIdA, d.ownerIdB])));
  const owners = await prisma.owner.findMany({ where: { organizationId, id: { in: ids } }, select: { id: true, displayName: true, entityType: true } });
  const byId = new Map(owners.map((o) => [o.id, o]));
  const rows = decisions.map((d) => ({ ...d, a: byId.get(d.ownerIdA) ?? null, b: byId.get(d.ownerIdB) ?? null }));
  return { decisions: rows, total };
}

/**
 * Resolve the current identity context for a pair (server-authoritative — actions
 * never trust a client-supplied reason/fingerprint). Both owners must be in the org.
 * Returns canonical ids, the current match reason (if still a candidate), and the
 * current fingerprint.
 */
export async function pairContext(organizationId: string, id1: string, id2: string) {
  const [ownerIdA, ownerIdB] = pairKey(id1, id2);
  if (ownerIdA === ownerIdB) throw new Error("A candidate pair must reference two distinct owners");
  const owners = await prisma.owner.findMany({
    where: { organizationId, id: { in: [ownerIdA, ownerIdB] } },
    select: { id: true, matchKey: true, aliases: { select: { normalizedValue: true } } },
  });
  if (owners.length !== 2) throw new Error("Both owners must exist in the organization");
  const lite = owners.map((o) => ({ id: o.id, matchKey: o.matchKey, aliasNormalizedValues: o.aliases.map((a) => a.normalizedValue) }));
  const a = lite.find((o) => o.id === ownerIdA)!;
  const b = lite.find((o) => o.id === ownerIdB)!;
  const reason = findDuplicatePairs(lite)[0]?.reason ?? null;
  return { ownerIdA, ownerIdB, reason, fingerprint: computeFingerprint(a, b) };
}

/** Upsert a decision on the canonical pair (idempotent, order-independent). Resets any prior reopen. */
export async function recordDecision(
  organizationId: string,
  input: { ownerIdA: string; ownerIdB: string; status: OwnerMatchStatus; reason: string | null; fingerprint: string; decidedByUserId?: string; note?: string },
) {
  const { ownerIdA, ownerIdB, status, reason, fingerprint, decidedByUserId, note } = input;
  return prisma.ownerMatchDecision.upsert({
    where: { organizationId_ownerIdA_ownerIdB: { organizationId, ownerIdA, ownerIdB } },
    create: { organizationId, ownerIdA, ownerIdB, status, reason, signalFingerprint: fingerprint, note, decidedByUserId },
    update: { status, reason, signalFingerprint: fingerprint, note, decidedByUserId, decidedAt: new Date(), reopenedAt: null, reopenedByUserId: null },
  });
}

/** Explicit ADMIN reopen of a decision — makes it inactive so the pair returns to pending. */
export async function reopenDecision(organizationId: string, id1: string, id2: string, reopenedByUserId: string) {
  const [ownerIdA, ownerIdB] = pairKey(id1, id2);
  const dec = await prisma.ownerMatchDecision.findUnique({ where: { organizationId_ownerIdA_ownerIdB: { organizationId, ownerIdA, ownerIdB } } });
  if (!dec) throw new Error("Decision not found in organization");
  return prisma.ownerMatchDecision.update({ where: { id: dec.id }, data: { reopenedAt: new Date(), reopenedByUserId } });
}
