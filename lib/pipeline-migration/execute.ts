// E5 · Migration: executePlan — the OPERATIONAL step (separated from the immutable plan). Applies each PlanItem:
// VERIFIED_FACT → recordFact (provenance VERIFIED); MIGRATION_ORIGIN → recordMigrationFact (MIGRATION_ORIGIN,
// MIGRATION_PRINCIPAL); REVIEW → the review queue (never the ledger). Idempotent by source key. The RESULT set is
// deterministic; timing/progress/retries are operational. docs/architecture/E5_MIGRATION_DESIGN.md.

import { prisma } from "@/lib/prisma";
import { recordFact, recordMigrationFact } from "@/lib/pipeline-facts";
import type { MigrationExecutionResult, MigrationPlan, MigrationReviewItem } from "./types";
import { sourceKey } from "./types";

const reasonKey = (identity: Parameters<typeof sourceKey>[0]): string => `MIG:${sourceKey(identity)}`;

export type ExecutionContext = { migrationBatchId: string; migrationSource: string };

export async function executePlan(plan: MigrationPlan, ctx: ExecutionContext): Promise<MigrationExecutionResult> {
  const factItems = plan.items.filter((i) => i.outcome !== "REVIEW" && !i.planError);
  const keys = factItems.map((i) => reasonKey(i.identity));
  const existing = keys.length ? await prisma.pipelineFact.findMany({ where: { reason: { in: keys } }, select: { reason: true } }) : [];
  const already = new Set(existing.map((e) => e.reason));

  const result: MigrationExecutionResult = { migrationBatchId: ctx.migrationBatchId, migrationSource: ctx.migrationSource, recorded: [], skipped: [], review: [], errors: [] };

  for (const item of plan.items) {
    if (item.outcome === "REVIEW" || item.planError) {
      const review: MigrationReviewItem = { identity: item.identity, reviewReason: item.reviewReason ?? item.planError ?? "REVIEW", proposedFactType: item.proposedFactType ?? item.target?.factType ?? null };
      result.review.push(review);
      continue;
    }
    const key = reasonKey(item.identity);
    if (already.has(key)) { result.skipped.push({ identity: item.identity, reason: "ALREADY_PRESENT" }); continue; }
    const t = item.target!;
    try {
      const common = { organizationId: item.organizationId, opportunityId: item.opportunityId, factType: t.factType, operation: t.op as never, subjectKey: t.subjectKey ?? null, state: t.state ?? null, payload: (t.payload ?? null) as never, artifactVersion: t.artifactVersion ?? null, reason: key };
      const fact =
        item.outcome === "VERIFIED_FACT"
          ? await recordFact({ ...common, actorType: "MIGRATION_PRINCIPAL", actorId: ctx.migrationSource })
          : await recordMigrationFact({ ...common, actorId: ctx.migrationSource });
      result.recorded.push({ identity: item.identity, factId: fact.id, provenance: fact.provenance });
    } catch (e) {
      result.errors.push({ identity: item.identity, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return result;
}
