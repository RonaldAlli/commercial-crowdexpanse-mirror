// E5 · Migration: types. docs/architecture/E5_MIGRATION_DESIGN.md.
// Migration CLASSIFIES (never infers): every source datum → VERIFIED_FACT | MIGRATION_ORIGIN | REVIEW (MIG-INV-1).
// Immutable Plan (deterministic/reviewable) vs operational Execution. Never manufactures evidence (MIG-INV-2).

export type MigrationOutcome = "VERIFIED_FACT" | "MIGRATION_ORIGIN" | "REVIEW";

/** First-class deterministic source identity — its serialization is the source key (replay + idempotency). */
export type MigrationIdentity = {
  sourceSystem: string;
  sourceObject: string;
  sourceRecordId: string;
  sourceField: string;
  mappingVersion: string;
};
export const sourceKey = (id: MigrationIdentity): string =>
  JSON.stringify([id.sourceSystem, id.sourceObject, id.sourceRecordId, id.sourceField, id.mappingVersion]);

export type SourceDatum = {
  sourceSystem: string;
  sourceObject: string;
  sourceRecordId: string;
  sourceField: string;
  value: unknown;
  organizationId: string;
  opportunityId: string;
};

export type TargetFact = {
  factType: string;
  op: string;
  subjectKey?: string | null;
  state?: string | null;
  payload?: Record<string, unknown> | null;
  artifactVersion?: string | null;
};

export type MappingRule = {
  ruleId: string;
  match: (d: SourceDatum) => boolean;
  outcome: MigrationOutcome;
  buildTarget?: (d: SourceDatum) => TargetFact; // VERIFIED_FACT | MIGRATION_ORIGIN
  reviewReason?: string; // REVIEW
};

/** The mapping ITSELF is versioned (MIG-INV-4), not just the code. */
export type MigrationMapping = { mappingId: string; mappingVersion: string; rules: MappingRule[] };

export type PlanItem = {
  identity: MigrationIdentity;
  organizationId: string;
  opportunityId: string;
  outcome: MigrationOutcome;
  target?: TargetFact; // present for fact outcomes
  reviewReason?: string; // present for REVIEW
  proposedFactType?: string | null;
  planError?: string; // e.g. a mapping error rejected at plan time (MIG-INV-2)
};

/** Immutable, reviewable, reproducible (MIG-INV-5). */
export type MigrationPlan = { planId: string; mappingId: string; mappingVersion: string; items: PlanItem[] };

export type MigrationReviewItem = { identity: MigrationIdentity; reviewReason: string; proposedFactType?: string | null };

export type MigrationExecutionResult = {
  migrationBatchId: string; // operational (this execution)
  migrationSource: string; // where the data originated
  recorded: { identity: MigrationIdentity; factId: string; provenance: string }[];
  skipped: { identity: MigrationIdentity; reason: "ALREADY_PRESENT" }[];
  review: MigrationReviewItem[];
  errors: { identity: MigrationIdentity; error: string }[];
};
