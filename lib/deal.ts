// BE-2 Step 1 — pure Deal rules (no DB; unit-tested). The DB orchestration lives in
// lib/deal-service.ts. A Deal is born from the canonical "Deal Controlled" business event, whose
// current implementation is the CONTRACT_EXECUTED decision fact (rename is BE-3's call).
import { PipelineFactClass, PipelineFactOperation } from "@prisma/client";

/** Current implementation name of the architectural "Deal Controlled" event. */
export const CONTROL_FACT_TYPE = "CONTRACT_EXECUTED";

/** The frozen Business Architecture baseline this code aligns to (tag business-architecture-v1.0). */
export const BUSINESS_ARCHITECTURE_VERSION = "1.0";

/**
 * Operations that WITHDRAW a fact. An active row carrying one of these means the decision has been
 * pulled back — so it does NOT establish control (a RETRACT of CONTRACT_EXECUTED is itself an active
 * CONTRACT_EXECUTED/DECISION row, and must not be mistaken for the control assertion).
 */
const WITHDRAWING_OPS = new Set<PipelineFactOperation>([PipelineFactOperation.RETRACT, PipelineFactOperation.INVALIDATE]);

/**
 * Select the active Deal-Controlled assertion (a CONTRACT_EXECUTED DECISION whose active row is not a
 * withdrawal) from a set of ALREADY-ACTIVE facts. Pure: the caller supplies the active set (superseded
 * rows are already excluded); this additionally rejects an active RETRACT/INVALIDATE row.
 */
export function selectControlFact<T extends { factType: string; factClass: PipelineFactClass; operation: PipelineFactOperation }>(
  activeFacts: readonly T[],
): T | null {
  return (
    activeFacts.find(
      (f) => f.factType === CONTROL_FACT_TYPE && f.factClass === PipelineFactClass.DECISION && !WITHDRAWING_OPS.has(f.operation),
    ) ?? null
  );
}

/** Control-effective time: business event time when present, else the record time. Pure. */
export function controlledAtOf(fact: { occurredAt: Date | null; recordedAt: Date }): Date {
  return fact.occurredAt ?? fact.recordedAt;
}
