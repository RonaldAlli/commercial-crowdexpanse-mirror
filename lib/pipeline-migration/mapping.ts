// E5 · Migration: the versioned MigrationMapping registry (data, not code). Each rule DECLARES its outcome
// (MIG-INV-1). Mappings are versioned (MIG-INV-4) so an old plan stays reproducible.

import type { MigrationMapping } from "./types";

const asObj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

// mapping-v1: legacy stage strings → MIGRATION_ORIGIN decision assertions; verified diligence → VERIFIED_FACT
// evidence; unverified diligence → REVIEW; anything else → REVIEW (UNMAPPED — explicit, never guessed).
const MAPPING_V1: MigrationMapping = {
  mappingId: "legacy-crm",
  mappingVersion: "mapping-v1",
  rules: [
    {
      ruleId: "stage-under-contract",
      match: (d) => d.sourceField === "stage" && d.value === "UNDER_CONTRACT",
      outcome: "MIGRATION_ORIGIN",
      buildTarget: () => ({ factType: "CONTRACT_EXECUTED", op: "DECLARE" }),
    },
    {
      ruleId: "stage-buyer-matched",
      match: (d) => d.sourceField === "stage" && d.value === "BUYER_MATCHED",
      outcome: "MIGRATION_ORIGIN",
      buildTarget: () => ({ factType: "BUYER_MATCHED", op: "DECLARE" }),
    },
    {
      ruleId: "diligence-verified",
      match: (d) => d.sourceField === "diligence" && asObj(d.value).verified === true,
      outcome: "VERIFIED_FACT",
      buildTarget: (d) => ({ factType: "DILIGENCE_MATERIAL_RECEIVED", op: "RECORD_EVIDENCE", subjectKey: String(asObj(d.value).material ?? "unknown") }),
    },
    {
      ruleId: "diligence-unverified",
      match: (d) => d.sourceField === "diligence" && asObj(d.value).verified !== true,
      outcome: "REVIEW",
      reviewReason: "diligence material not independently verified — cannot synthesize evidence (MIG-INV-2)",
    },
  ],
};

// mapping-v2: same shape, but a policy change — legacy UNDER_CONTRACT is now sent to REVIEW instead of asserted.
const MAPPING_V2: MigrationMapping = {
  mappingId: "legacy-crm",
  mappingVersion: "mapping-v2",
  rules: [
    { ruleId: "stage-under-contract", match: (d) => d.sourceField === "stage" && d.value === "UNDER_CONTRACT", outcome: "REVIEW", reviewReason: "policy v2: legacy contract stage requires manual confirmation" },
    ...MAPPING_V1.rules.filter((r) => r.ruleId !== "stage-under-contract"),
  ],
};

const REGISTRY: Record<string, MigrationMapping> = { "mapping-v1": MAPPING_V1, "mapping-v2": MAPPING_V2 };

export function getMapping(mappingVersion: string): MigrationMapping | undefined {
  return REGISTRY[mappingVersion];
}
