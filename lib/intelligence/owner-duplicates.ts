// Commercial Intelligence (v1.2, Commit 1d-2b) — pure owner-duplicate detection.
//
// The owner-vs-owner analogue of owner-identity's input-vs-owner candidate finder:
// given the org's owners, propose CANDIDATE duplicate pairs. Proposal only — this
// never links, resolves, or merges identity (candidate ≠ merge). Exact matchKey +
// alias overlap ONLY (no fuzzy matching). No Prisma; unit-testable.
import { ALIAS_CONFIDENCE, MATCH_KEY_CONFIDENCE } from "@/lib/intelligence/owner-identity";

export interface DuplicateOwnerInput {
  id: string;
  matchKey: string;
  aliasNormalizedValues: string[];
}

export type MatchReason = "exact-match-key" | "alias-match";

export interface DuplicatePair {
  ownerIdA: string; // canonical: lexicographically smaller id
  ownerIdB: string; // larger id
  reason: MatchReason;
  identityConfidence: number;
}

/** Canonical unordered-pair identity: the two ids sorted ascending. */
export function pairKey(id1: string, id2: string): [string, string] {
  return id1 < id2 ? [id1, id2] : [id2, id1];
}

/**
 * Deterministic identity fingerprint of a pair — its `matchKey`s plus the union of
 * both owners' normalized aliases (sorted). A DISMISSED decision stores this; when
 * the current fingerprint differs, a MATERIAL identity change occurred and the pair
 * re-surfaces. Identity-derived only (no external identifiers — §14.2).
 */
export function computeFingerprint(
  a: { matchKey: string; aliasNormalizedValues: string[] },
  b: { matchKey: string; aliasNormalizedValues: string[] },
): string {
  const keys = [a.matchKey, b.matchKey].sort();
  const aliases = Array.from(new Set([...a.aliasNormalizedValues, ...b.aliasNormalizedValues])).sort();
  return JSON.stringify({ keys, aliases });
}

/**
 * Propose candidate duplicate pairs among `owners`. Two reasons:
 *  - exact-match-key: identical normalized matchKey (confidence 0.9),
 *  - alias-match: one owner's matchKey is the other's alias, or a shared alias (0.6).
 * A pair found by both keeps the stronger reason. No self-pairs; canonical order;
 * deterministic output.
 */
export function findDuplicatePairs(owners: DuplicateOwnerInput[]): DuplicatePair[] {
  const result = new Map<string, DuplicatePair>();
  const upsert = (id1: string, id2: string, reason: MatchReason, confidence: number) => {
    if (id1 === id2) return;
    const [ownerIdA, ownerIdB] = pairKey(id1, id2);
    const k = `${ownerIdA}|${ownerIdB}`;
    const existing = result.get(k);
    if (!existing || confidence > existing.identityConfidence) {
      result.set(k, { ownerIdA, ownerIdB, reason, identityConfidence: confidence });
    }
  };

  // Exact matchKey: group, then all intra-group pairs.
  const byMatchKey = new Map<string, string[]>();
  for (const o of owners) {
    const arr = byMatchKey.get(o.matchKey);
    if (arr) arr.push(o.id);
    else byMatchKey.set(o.matchKey, [o.id]);
  }
  for (const ids of Array.from(byMatchKey.values())) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) upsert(ids[i], ids[j], "exact-match-key", MATCH_KEY_CONFIDENCE);
    }
  }

  // Alias overlap: matchKey ∈ other's aliases, or a shared normalized alias.
  for (let i = 0; i < owners.length; i++) {
    for (let j = i + 1; j < owners.length; j++) {
      const A = owners[i];
      const B = owners[j];
      const bAliases = new Set(B.aliasNormalizedValues);
      const aAliases = new Set(A.aliasNormalizedValues);
      const matchKeyOverlap = bAliases.has(A.matchKey) || aAliases.has(B.matchKey);
      const sharedAlias = A.aliasNormalizedValues.some((v) => bAliases.has(v));
      if (matchKeyOverlap || sharedAlias) upsert(A.id, B.id, "alias-match", ALIAS_CONFIDENCE);
    }
  }

  return Array.from(result.values()).sort((x, y) => x.ownerIdA.localeCompare(y.ownerIdA) || x.ownerIdB.localeCompare(y.ownerIdB));
}
