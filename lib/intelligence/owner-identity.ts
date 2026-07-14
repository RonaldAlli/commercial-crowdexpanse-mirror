// Commercial Intelligence (v1.2) — pure owner-identity logic.
//
// Normalization, match keys, and candidate detection. No Prisma, no framework:
// safe to unit-test in isolation and to reuse from data-access + E2E without
// logic drift. This is a CRITICAL module (branch-gated ≥ 90%).
//
// Authority rule (Volume 12 §7.2, S1-4/S1-5): an ExternalIdentifier match — or
// explicit manual confirmation — is the only thing that establishes a canonical
// identity. The functions here only PROPOSE candidates from normalized names;
// they never link and never merge. The confidence they emit is **Identity
// Confidence** (are these the same owner?) — a distinct dimension from Owner
// Confidence (data trustworthiness) and Motivation Score (Volume 12 §13).

/** A candidate owner match — a proposal, never an automatic link. */
export interface OwnerCandidate {
  ownerId: string;
  /** Identity Confidence: how sure we are this is the SAME owner. Not data quality. */
  identityConfidence: number;
  reason: "exact-match-key" | "alias-match";
}

/** Input describing the owner we're resolving. */
export interface OwnerIdentityInput {
  displayName: string;
  jurisdiction?: string;
}

/** An existing owner to compare against (shape kept minimal + Prisma-free). */
export interface ExistingOwner {
  id: string;
  matchKey: string;
  aliasNormalizedValues?: string[];
}

// Confidence for each proposal kind. Kept as named constants so tests and future
// tuning have one home. These are Identity Confidence, in [0, 1].
export const MATCH_KEY_CONFIDENCE = 0.9;
export const ALIAS_CONFIDENCE = 0.6;

/**
 * Deterministically normalize an owner name for matching: upper-case, strip
 * punctuation, canonicalize common entity suffixes, collapse whitespace. Pure —
 * same input always yields the same output (the golden-fixture contract).
 *
 * Examples (all → "SMITH HOLDINGS LLC"):
 *   "Smith Holdings, LLC" · "Smith Holdings L.L.C." · "  smith   holdings llc "
 */
export function normalizeOwnerName(raw: string): string {
  if (!raw) return "";
  let s = raw.toUpperCase();
  s = s.replace(/[^A-Z0-9\s]/g, " "); // strip punctuation → "L.L.C." becomes "L L C"
  s = s.replace(/\s+/g, " ").trim();
  // Collapse spaced-out abbreviations, then canonicalize suffix synonyms.
  s = s.replace(/\bL L C\b/g, "LLC").replace(/\bL P\b/g, "LP").replace(/\bL L P\b/g, "LLP");
  s = s
    .replace(/\bINCORPORATED\b/g, "INC")
    .replace(/\bCORPORATION\b/g, "CORP")
    .replace(/\bLIMITED\b/g, "LTD")
    .replace(/\bCOMPANY\b/g, "CO");
  return s.replace(/\s+/g, " ").trim();
}

/**
 * The canonical match key for an owner: the normalized name, optionally suffixed
 * with a normalized jurisdiction. NOT unique — owners may legitimately share a
 * key; it is a candidate generator, not an identity (S1-4).
 */
export function computeMatchKey(input: OwnerIdentityInput): string {
  const name = normalizeOwnerName(input.displayName);
  const juris = input.jurisdiction ? normalizeOwnerName(input.jurisdiction) : "";
  return juris ? `${name}|${juris}` : name;
}

/**
 * Propose candidate matches for an input among existing owners. Returns a ranked
 * list (highest Identity Confidence first). NEVER returns a link/merge decision:
 * an exact match-key or alias hit is a *candidate* only, resolved by a human
 * (mandatory manual review, S1-5). Empty when nothing matches.
 */
export function findOwnerCandidates(
  input: OwnerIdentityInput,
  existing: ExistingOwner[],
): OwnerCandidate[] {
  const key = computeMatchKey(input);
  const normName = normalizeOwnerName(input.displayName);
  const out: OwnerCandidate[] = [];
  for (const o of existing) {
    if (o.matchKey === key) {
      out.push({ ownerId: o.id, identityConfidence: MATCH_KEY_CONFIDENCE, reason: "exact-match-key" });
    } else if (o.aliasNormalizedValues?.includes(normName)) {
      out.push({ ownerId: o.id, identityConfidence: ALIAS_CONFIDENCE, reason: "alias-match" });
    }
  }
  return out.sort((a, b) => b.identityConfidence - a.identityConfidence);
}
