// Commercial Intelligence (v1.2, Commit 1c) — the manual SourceAdapter.
//
// The walking-skeleton adapter: its "source" is the user-submitted payload. It is
// USER_ENTERED category (the only category live in 1.2) and proves the ingestion
// pipeline end-to-end without any external provider or network I/O. PURE: fetch()
// echoes the submitted records; map() validates + normalizes one record into a
// candidate. No DB, no ProjectionService, no permission checks — see types.ts.
//
// Scope (Commit 1c): refreshes EXISTING Owners only, and only the two projected
// fields (displayName, entityType) — it proves the pipeline, not field breadth.
import { OwnerEntityType } from "@prisma/client";

import { isOwnerProjectedField } from "@/lib/intelligence/owner-fields";
import { normalizeOwnerName } from "@/lib/intelligence/owner-identity";
import type { CandidateObservation, RawRecord, RefreshContext, RefreshInput, SourceAdapter } from "@/lib/intelligence/sources/types";

/** Bump when this adapter's map/validation logic changes (recorded on every observation). */
export const MANUAL_ADAPTER_VERSION = 1;

const ENTITY_TYPES = new Set<string>(Object.values(OwnerEntityType));

export const manualAdapter: SourceAdapter = {
  sourceKey: "manual",
  sourceCategory: "USER_ENTERED",
  adapterVersion: MANUAL_ADAPTER_VERSION,

  async fetch(input: RefreshInput): Promise<RawRecord[]> {
    // No external I/O: the manual source IS the submitted payload.
    return input.records;
  },

  map(raw: RawRecord, ctx: RefreshContext): CandidateObservation[] {
    const fieldKey = typeof raw.fieldKey === "string" ? raw.fieldKey : String(raw.fieldKey ?? "");
    const rawValue = raw.value;
    const valueRaw = typeof rawValue === "string" ? rawValue : String(rawValue ?? "");
    const base = { entityType: ctx.entityType, entityId: ctx.entityId, fieldKey, valueRaw, asOf: ctx.asOf, method: "manual" };

    if (!isOwnerProjectedField(fieldKey)) {
      return [{ ...base, rejected: { reason: `unknown field "${fieldKey}"` } }];
    }
    if (typeof rawValue !== "string" || rawValue.trim() === "") {
      return [{ ...base, rejected: { reason: `field "${fieldKey}" requires a non-empty string value` } }];
    }
    if (fieldKey === "entityType" && !ENTITY_TYPES.has(rawValue)) {
      return [{ ...base, rejected: { reason: `invalid entityType "${rawValue}"` } }];
    }

    const valueNormalized = fieldKey === "displayName" ? normalizeOwnerName(rawValue) : rawValue;
    return [{ ...base, valueNormalized }];
  },
};
