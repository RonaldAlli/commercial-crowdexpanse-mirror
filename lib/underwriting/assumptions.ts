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

export type AssumptionKey = (typeof ASSUMPTION_KEYS)[number] | (typeof SIZING_ASSUMPTION_KEYS)[number];

/** The keys sourced from the analyst's form (MANUAL). */
export const MANUAL_ASSUMPTION_KEYS: AssumptionKey[] = [
  "PURCHASE_PRICE",
  "RENOVATION_BUDGET",
  "CLOSING_COSTS",
  "GROSS_INCOME",
  "OPERATING_EXPENSES",
  "LOAN_AMOUNT",
  "INTEREST_RATE",
  "AMORTIZATION_YEARS",
];

/** The keys snapshotted from the Version 1.2 platform at scenario creation (SEEDED / ScenarioSeed). */
export const SEEDED_ASSUMPTION_KEYS: AssumptionKey[] = ["UNIT_COUNT", "ESTIMATED_VALUE"];

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
