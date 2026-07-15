// Commercial Underwriting (v1.3, Commit 3a) — the typed assumption set and the
// TOTAL, pure mapping from assumptions → the existing AnalysisInputs. No Prisma,
// no framework: the numeric values arrive already converted to JS numbers at the
// service boundary (Decimal → number), so this module stays a pure, unit-testable
// function of primitives (D-6). lib/analysis.ts is imported for its TYPE only and
// is never modified by this work.
import type { AnalysisInputs } from "@/lib/analysis";

// The canonical assumption keys. Mirrors the Prisma `AssumptionKey` enum exactly
// (same string values), kept as an independent `as const` list so this module
// carries no runtime dependency on the generated client. Together these 10 keys
// TOTALLY determine an AnalysisInputs.
export const ASSUMPTION_KEYS = [
  "PURCHASE_PRICE",
  "RENOVATION_BUDGET",
  "CLOSING_COSTS",
  "GROSS_INCOME",
  "OPERATING_EXPENSES",
  "LOAN_AMOUNT",
  "INTEREST_RATE",
  "AMORTIZATION_YEARS",
  "UNIT_COUNT",
  "ESTIMATED_VALUE",
] as const;

// Debt-sizing constraints (v1.3, Commit 3b-i). Valid assumptions, but NOT kernel
// inputs — they are consumed only by the pure debt-sizing calculation, so they are
// deliberately kept out of ASSUMPTION_KEYS (which totally determines AnalysisInputs).
export const SIZING_ASSUMPTION_KEYS = ["TARGET_LTV_PCT", "TARGET_LTC_PCT", "MIN_DSCR"] as const;

// Projection assumptions (v1.3, Commit 3b-iii). OPERATING, financing-independent
// (CF-5): they shape the shared multi-year NOI trajectory, never the debt. Not
// kernel inputs — consumed only by the pure cash-flow projection.
export const PROJECTION_ASSUMPTION_KEYS = [
  "INCOME_GROWTH_PCT",
  "EXPENSE_GROWTH_PCT",
  "HOLD_YEARS",
  // Exit assumptions (v1.3, Commit 3b-iv) — operating, financing-independent.
  "EXIT_CAP_RATE_PCT",
  "SELLING_COSTS_PCT",
] as const;

export type AssumptionKey =
  | (typeof ASSUMPTION_KEYS)[number]
  | (typeof SIZING_ASSUMPTION_KEYS)[number]
  | (typeof PROJECTION_ASSUMPTION_KEYS)[number];

// --- Ownership of assumptions (v1.3, Commit 3b-iii — CF-1) --------------------
// CAPITAL assumptions are owned by a FinancingCase, not the Scenario: the loan
// terms AND the debt-sizing constraints. Everything else is OPERATING (Scenario).
export const CAPITAL_ASSUMPTION_KEYS: AssumptionKey[] = [
  "LOAN_AMOUNT",
  "INTEREST_RATE",
  "AMORTIZATION_YEARS",
  "TARGET_LTV_PCT",
  "TARGET_LTC_PCT",
  "MIN_DSCR",
];

/** The OPERATING keys sourced from the analyst's form (MANUAL) — capital moved to the FinancingCase. */
export const MANUAL_ASSUMPTION_KEYS: AssumptionKey[] = [
  "PURCHASE_PRICE",
  "RENOVATION_BUDGET",
  "CLOSING_COSTS",
  "GROSS_INCOME",
  "OPERATING_EXPENSES",
  "INCOME_GROWTH_PCT",
  "EXPENSE_GROWTH_PCT",
  "HOLD_YEARS",
  "EXIT_CAP_RATE_PCT",
  "SELLING_COSTS_PCT",
];

/** The keys snapshotted from the Version 1.2 platform at scenario creation (SEEDED / ScenarioSeed). */
export const SEEDED_ASSUMPTION_KEYS: AssumptionKey[] = ["UNIT_COUNT", "ESTIMATED_VALUE"];

// --- Sensitivity axis allow-list (v1.3, Commit 3b-v — D-C) --------------------
// The FIXED set of numeric assumptions that may be a sensitivity axis. Deliberately
// a closed allow-list (no free-form formulas): every axis is a single assumption
// key whose value the sensitivity layer perturbs IN MEMORY (never persisted — SE-1).
// Includes the operating manual keys, the seeded numeric snapshot values (varying a
// snapshot in a what-if is valid — it never writes back), and the capital keys. A
// key is routed to the operating set or the case's capital set by membership in
// CAPITAL_ASSUMPTION_KEYS.
export const SENSITIVITY_AXIS_KEYS: AssumptionKey[] = [
  "PURCHASE_PRICE",
  "RENOVATION_BUDGET",
  "CLOSING_COSTS",
  "GROSS_INCOME",
  "OPERATING_EXPENSES",
  "INCOME_GROWTH_PCT",
  "EXPENSE_GROWTH_PCT",
  "HOLD_YEARS",
  "EXIT_CAP_RATE_PCT",
  "SELLING_COSTS_PCT",
  "ESTIMATED_VALUE",
  "LOAN_AMOUNT",
  "INTEREST_RATE",
  "AMORTIZATION_YEARS",
  "TARGET_LTV_PCT",
  "TARGET_LTC_PCT",
  "MIN_DSCR",
];

/** True iff `key` is a capital assumption (owned by a FinancingCase, not the Scenario). */
export function isCapitalKey(key: AssumptionKey): boolean {
  return CAPITAL_ASSUMPTION_KEYS.includes(key);
}

/** One resolved assumption at the calculation boundary. */
export type ResolvedAssumption = {
  key: AssumptionKey;
  value: number; // Decimal already converted to a JS number by the service
  source: string; // MANUAL | SEEDED
  canonical: string; // canonical decimal string, for the deterministic fingerprint
};

/**
 * TOTAL, pure mapping from the assumption set → AnalysisInputs. Missing optional
 * keys map to null exactly as the legacy analyzer treated absent form fields, so
 * the existing kernel produces byte-identical metrics. PURCHASE_PRICE is required
 * (the kernel's only hard precondition).
 */
export function assumptionsToAnalysisInputs(rows: Pick<ResolvedAssumption, "key" | "value">[]): AnalysisInputs {
  const m = new Map<AssumptionKey, number>();
  for (const r of rows) m.set(r.key, r.value);
  const get = (k: AssumptionKey): number | null => (m.has(k) ? (m.get(k) as number) : null);

  const purchasePriceUsd = get("PURCHASE_PRICE");
  if (purchasePriceUsd == null) {
    throw new Error("PURCHASE_PRICE assumption is required to derive AnalysisInputs");
  }

  return {
    purchasePriceUsd,
    renovationBudgetUsd: get("RENOVATION_BUDGET"),
    closingCostsUsd: get("CLOSING_COSTS"),
    grossIncomeAnnualUsd: get("GROSS_INCOME"),
    operatingExpensesUsd: get("OPERATING_EXPENSES"),
    loanAmountUsd: get("LOAN_AMOUNT"),
    interestRatePct: get("INTEREST_RATE"),
    amortizationYears: get("AMORTIZATION_YEARS"),
    unitCount: get("UNIT_COUNT"),
    estimatedValueUsd: get("ESTIMATED_VALUE"),
  };
}

/**
 * Validate the assumption set. Returns a human-readable message when invalid, or
 * null when it is safe to derive a result. Mirrors the legacy analyzer's single
 * hard rule (purchase price present and > 0).
 */
export function validateAssumptions(rows: Pick<ResolvedAssumption, "key" | "value">[]): string | null {
  const price = rows.find((r) => r.key === "PURCHASE_PRICE");
  if (!price || !(price.value > 0)) {
    return "Purchase price is required and must be greater than zero.";
  }
  return null;
}

/** Read a single assumption's numeric value by key (null when absent). */
export function assumptionValue(rows: Pick<ResolvedAssumption, "key" | "value">[], key: AssumptionKey): number | null {
  const row = rows.find((r) => r.key === key);
  return row ? row.value : null;
}
