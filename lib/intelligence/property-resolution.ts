// Commercial Intelligence (v1.2, Commit 2c-ii) — the PURE Property-identity
// resolution CLASSIFIER + pair helpers. No Prisma, no clock, no randomness, no DB,
// no side effects.
//
// Locked invariant "Classification is pure": given identical evidence + identical
// lookup results, classifyResolution ALWAYS yields the identical outcome. It decides
// WHICH tier an inbound evidence set falls in and records a deterministic `basis`
// (explanatory metadata — why this path was taken — never an input to behavior).
//
// Authority hierarchy (locked): the parcel key (FIPS+APN) and an external identifier
// are AUTHORITATIVE anchors; a normalized address is WEAK.
//   • exactly one authoritative target, conflict-free      → Tier 1A  (resolve)
//   • two or more authoritative targets (they disagree)    → Tier 1B  (candidates)
//   • no authoritative target, but an in-jurisdiction address match → Tier 2 (proposal)
//   • nothing                                              → NONE      (create new)
// A weak address disagreement never blocks Tier 1A on its own; it only matters when
// it introduces ANOTHER authoritative candidate — which, by construction, would
// already appear in `authoritative` below (parcel/crosswalk), so the rule is
// enforced automatically. The hierarchy stays: parcel ↓ external identifier ↓ address.
import { createHash } from "node:crypto";

export type ResolutionTier = "1A" | "1B" | "2" | "NONE";
export type ResolutionBasis =
  | "UNIQUE_PARCEL"
  | "UNIQUE_EXTERNAL_IDENTIFIER"
  | "PARCEL_CONFLICT"
  | "ADDRESS_PROPOSAL"
  | "EXTERNAL_ID_CONFLICT";

export interface ResolutionEvidence {
  anchors: { countyFipsCode: string | null; apnNormalized: string | null; addressNormalized: string | null };
  externalIds: { provider: string; providerIdentifier: string }[];
}

/** Org-scoped lookup results feeding the classifier (produced by the DB Lookup step). */
export interface ResolutionMatches {
  parcelIds: string[]; // properties whose parcelKey equals the inbound parcel key
  addrIds: string[]; // properties matching the inbound normalized address in-jurisdiction
  xwalkTargets: string[]; // properties an inbound ACTIVE external identifier maps to
}

export type ResolutionOutcome =
  | { tier: "1A"; basis: "UNIQUE_PARCEL" | "UNIQUE_EXTERNAL_IDENTIFIER"; targetPropertyId: string; candidatePropertyIds: string[]; reason: string }
  | { tier: "1B"; basis: "PARCEL_CONFLICT" | "EXTERNAL_ID_CONFLICT"; targetPropertyId: null; candidatePropertyIds: string[]; reason: string }
  | { tier: "2"; basis: "ADDRESS_PROPOSAL"; targetPropertyId: null; candidatePropertyIds: string[]; reason: string }
  | { tier: "NONE"; basis: null; targetPropertyId: null; candidatePropertyIds: string[]; reason: string };

const uniq = (xs: string[]): string[] => Array.from(new Set(xs));

/**
 * Classify inbound evidence against org-scoped lookup results. PURE + deterministic:
 * no DB, no clock, no randomness, no writes. `matches` are already org-scoped.
 */
export function classifyResolution(evidence: ResolutionEvidence, matches: ResolutionMatches): ResolutionOutcome {
  const parcelIds = uniq(matches.parcelIds);
  const xwalkTargets = uniq(matches.xwalkTargets);
  const addrIds = uniq(matches.addrIds);
  const authoritative = uniq([...parcelIds, ...xwalkTargets]);

  if (authoritative.length === 1) {
    const target = authoritative[0];
    const basis = parcelIds.length > 0 ? "UNIQUE_PARCEL" : "UNIQUE_EXTERNAL_IDENTIFIER";
    return {
      tier: "1A",
      basis,
      targetPropertyId: target,
      candidatePropertyIds: [],
      reason: basis === "UNIQUE_PARCEL" ? "unique conflict-free parcel match" : "unique conflict-free external-identifier match",
    };
  }

  if (authoritative.length > 1) {
    // A parcel is involved in the disagreement ⇒ PARCEL_CONFLICT (the stronger anchor);
    // otherwise the conflict is purely between external identifiers.
    const basis = parcelIds.length > 0 ? "PARCEL_CONFLICT" : "EXTERNAL_ID_CONFLICT";
    return {
      tier: "1B",
      basis,
      targetPropertyId: null,
      candidatePropertyIds: authoritative,
      reason: basis === "PARCEL_CONFLICT" ? "conflicting authoritative parcel / identifier evidence" : "conflicting external-identifier evidence",
    };
  }

  // No authoritative target. A weak in-jurisdiction address match is proposal-only.
  if (addrIds.length > 0) {
    return { tier: "2", basis: "ADDRESS_PROPOSAL", targetPropertyId: null, candidatePropertyIds: addrIds, reason: "in-jurisdiction address agreement (proposal only)" };
  }

  return { tier: "NONE", basis: null, targetPropertyId: null, candidatePropertyIds: [], reason: "no identity match — new canonical property" };
}

/** Canonical unordered property pair (smaller id first) so a decision is order-independent. */
export function propertyPairKey(id1: string, id2: string): [string, string] {
  return id1 < id2 ? [id1, id2] : [id2, id1];
}

/**
 * Deterministic candidate fingerprint = both sides' identityVersion (order-independent)
 * + the match basis. PURE. Reuses the 2c-i identityVersion, so any anchor change on
 * either side flips it — the material-change signal a DISMISSED pair resurfaces on.
 */
export function computePairFingerprint(identityVersionA: string | null, identityVersionB: string | null, basis: ResolutionBasis): string {
  const canonical = JSON.stringify({ v: [identityVersionA, identityVersionB].sort(), basis });
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}
