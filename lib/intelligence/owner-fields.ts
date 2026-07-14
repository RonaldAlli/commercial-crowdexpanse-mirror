// Commercial Intelligence (v1.2) — the projected Owner field list, as a PURE
// module (no Prisma). Kept separate from projection.ts so pure consumers — e.g.
// a SourceAdapter validating which fields it may emit (Commit 1c) — can import
// the canonical field set without pulling the DB-coupled ProjectionService.
// Decision: in 1.2 only displayName + entityType are projected from the ledger.
export const OWNER_PROJECTED_FIELDS = ["displayName", "entityType"] as const;
export type OwnerProjectedField = (typeof OWNER_PROJECTED_FIELDS)[number];

/** Type guard: is `fieldKey` a projected Owner field? */
export function isOwnerProjectedField(fieldKey: string): fieldKey is OwnerProjectedField {
  return (OWNER_PROJECTED_FIELDS as readonly string[]).includes(fieldKey);
}
