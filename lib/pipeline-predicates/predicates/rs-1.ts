// E2 · Slice B — Predicate Engine: rule-set "rs-1" predicate implementations.
// The ratified first set (PREDICATE_ENGINE_DESIGN.md §7). Pure functions over the FactGraph; policy constants
// are embedded here (this versioned implementation IS the policy). Decision-visible reads only (retractions
// suppress assertions — FactGraph §4.3). Sub-evaluation goes through ctx.evaluate (PE-INV-1).

import type { EvaluationContext, Predicate, PredicateOutcome } from "../types";

const RS1: {
  requiredDiligenceMaterials: string[];
  requiredContingencies: string[];
  financingClearedStates: string[];
  financingFundedState: string;
} = {
  requiredDiligenceMaterials: ["t12", "rent_roll", "psa"],
  requiredContingencies: ["inspection", "financing"],
  financingClearedStates: ["CLEARED", "FUNDED"],
  financingFundedState: "FUNDED",
};

function ok(factsRelied: string[]): PredicateOutcome {
  return { satisfied: true, reasons: [{ code: "SATISFIED" }], factsRelied, missing: [] };
}
function no(missing: string[], factsRelied: string[], code: string): PredicateOutcome {
  return { satisfied: false, reasons: [{ code, detail: missing.join(",") }], factsRelied, missing };
}

/** An asserted FUNDS_DISBURSED (evidence) with the given payload.purpose, if present. */
function fundsWithPurpose(ctx: EvaluationContext, purpose: string) {
  return ctx.graph
    .activeAssertedByType("FUNDS_DISBURSED")
    .find((f) => (f.payload as { purpose?: string } | null)?.purpose === purpose);
}

const DILIGENCE_COMPLETE: Predicate = (ctx) => {
  const present = ctx.graph.collection("DILIGENCE_MATERIAL_RECEIVED");
  const relied: string[] = [];
  const missing: string[] = [];
  for (const k of RS1.requiredDiligenceMaterials) {
    const f = present.byKey.get(k);
    if (f) relied.push(f.id);
    else missing.push(`diligence:${k}`);
  }
  return missing.length === 0 ? ok(relied) : no(missing, relied, "DILIGENCE_INCOMPLETE");
};

const CLEAR_TO_CLOSE: Predicate = (ctx) => {
  const relied: string[] = [];
  const missing: string[] = [];
  const dil = ctx.evaluate("DILIGENCE_COMPLETE"); // composition through the evaluator (PE-INV-1)
  relied.push(...dil.factsRelied);
  if (!dil.satisfied) missing.push("DILIGENCE_COMPLETE");
  const removed = ctx.graph.collection("CONTINGENCY_REMOVED");
  for (const c of RS1.requiredContingencies) {
    const f = removed.byKey.get(c);
    if (f) relied.push(f.id);
    else missing.push(`contingency:${c}`);
  }
  const financing = ctx.graph.activeByType("FINANCING");
  if (financing && RS1.financingClearedStates.includes(financing.state ?? "")) relied.push(financing.id);
  else missing.push("financing:cleared");
  return missing.length === 0 ? ok(relied) : no(missing, relied, "NOT_CLEAR_TO_CLOSE");
};

const TRANSACTION_CLOSED_CASH: Predicate = (ctx) => {
  const relied: string[] = [];
  const missing: string[] = [];
  const contract = ctx.graph.activeByType("CONTRACT_EXECUTED"); // versioned decision
  if (contract) relied.push(contract.id);
  else missing.push("CONTRACT_EXECUTED");
  const removed = ctx.graph.collection("CONTINGENCY_REMOVED");
  for (const c of RS1.requiredContingencies) {
    const f = removed.byKey.get(c);
    if (f) relied.push(f.id);
    else missing.push(`contingency:${c}`);
  }
  const settlement = ctx.graph.activeByType("SETTLEMENT_COMPLETED");
  if (settlement) relied.push(settlement.id);
  else missing.push("SETTLEMENT_COMPLETED");
  const funds = fundsWithPurpose(ctx, "SellerProceeds");
  if (funds) relied.push(funds.id);
  else missing.push("FUNDS_DISBURSED:SellerProceeds");
  return missing.length === 0 ? ok(relied) : no(missing, relied, "CASH_NOT_CLOSED");
};

const TRANSACTION_CLOSED_THIRD_PARTY_FINANCED: Predicate = (ctx) => {
  const relied: string[] = [];
  const missing: string[] = [];
  const cash = ctx.evaluate("TRANSACTION_CLOSED.CASH"); // cash core, through the evaluator
  relied.push(...cash.factsRelied);
  if (!cash.satisfied) missing.push(...cash.missing);
  const financing = ctx.graph.activeByType("FINANCING");
  if (financing && financing.state === RS1.financingFundedState) relied.push(financing.id);
  else missing.push("financing:FUNDED");
  return missing.length === 0 ? ok(relied) : no(missing, relied, "FINANCED_NOT_CLOSED");
};

const TRANSACTION_CLOSED_ASSIGNMENT: Predicate = (ctx) => {
  const relied: string[] = [];
  const missing: string[] = [];
  const contract = ctx.graph.activeByType("CONTRACT_EXECUTED");
  if (contract) relied.push(contract.id);
  else missing.push("CONTRACT_EXECUTED");
  const assign = ctx.graph.activeByType("ASSIGNMENT_EXECUTED");
  if (assign) relied.push(assign.id);
  else missing.push("ASSIGNMENT_EXECUTED");
  const fee = fundsWithPurpose(ctx, "AssignmentFee");
  if (fee) relied.push(fee.id);
  else missing.push("FUNDS_DISBURSED:AssignmentFee");
  return missing.length === 0 ? ok(relied) : no(missing, relied, "ASSIGNMENT_NOT_CLOSED");
};

export const RS1_PREDICATES: Record<string, Predicate> = {
  DILIGENCE_COMPLETE,
  CLEAR_TO_CLOSE,
  "TRANSACTION_CLOSED.CASH": TRANSACTION_CLOSED_CASH,
  "TRANSACTION_CLOSED.THIRD_PARTY_FINANCED": TRANSACTION_CLOSED_THIRD_PARTY_FINANCED,
  "TRANSACTION_CLOSED.ASSIGNMENT": TRANSACTION_CLOSED_ASSIGNMENT,
};
