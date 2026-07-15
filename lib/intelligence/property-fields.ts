// Commercial Intelligence (v1.2, Commit 2c-i) — the projected Property field model
// as ONE explicit, static, compile-time typed map (Decision ID-2). PURE (no Prisma).
//
// Each field declares a value TYPE and a deterministic NORMALIZER; the projection
// writer (property-projection) coerces the normalized value to the typed column.
// This generalizes the 2a integer-only model to string ANCHOR fields WITHOUT a
// dynamic/plugin/runtime-configurable framework and WITHOUT a second projection
// path — Property-specific behavior stays here + in the Property projection module;
// the entity registry stays dispatch-only.
//
// Projected fields:
//   yearBuilt / squareFeet      integer      (immutable physical facts)
//   apnNormalized               string-anchor (parcel number, jurisdiction-scoped)
//   countyFipsCode              string-anchor (county FIPS)
//   addressNormalized           string-anchor (deterministically normalized address)
// Raw submitted values are preserved in Observation provenance; the normalized
// value is the deterministic, versioned projection value.
import { normalizeAddress, normalizeApn, normalizeFips } from "@/lib/intelligence/property-normalizers";

export type PropertyFieldType = "integer" | "string-anchor";
export type PropertyProjectedField = "yearBuilt" | "squareFeet" | "apnNormalized" | "countyFipsCode" | "addressNormalized";

interface PropertyFieldDef {
  type: PropertyFieldType;
  /** Deterministic canonicalizer: raw → normalized string, or null when invalid. */
  normalize: (raw: string) => string | null;
}

/** A bounded non-negative-integer normalizer (canonical form = the parsed integer as text). */
function normalizeInteger(bounds: { min?: number; max?: number }) {
  return (raw: string): string | null => {
    const cleaned = raw.replace(/[,\s]/g, "");
    if (!/^\d+$/.test(cleaned)) return null; // digits only ⇒ non-negative integer
    const n = Number.parseInt(cleaned, 10);
    if (bounds.min !== undefined && n < bounds.min) return null;
    if (bounds.max !== undefined && n > bounds.max) return null;
    return String(n);
  };
}

/** The single, explicit, static field-definition map (Decision ID-2 — no runtime registration). */
export const PROPERTY_FIELDS: Record<PropertyProjectedField, PropertyFieldDef> = {
  yearBuilt: { type: "integer", normalize: normalizeInteger({ min: 1600, max: 2100 }) },
  squareFeet: { type: "integer", normalize: normalizeInteger({ min: 0 }) },
  apnNormalized: { type: "string-anchor", normalize: normalizeApn },
  countyFipsCode: { type: "string-anchor", normalize: normalizeFips },
  addressNormalized: { type: "string-anchor", normalize: normalizeAddress },
};

export const PROPERTY_PROJECTED_FIELDS = Object.keys(PROPERTY_FIELDS) as PropertyProjectedField[];
/** The projected fields that are identity anchors (string-anchor typed). */
export const PROPERTY_ANCHOR_FIELDS = PROPERTY_PROJECTED_FIELDS.filter((k) => PROPERTY_FIELDS[k].type === "string-anchor");

/** Type guard: is `fieldKey` a projected Property field? */
export function isPropertyProjectedField(fieldKey: string): fieldKey is PropertyProjectedField {
  return Object.prototype.hasOwnProperty.call(PROPERTY_FIELDS, fieldKey);
}

/** Is `fieldKey` a projected string-anchor field (contributes to PropertyIdentity)? */
export function isPropertyAnchorField(fieldKey: string): boolean {
  return isPropertyProjectedField(fieldKey) && PROPERTY_FIELDS[fieldKey].type === "string-anchor";
}

/** The declared value type of a projected field. */
export function propertyFieldType(fieldKey: PropertyProjectedField): PropertyFieldType {
  return PROPERTY_FIELDS[fieldKey].type;
}

/**
 * Normalize a raw projected-Property value to its canonical form (or null when
 * invalid), dispatching to the field's deterministic normalizer. Pure: the adapter
 * and the domain writer use this to validate + canonicalize before the ledger.
 */
export function normalizePropertyValue(fieldKey: PropertyProjectedField, raw: string): string | null {
  return PROPERTY_FIELDS[fieldKey].normalize(raw);
}
