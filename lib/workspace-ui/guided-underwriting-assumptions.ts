// CRE Operating Workspace — UI Milestone 2, Increment 2: Missing Assumption Synthesis + Provenance.
//
// PURE PRESENTATION LOGIC ONLY — deterministic, no data access, no clock/random, no underwriting
// calculation. It answers the operator's second question — "What information is preventing this deal from
// being fully underwritten?" — by classifying the EXISTING assumption set into the accepted four-state
// missing-information model, using the EXISTING authority's own expected key-sets and provenance fields.
//
// GROUNDING (no invention):
//   • Expected keys + operational groups come from lib/underwriting/assumptions.ts (ASSUMPTION_KEYS,
//     PROJECTION_ASSUMPTION_KEYS, CAPITAL_ASSUMPTION_KEYS, isCapitalKey) — the engine's own taxonomy.
//   • Provenance (source / sourceField / sourceAsOf) is read verbatim from the persisted assumption rows
//     (UnderwritingAssumption on the scenario; FinancingAssumption on the primary financing case). When a
//     value's provenance is incomplete it is stated honestly — provenance is NEVER inferred.
//   • PURCHASE_PRICE is the engine's only hard precondition (assumptionsToAnalysisInputs / validateAssumptions),
//     so a MISSING PURCHASE_PRICE is the one blocking gap; all other keys degrade (map to null) not block.
// BOUNDARIES: no recommendation synthesis, no recommendation-level change, no calculation, no writes, no
// invented categories / tasks / appointments. Existing findings are NOT reinterpreted here.

import { ASSUMPTION_KEYS, PROJECTION_ASSUMPTION_KEYS, CAPITAL_ASSUMPTION_KEYS, isCapitalKey } from "@/lib/underwriting/assumptions";
import type { MissingInfoState } from "@/lib/workspace-ui/missing-info";

// Display labels — mirror the existing analyzer key→label map (app/(workspace)/analyzer/[opportunityId]/page.tsx).
const LABELS: Record<string, string> = {
  PURCHASE_PRICE: "Purchase price",
  RENOVATION_BUDGET: "Renovation budget",
  CLOSING_COSTS: "Closing costs",
  GROSS_INCOME: "Gross income",
  OPERATING_EXPENSES: "Operating expenses",
  UNIT_COUNT: "Unit count",
  ESTIMATED_VALUE: "Estimated value",
  INCOME_GROWTH_PCT: "Income growth %",
  EXPENSE_GROWTH_PCT: "Expense growth %",
  HOLD_YEARS: "Hold years",
  EXIT_CAP_RATE_PCT: "Exit cap rate %",
  SELLING_COSTS_PCT: "Selling costs %",
  LOAN_AMOUNT: "Loan amount",
  INTEREST_RATE: "Interest rate",
  AMORTIZATION_YEARS: "Amortization (years)",
  TARGET_LTV_PCT: "Target LTV %",
  TARGET_LTC_PCT: "Target LTC %",
  MIN_DSCR: "Minimum DSCR",
};

// Why a gap blocks/degrades completion — a factual description of the EXISTING kernel data flow
// (assumptionsToAnalysisInputs + the deterministic kernel). Presentation of existing structure, not new logic.
const AFFECTS: Record<string, string> = {
  PURCHASE_PRICE: "Required to derive any underwriting result.",
  RENOVATION_BUDGET: "Feeds all-in cost / basis.",
  CLOSING_COSTS: "Feeds all-in cost / basis.",
  GROSS_INCOME: "Feeds Net Operating Income.",
  OPERATING_EXPENSES: "Feeds Net Operating Income.",
  UNIT_COUNT: "Feeds price-per-unit.",
  ESTIMATED_VALUE: "Feeds value-based metrics.",
  INCOME_GROWTH_PCT: "Feeds the multi-year cash-flow projection.",
  EXPENSE_GROWTH_PCT: "Feeds the multi-year cash-flow projection.",
  HOLD_YEARS: "Feeds the projection horizon and exit year.",
  EXIT_CAP_RATE_PCT: "Feeds the exit valuation.",
  SELLING_COSTS_PCT: "Feeds the exit valuation.",
  LOAN_AMOUNT: "Feeds debt service and DSCR.",
  INTEREST_RATE: "Feeds debt service and DSCR.",
  AMORTIZATION_YEARS: "Feeds debt service and DSCR.",
  TARGET_LTV_PCT: "Feeds debt sizing.",
  TARGET_LTC_PCT: "Feeds debt sizing.",
  MIN_DSCR: "Feeds debt sizing.",
};

export type ProvenanceInput = {
  source: string | null; // MANUAL | SEEDED | null
  sourceField: string | null;
  sourceAsOf: string | null; // ISO string or null
};

export type AssumptionRowInput = { key: string; provenance: ProvenanceInput };

export type GuidedAssumptionsInput = {
  hasScenario: boolean;
  hasFinancingCase: boolean;
  /** Persisted operating assumptions on the scenario (UnderwritingAssumption). */
  scenarioAssumptions: AssumptionRowInput[];
  /** Persisted capital assumptions on the primary financing case (FinancingAssumption). */
  capitalAssumptions: AssumptionRowInput[];
};

/** "complete" = present with full provenance; otherwise one of the four missing-information states. */
export type AssumptionStatus = "complete" | MissingInfoState;

export type ProvenanceView = { source: string; sourceField: string | null; sourceAsOf: string | null } | null;

export type AssumptionItemView = {
  key: string;
  label: string;
  status: AssumptionStatus;
  provenance: ProvenanceView; // null when the value is absent — never fabricated
  affects: string | null; // why it matters; shown for gaps only
  blocking: boolean; // true only for a MISSING PURCHASE_PRICE (the engine's sole hard precondition)
};

export type AssumptionGroupView = { title: string; items: AssumptionItemView[] };

export type GuidedAssumptionsView =
  | { state: "no-underwriting" }
  | {
      state: "present";
      groups: AssumptionGroupView[];
      summary: { missing: number; incomplete: number; unavailable: number; blockingMissingKey: string | null };
    };

const CORE_OPERATING_KEYS = ASSUMPTION_KEYS.filter((k) => !isCapitalKey(k));
const GROUPS: { title: string; keys: readonly string[]; capital: boolean }[] = [
  { title: "Core underwriting inputs", keys: CORE_OPERATING_KEYS, capital: false },
  { title: "Projection", keys: PROJECTION_ASSUMPTION_KEYS, capital: false },
  { title: "Debt & capital", keys: CAPITAL_ASSUMPTION_KEYS, capital: true },
];

const labelOf = (key: string) => LABELS[key] ?? key;

function classify(
  key: string,
  row: AssumptionRowInput | undefined,
  groupStructurallyAbsent: boolean,
): AssumptionItemView {
  if (!row) {
    // No persisted value. If the whole group is structurally absent (e.g. no financing case), the system
    // cannot evaluate it -> unavailable; otherwise it is an expected-but-absent value -> missing.
    const status: AssumptionStatus = groupStructurallyAbsent ? "unavailable" : "missing";
    return {
      key,
      label: labelOf(key),
      status,
      provenance: null,
      affects: AFFECTS[key] ?? null,
      blocking: status === "missing" && key === "PURCHASE_PRICE",
    };
  }
  const p = row.provenance;
  const provComplete = !!p.source && !!p.sourceField && !!p.sourceAsOf;
  const status: AssumptionStatus = provComplete ? "complete" : "incomplete";
  return {
    key,
    label: labelOf(key),
    status,
    provenance: { source: p.source ?? "Unknown", sourceField: p.sourceField, sourceAsOf: p.sourceAsOf },
    // Provenance is present-but-partial for "incomplete"; surface the reason it matters, honestly.
    affects: status === "incomplete" ? (AFFECTS[key] ?? null) : null,
    blocking: false,
  };
}

/** Deterministic, read-only classification of the existing assumption set into the four-state model. */
export function buildGuidedAssumptionsView(input: GuidedAssumptionsInput): GuidedAssumptionsView {
  if (!input.hasScenario) return { state: "no-underwriting" };

  const scenarioByKey = new Map(input.scenarioAssumptions.map((r) => [r.key, r]));
  const capitalByKey = new Map(input.capitalAssumptions.map((r) => [r.key, r]));

  const groups: AssumptionGroupView[] = GROUPS.map((g) => {
    const byKey = g.capital ? capitalByKey : scenarioByKey;
    const structurallyAbsent = g.capital && !input.hasFinancingCase;
    return { title: g.title, items: g.keys.map((k) => classify(k, byKey.get(k), structurallyAbsent)) };
  });

  const all = groups.flatMap((g) => g.items);
  const summary = {
    missing: all.filter((i) => i.status === "missing").length,
    incomplete: all.filter((i) => i.status === "incomplete").length,
    unavailable: all.filter((i) => i.status === "unavailable").length,
    blockingMissingKey: all.find((i) => i.blocking)?.key ?? null,
  };

  return { state: "present", groups, summary };
}
