// Commercial Intelligence (v1.2, Commit 1b-1) — pure signal-value helpers.
//
// Version stamps + value-envelope construction for the provenance ledger. No
// Prisma; unit-testable. The three versions are recorded on every observation
// and signal so a later change to record format, normalization, or projection
// rules is reproducible and migratable (Volume 12 §3 — version stamping).

/** Ledger record schema version — bump when the observation/signal shape changes. */
export const LEDGER_SCHEMA_VERSION = 1;
/** Normalization-logic version — bump when normalizeOwnerName (etc.) changes. */
export const NORMALIZATION_VERSION = 1;
/** Projection-rules version — bump when the precedence rule changes (1b-2+). */
export const PROJECTION_VERSION = 1;

export interface ValueEnvelope {
  valueType: string;
  valueRaw: string;
  valueNormalized: string | null;
}

/**
 * Build the stored value envelope for a field. In 1.2 owner fields are strings
 * (displayName) or enum labels (entityType) — both stored as text with a
 * `valueType` tag so future numeric/date/boolean values reproduce exactly.
 */
export function valueEnvelope(raw: string, normalized?: string | null): ValueEnvelope {
  return { valueType: "string", valueRaw: raw, valueNormalized: normalized ?? null };
}
