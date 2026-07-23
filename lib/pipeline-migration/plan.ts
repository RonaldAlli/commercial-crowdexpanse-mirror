// E5 · Migration: buildPlan — a PURE, deterministic, immutable classification of source data (MIG-INV-1/5).
// No side effects, no source mutation (MIG-INV-3). Enforces MIG-INV-2: an EVIDENCE-target datum can never be
// MIGRATION_ORIGIN — such a mapping is rejected at plan time (routed to REVIEW with a planError).

import { createHash } from "node:crypto";

import { factTypeSpec } from "@/lib/pipeline-facts";
import type { MigrationIdentity, MigrationMapping, MigrationPlan, PlanItem, SourceDatum } from "./types";
import { sourceKey } from "./types";

function classify(d: SourceDatum, mapping: MigrationMapping): PlanItem {
  const identity: MigrationIdentity = {
    sourceSystem: d.sourceSystem,
    sourceObject: d.sourceObject,
    sourceRecordId: d.sourceRecordId,
    sourceField: d.sourceField,
    mappingVersion: mapping.mappingVersion,
  };
  const base = { identity, organizationId: d.organizationId, opportunityId: d.opportunityId };
  const rule = mapping.rules.find((r) => r.match(d));
  if (!rule) return { ...base, outcome: "REVIEW", reviewReason: "UNMAPPED" }; // explicit default, never a guess
  if (rule.outcome === "REVIEW") return { ...base, outcome: "REVIEW", reviewReason: rule.reviewReason ?? "REVIEW" };

  const target = rule.buildTarget!(d);
  // MIG-INV-2 · never manufacture evidence: an EVIDENCE factType may not be MIGRATION_ORIGIN.
  if (rule.outcome === "MIGRATION_ORIGIN" && factTypeSpec(target.factType)?.factClass === "EVIDENCE") {
    return { ...base, outcome: "REVIEW", reviewReason: "MIG-INV-2: evidence cannot be migration-synthesized", proposedFactType: target.factType, planError: "EVIDENCE_MIGRATION_ORIGIN_FORBIDDEN" };
  }
  return { ...base, outcome: rule.outcome, target };
}

/** Deterministic: same source snapshot + same mapping ⇒ identical plan (planId included). Immutable (frozen). */
export function buildPlan(source: readonly SourceDatum[], mapping: MigrationMapping): MigrationPlan {
  const items = source.map((d) => Object.freeze(classify(d, mapping)));
  const digest = createHash("sha256")
    .update(JSON.stringify({ m: mapping.mappingId, v: mapping.mappingVersion, items: items.map((i) => [sourceKey(i.identity), i.outcome, i.target?.factType ?? null, i.planError ?? null]) }))
    .digest("hex")
    .slice(0, 32);
  return Object.freeze({ planId: digest, mappingId: mapping.mappingId, mappingVersion: mapping.mappingVersion, items: Object.freeze(items) as PlanItem[] });
}
