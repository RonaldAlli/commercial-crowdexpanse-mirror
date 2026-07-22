// E1 Core Fact Infrastructure — the fact-type ontology registry.
//
// The Spec-defined fact ontology, code-validated. Every `factType` recorded MUST be registered here
// (no `factType + blob` drift — approved refinement #2). Each entry fixes the GI-3 class, whether the
// fact is a per-item collection fact (A-6), and an optional typed-payload validator (Fact Header +
// Typed Payload). This registry is the ONTOLOGY contract; it holds no persistence or policy logic.
// See docs/architecture/E1_CORE_FACT_INFRASTRUCTURE_DESIGN.md.

import { PipelineFactClass } from "@prisma/client";

export type FactPayload = Record<string, unknown> | null | undefined;

export type FactTypeSpec = {
  /** GI-3 class — determines which operations are structurally valid (see service.ts). */
  factClass: PipelineFactClass;
  /** True when facts of this type are per-item (A-6): a `subjectKey` is REQUIRED. */
  collection: boolean;
  /** Optional typed-payload validator. Returns an error string, or null when valid. */
  validate?: (payload: FactPayload) => string | null;
};

const A = PipelineFactClass.ARTIFACT;
const E = PipelineFactClass.EVIDENCE;
const D = PipelineFactClass.DECISION;

/** Require the named string fields to be present + non-empty on the payload. */
function requireFields(...fields: string[]) {
  return (payload: FactPayload): string | null => {
    if (!payload || typeof payload !== "object") return `payload required with fields: ${fields.join(", ")}`;
    for (const f of fields) {
      const v = (payload as Record<string, unknown>)[f];
      if (v === undefined || v === null || v === "") return `payload.${f} is required`;
    }
    return null;
  };
}

// The FUNDS_DISBURSED typed payload (OWN3.3-INV-1 shared funds ontology).
const FUNDS_PURPOSES = ["SellerProceeds", "AssignmentFee", "Commission", "Refund", "EarnestMoneyReturn"];
function validateFundsDisbursed(payload: FactPayload): string | null {
  const base = requireFields("recipient", "purpose", "amount", "obligation")(payload);
  if (base) return base;
  const purpose = (payload as Record<string, unknown>).purpose;
  if (!FUNDS_PURPOSES.includes(String(purpose))) return `payload.purpose must be one of ${FUNDS_PURPOSES.join("/")}`;
  return null;
}

// The Spec-defined ontology (the five fact families + the projected-stage decision facts). Extensible
// by adding entries here — a new fact type is an ontology change, made deliberately, never ad hoc.
export const FACT_ONTOLOGY: Record<string, FactTypeSpec> = {
  // — Diligence —
  DILIGENCE_MATERIAL_RECEIVED: { factClass: E, collection: true },
  DILIGENCE_COMPLETE: { factClass: D, collection: false },
  // — Buyer Match —
  BUYER_CANDIDATE_IDENTIFIED: { factClass: E, collection: true },
  BUYER_QUALIFIED: { factClass: D, collection: true },
  BUYER_ACCEPTANCE_EVIDENCE: { factClass: E, collection: false },
  BUYER_MATCHED: { factClass: D, collection: false },
  // — LOI (versioned) —
  LOI_DRAFTED: { factClass: A, collection: false },
  LOI_SENT: { factClass: A, collection: false },
  LOI_DELIVERED: { factClass: E, collection: false },
  LOI_ACCEPTED: { factClass: D, collection: false },
  // — Executed Contract (versioned) —
  CONTRACT_DRAFTED: { factClass: A, collection: false },
  CONTRACT_SENT: { factClass: A, collection: false },
  CONTRACT_EXECUTION_EVIDENCE: { factClass: E, collection: true },
  CONTRACT_EXECUTED: { factClass: D, collection: false },
  // — Closing ontology —
  ESCROW: { factClass: D, collection: false }, // state in `state`: OPENED/DEPOSITED/RELEASED/…
  FINANCING: { factClass: D, collection: false }, // state: COMMITTED/CLEARED/FUNDED/…
  ASSIGNMENT_EXECUTED: { factClass: D, collection: false },
  CONTINGENCY_REMOVED: { factClass: D, collection: true },
  CHECKLIST_ITEM_SATISFIED: { factClass: E, collection: true },
  SETTLEMENT_COMPLETED: { factClass: D, collection: false },
  DEED_RECORDED: { factClass: E, collection: false },
  FUNDS_DISBURSED: { factClass: E, collection: false, validate: validateFundsDisbursed },
  // — Projected-stage decision facts —
  UNDERWRITING_APPROVED: { factClass: D, collection: false }, // reuses V1.3 decision
  CLEAR_TO_CLOSE: { factClass: D, collection: false },
  TRANSACTION_CLOSED: { factClass: D, collection: false },
};

export function factTypeSpec(factType: string): FactTypeSpec | undefined {
  return FACT_ONTOLOGY[factType];
}
export function isKnownFactType(factType: string): boolean {
  return factType in FACT_ONTOLOGY;
}
