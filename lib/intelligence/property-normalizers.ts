// Commercial Intelligence (v1.2, Commit 2c-i) — pure, deterministic, versioned
// normalizers for Property identity ANCHORS. No Prisma; unit-testable in isolation.
//
// These compute the canonical NORMALIZED anchor value that gets projected; the
// RAW submitted value is always preserved separately in the Observation ledger
// (invariant #3). Anchors are EVIDENCE, not identity (the surrogate Property.id is
// the identity). Address normalization is deliberately MINIMAL and deterministic —
// it produces candidate evidence, NOT certified USPS/CASS deliverability (PI-C).
//
// Each normalizer carries a version. A version bump affects only NEW observations;
// frozen signals keep their stored valueNormalized, so reconstruction stays
// byte-for-byte (the same guarantee integer fields already have).

import { createHash } from "node:crypto";

export const APN_NORMALIZATION_VERSION = 1;
export const FIPS_NORMALIZATION_VERSION = 1;
export const ADDRESS_NORMALIZATION_VERSION = 1;

/**
 * Identity DERIVATION ALGORITHM version — an explicit architectural concept,
 * distinct from the per-anchor normalizer versions. Bump this when the *algorithm*
 * that derives identity from evidence changes (e.g. which anchors participate, how
 * the fingerprint is composed), even if no normalizer changed. Folding it into the
 * fingerprint lets a consumer distinguish three independent kinds of change:
 *   • different EVIDENCE under the same algorithm  (anchors changed)
 *   • same evidence under a different NORMALIZATION (a normalizer version changed)
 *   • same evidence under a different ALGORITHM      (this version changed)
 */
export const IDENTITY_ALGORITHM_VERSION = 1;

/**
 * Deterministic identity FINGERPRINT: a pure function of the identity ALGORITHM
 * version + the winning anchor set + the normalizer versions that produced it — no
 * wall-clock, no randomness, no sequence — so it is rebuildable and stable across
 * processes. Lets a consumer detect a semantic identity change without diffing the
 * row (an algorithm bump, a normalizer bump, or any anchor change flips it;
 * identical evidence under the same algorithm + normalizers keeps it).
 */
export function propertyIdentityFingerprint(anchors: {
  countyFipsCode: string | null;
  apnNormalized: string | null;
  addressNormalized: string | null;
}): string {
  const canonical = JSON.stringify({
    alg: IDENTITY_ALGORITHM_VERSION,
    fips: anchors.countyFipsCode,
    apn: anchors.apnNormalized,
    addr: anchors.addressNormalized,
    v: { apn: APN_NORMALIZATION_VERSION, fips: FIPS_NORMALIZATION_VERSION, addr: ADDRESS_NORMALIZATION_VERSION },
  });
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}

/**
 * APN → upper-cased alphanumeric; formatting (dashes/dots/spaces) dropped. APN
 * formats vary wildly by county, so normalization is intentionally minimal. The
 * raw submitted APN (e.g. "123-45-678") is preserved in the ledger. Null if empty.
 */
export function normalizeApn(raw: string): string | null {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return cleaned.length > 0 ? cleaned : null;
}

/** County FIPS → exactly 5 digits (state 2 + county 3); leading zeros preserved. Else null. */
export function normalizeFips(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  return /^\d{5}$/.test(digits) ? digits : null;
}

const DIRECTIONALS: Record<string, string> = {
  NORTH: "N", SOUTH: "S", EAST: "E", WEST: "W",
  NORTHEAST: "NE", NORTHWEST: "NW", SOUTHEAST: "SE", SOUTHWEST: "SW",
};
const SUFFIXES: Record<string, string> = {
  STREET: "ST", ST: "ST", AVENUE: "AVE", AVE: "AVE", BOULEVARD: "BLVD", BLVD: "BLVD",
  ROAD: "RD", RD: "RD", DRIVE: "DR", DR: "DR", LANE: "LN", LN: "LN",
  COURT: "CT", CT: "CT", PLACE: "PL", PL: "PL", TERRACE: "TER", TER: "TER",
  CIRCLE: "CIR", CIR: "CIR", HIGHWAY: "HWY", HWY: "HWY", PARKWAY: "PKWY", PKWY: "PKWY",
  TRAIL: "TRL", TRL: "TRL", WAY: "WAY",
};
const UNIT_TOKENS = new Set(["APT", "APARTMENT", "UNIT", "STE", "SUITE", "NO"]);

/**
 * Deterministic, minimal single-line address normalization: upper-case, collapse
 * whitespace, standardize directionals + street suffixes, extract/normalize a unit
 * designator to "UNIT <x>", normalize a bare 9-digit ZIP to #####-####. Idempotent
 * (normalize(normalize(x)) === normalize(x)). NOT deliverability validation.
 */
export function normalizeAddress(raw: string): string | null {
  const collapsed = raw.toUpperCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
  if (collapsed.length === 0) return null;
  const tokens = collapsed.split(" ");
  const out: string[] = [];
  let unit: string | null = null;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === "#") { unit = tokens[i + 1] ?? ""; i++; continue; }
    if (t.startsWith("#")) { unit = t.slice(1); continue; }
    if (UNIT_TOKENS.has(t)) { unit = tokens[i + 1] ?? ""; i++; continue; }
    out.push(DIRECTIONALS[t] ?? SUFFIXES[t] ?? t);
  }
  let line = out.join(" ").replace(/\b(\d{5})(\d{4})\b/, "$1-$2").trim();
  if (unit !== null && unit.length > 0) line = `${line} UNIT ${unit}`.trim();
  return line.length > 0 ? line : null;
}
