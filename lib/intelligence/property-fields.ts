// Commercial Intelligence (v1.2, Commit 2a-ii) — the projected Property field
// list + value normalization, as a PURE module (no Prisma). Mirrors owner-fields:
// pure consumers (the Property SourceAdapter validating which fields it may emit)
// import the canonical field set without pulling the DB-coupled projection writer.
//
// Decision (Slice 2 walking skeleton): only the smallest immutable physical-facts
// set is projected from the ledger first — `yearBuilt` and `squareFeet`. `unitCount`
// stays operational (it is edited more often and is a weak proxy for the richer
// "unit mix" that gets its own modeling later). Financial columns stay operational.
export const PROPERTY_PROJECTED_FIELDS = ["yearBuilt", "squareFeet"] as const;
export type PropertyProjectedField = (typeof PROPERTY_PROJECTED_FIELDS)[number];

/** Type guard: is `fieldKey` a projected Property field? */
export function isPropertyProjectedField(fieldKey: string): fieldKey is PropertyProjectedField {
  return (PROPERTY_PROJECTED_FIELDS as readonly string[]).includes(fieldKey);
}

/**
 * Normalize a raw projected-Property value to a canonical non-negative-integer
 * string, or null when invalid. Both projected fields are integer columns, so the
 * canonical form is the parsed integer as text; `yearBuilt` is additionally bounded
 * to a plausible range (deterministic bounds — no wall-clock). Pure: the adapter's
 * map() and the domain writer use this to validate + canonicalize before the ledger.
 */
export function normalizePropertyValue(fieldKey: PropertyProjectedField, raw: string): string | null {
  const cleaned = raw.replace(/[,\s]/g, "");
  if (!/^\d+$/.test(cleaned)) return null; // digits only ⇒ always a non-negative integer
  const n = Number.parseInt(cleaned, 10);
  if (fieldKey === "yearBuilt" && (n < 1600 || n > 2100)) return null;
  return String(n);
}
