// Commercial Intelligence (v1.2, Commit 1d-3b) — merge/unmerge ORCHESTRATION.
//
// The domain boundary that turns a CONFIRMED candidate decision into a structural
// merge, and reverses it. It is the ONLY place that pairs the (unchanged) merge
// engines with decision-resolution, and it does so ATOMICALLY:
//
//   merge   = mergeOwnersTx   + resolve decision   → one transaction
//   unmerge = unmergeOwnersTx + unresolve decision → one transaction
//
// so a merge can never commit with its decision still awaiting-merge, and an
// unmerge can never commit with its decision still resolved (Volume 12: merge is
// the only workflow permitted to perform structural identity change; it must not
// leave the decision ledger inconsistent). Everything here is ADMIN-gated at the
// action call-site (canMergeOwners); the reads/writes are server-authoritative —
// callers never trust submitted counts, loser ids, reasons, or decision state.
import type { OwnerMergeReason } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { mergeOwnersTx, unmergeOwnersTx } from "@/lib/owners";
import { suggestWinner, type MergeSuggestion } from "@/lib/intelligence/owner-merge-suggest";

type OwnerMergeSide = { id: string; displayName: string; entityType: string; sellerCount: number; propertyCount: number; total: number };

export type MergeCandidateContext = {
  decisionId: string;
  a: OwnerMergeSide;
  b: OwnerMergeSide;
  suggestion: MergeSuggestion;
};

/**
 * Server-authoritative context for the merge confirmation page. Loads the decision
 * (must be CONFIRMED, active, unresolved) and BOTH owners fresh (must exist, be
 * ACTIVE, be distinct, same org) with live link counts, then computes the advisory
 * winner suggestion. Never trusts client-submitted counts or suggestion data.
 * Throws if the pair is not currently mergeable (page → notFound / redirect).
 */
export async function mergeCandidateContext(organizationId: string, decisionId: string): Promise<MergeCandidateContext> {
  const dec = await prisma.ownerMatchDecision.findFirst({ where: { id: decisionId, organizationId } });
  if (!dec) throw new Error("Decision not found in organization");
  if (dec.status !== "CONFIRMED" || dec.reopenedAt || dec.resolvedAt) throw new Error("Decision is not awaiting merge");

  const owners = await prisma.owner.findMany({
    where: { organizationId, id: { in: [dec.ownerIdA, dec.ownerIdB] }, status: "ACTIVE" },
    select: { id: true, displayName: true, entityType: true, createdAt: true, _count: { select: { sellers: true, properties: true } } },
  });
  if (owners.length !== 2) throw new Error("Both owners must be ACTIVE and in the organization");

  const view = (id: string): OwnerMergeSide => {
    const o = owners.find((x) => x.id === id)!;
    return { id: o.id, displayName: o.displayName, entityType: o.entityType, sellerCount: o._count.sellers, propertyCount: o._count.properties, total: o._count.sellers + o._count.properties };
  };
  const suggestInput = (id: string) => {
    const o = owners.find((x) => x.id === id)!;
    return { id: o.id, sellerCount: o._count.sellers, propertyCount: o._count.properties, createdAt: o.createdAt };
  };
  const suggestion = suggestWinner(suggestInput(dec.ownerIdA), suggestInput(dec.ownerIdB));
  return { decisionId: dec.id, a: view(dec.ownerIdA), b: view(dec.ownerIdB), suggestion };
}

/**
 * ATOMIC merge + decision resolution. Validates the decision is CONFIRMED/active/
 * unresolved and that `winnerId` is exactly one of its two owners (deriving the
 * loser server-side), runs the merge engine, then stamps resolution on the decision
 * — all in ONE transaction. The resolution update is conditional on `resolvedAt:
 * null`, so a concurrent duplicate submit rolls back (no second merge record). The
 * status stays CONFIRMED (there is no MERGED status).
 */
export async function mergeConfirmedPair(
  organizationId: string,
  input: { decisionId: string; winnerId: string; reason: OwnerMergeReason; note?: string; actorUserId?: string },
) {
  const { decisionId, winnerId, reason, note, actorUserId } = input;
  return prisma.$transaction(async (tx) => {
    const dec = await tx.ownerMatchDecision.findFirst({ where: { id: decisionId, organizationId } });
    if (!dec) throw new Error("Decision not found in organization");
    if (dec.status !== "CONFIRMED" || dec.reopenedAt || dec.resolvedAt) throw new Error("Decision is not awaiting merge");
    if (winnerId !== dec.ownerIdA && winnerId !== dec.ownerIdB) throw new Error("Winner must be one of the decision's two owners");
    const loserId = winnerId === dec.ownerIdA ? dec.ownerIdB : dec.ownerIdA;

    // Structural merge (the engine re-validates both owners: ACTIVE, distinct, org).
    const record = await mergeOwnersTx(tx, organizationId, { winnerId, loserId, reason, note, actorUserId });

    // Resolve the decision — conditional on still-unresolved (concurrency guard).
    const upd = await tx.ownerMatchDecision.updateMany({
      where: { id: decisionId, organizationId, resolvedAt: null },
      data: { resolvedAt: new Date(), resolvedByUserId: actorUserId ?? null, mergeRecordId: record.id },
    });
    if (upd.count !== 1) throw new Error("Decision was resolved concurrently — merge rolled back");

    return { record, decisionId };
  });
}

/**
 * ATOMIC unmerge + decision unresolution. Reverses the merge (engine enforces LIFO)
 * and, in the SAME transaction, clears resolution on EXACTLY the decision linked to
 * this merge record (`mergeRecordId` is unique, so no unrelated decision is touched).
 * The decision stays CONFIRMED and returns to the merge queue. If no decision
 * references the record (e.g. a merge made outside the candidate flow), that is fine.
 */
export async function unmergeByRecord(organizationId: string, mergeRecordId: string, opts: { actorUserId?: string } = {}) {
  return prisma.$transaction(async (tx) => {
    const record = await unmergeOwnersTx(tx, organizationId, mergeRecordId, opts);
    const upd = await tx.ownerMatchDecision.updateMany({
      where: { organizationId, mergeRecordId },
      data: { resolvedAt: null, resolvedByUserId: null, mergeRecordId: null },
    });
    return { record, unresolvedDecisions: upd.count };
  });
}

/** Active (reversible) merge records with winner/loser display + LIFO availability. */
export async function listActiveMergeRecords(organizationId: string, { skip = 0, take = 20 }: { skip?: number; take?: number } = {}) {
  const where = { organizationId, status: "ACTIVE" as const };
  const [total, records] = await Promise.all([
    prisma.ownerMergeRecord.count({ where }),
    prisma.ownerMergeRecord.findMany({ where, orderBy: { mergedAt: "desc" }, skip, take }),
  ]);
  const ids = Array.from(new Set(records.flatMap((r) => [r.winnerId, r.loserId])));
  const owners = await prisma.owner.findMany({ where: { organizationId, id: { in: ids } }, select: { id: true, displayName: true, entityType: true, status: true } });
  const byId = new Map(owners.map((o) => [o.id, o]));
  const rows = records.map((r) => {
    const winner = byId.get(r.winnerId) ?? null;
    return {
      id: r.id,
      reason: r.reason,
      mergedAt: r.mergedAt,
      winner,
      loser: byId.get(r.loserId) ?? null,
      // LIFO: only reversible while the winner is still ACTIVE (not itself merged away).
      canUnmerge: winner?.status === "ACTIVE",
    };
  });
  return { records: rows, total };
}
