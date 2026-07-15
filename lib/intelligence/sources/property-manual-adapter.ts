// Commercial Intelligence (v1.2, Commit 2a-ii) — the Property manual SourceAdapter.
//
// The Property analogue of manual-adapter.ts: its "source" is the user-submitted
// payload. USER_ENTERED category (the only category live in 1.2). PURE: fetch()
// echoes the submitted records; map() validates + canonicalizes one record into a
// candidate. No DB, no ProjectionService, no permission checks (Volume 12 — pure
// adapters). Scope: refreshes EXISTING Properties, only the projected fields
// (yearBuilt, squareFeet) — proves the pipeline, not field breadth.
import { isPropertyProjectedField, normalizePropertyValue, type PropertyProjectedField } from "@/lib/intelligence/property-fields";
import type { CandidateObservation, RawRecord, RefreshContext, RefreshInput, SourceAdapter } from "@/lib/intelligence/sources/types";

/** Bump when this adapter's map/validation logic changes (recorded on every observation). */
export const PROPERTY_MANUAL_ADAPTER_VERSION = 1;

export const propertyManualAdapter: SourceAdapter = {
  sourceKey: "manual:property",
  sourceCategory: "USER_ENTERED",
  adapterVersion: PROPERTY_MANUAL_ADAPTER_VERSION,

  async fetch(input: RefreshInput): Promise<RawRecord[]> {
    // No external I/O: the manual source IS the submitted payload.
    return input.records;
  },

  map(raw: RawRecord, ctx: RefreshContext): CandidateObservation[] {
    const fieldKey = typeof raw.fieldKey === "string" ? raw.fieldKey : String(raw.fieldKey ?? "");
    const rawValue = raw.value;
    const valueRaw = typeof rawValue === "string" ? rawValue : String(rawValue ?? "");
    const base = { entityType: ctx.entityType, entityId: ctx.entityId, fieldKey, valueRaw, asOf: ctx.asOf, method: "manual" };

    if (!isPropertyProjectedField(fieldKey)) {
      return [{ ...base, rejected: { reason: `unknown field "${fieldKey}"` } }];
    }
    const normalized = normalizePropertyValue(fieldKey as PropertyProjectedField, valueRaw);
    if (normalized === null) {
      const expects = fieldKey === "yearBuilt" ? "a year between 1600 and 2100" : "a non-negative integer";
      return [{ ...base, rejected: { reason: `field "${fieldKey}" requires ${expects}` } }];
    }
    // Store the canonical numeric string in both raw + normalized so the projection
    // parses cleanly (e.g. "1,998" → "1998"); there is no lossy display form for a number.
    return [{ ...base, valueRaw: normalized, valueNormalized: normalized }];
  },
};
