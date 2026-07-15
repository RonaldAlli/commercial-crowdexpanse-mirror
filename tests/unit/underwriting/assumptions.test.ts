import { test } from "node:test";
import assert from "node:assert/strict";

import { computeAnalysis } from "../../../lib/analysis";
import {
  ASSUMPTION_KEYS,
  MANUAL_ASSUMPTION_KEYS,
  SEEDED_ASSUMPTION_KEYS,
  assumptionsToAnalysisInputs,
  validateAssumptions,
  type ResolvedAssumption,
} from "../../../lib/underwriting/assumptions";

const num = (key: string, value: number, source = "MANUAL"): Pick<ResolvedAssumption, "key" | "value"> =>
  ({ key, value } as Pick<ResolvedAssumption, "key" | "value">);

// A full assumption set that mirrors the analysis unit-test base deal.
const full: Pick<ResolvedAssumption, "key" | "value">[] = [
  num("PURCHASE_PRICE", 1_000_000),
  num("RENOVATION_BUDGET", 50_000),
  num("CLOSING_COSTS", 25_000),
  num("GROSS_INCOME", 120_000),
  num("OPERATING_EXPENSES", 40_000),
  num("LOAN_AMOUNT", 750_000),
  num("INTEREST_RATE", 6),
  num("AMORTIZATION_YEARS", 30),
  num("UNIT_COUNT", 10),
  num("ESTIMATED_VALUE", 1_200_000),
];

test("the 10 keys totally cover AnalysisInputs; manual ∪ seeded = all, disjoint", () => {
  assert.equal(ASSUMPTION_KEYS.length, 10);
  assert.deepEqual(
    [...MANUAL_ASSUMPTION_KEYS, ...SEEDED_ASSUMPTION_KEYS].sort(),
    [...ASSUMPTION_KEYS].sort(),
  );
  const overlap = MANUAL_ASSUMPTION_KEYS.filter((k) => SEEDED_ASSUMPTION_KEYS.includes(k));
  assert.equal(overlap.length, 0);
});

test("a full assumption set maps to the exact AnalysisInputs the kernel expects", () => {
  const inputs = assumptionsToAnalysisInputs(full);
  assert.deepEqual(inputs, {
    purchasePriceUsd: 1_000_000,
    renovationBudgetUsd: 50_000,
    closingCostsUsd: 25_000,
    grossIncomeAnnualUsd: 120_000,
    operatingExpensesUsd: 40_000,
    loanAmountUsd: 750_000,
    interestRatePct: 6,
    amortizationYears: 30,
    unitCount: 10,
    estimatedValueUsd: 1_200_000,
  });
});

test("absent optional keys map to null (mirrors legacy absent form fields)", () => {
  const minimal = [num("PURCHASE_PRICE", 500_000)];
  const inputs = assumptionsToAnalysisInputs(minimal);
  assert.equal(inputs.purchasePriceUsd, 500_000);
  assert.equal(inputs.renovationBudgetUsd, null);
  assert.equal(inputs.loanAmountUsd, null);
  assert.equal(inputs.unitCount, null);
  assert.equal(inputs.estimatedValueUsd, null);
});

test("mapping composes with the kernel to reproduce known metrics", () => {
  const m = computeAnalysis(assumptionsToAnalysisInputs(full));
  assert.equal(m.allInCostUsd, 1_075_000);
  assert.equal(m.noiAnnualUsd, 80_000);
  assert.equal(m.capRate, 8);
});

test("missing PURCHASE_PRICE throws (the kernel's only hard precondition)", () => {
  assert.throws(() => assumptionsToAnalysisInputs([num("LOAN_AMOUNT", 100)]), /PURCHASE_PRICE/);
});

test("validateAssumptions requires a positive purchase price", () => {
  assert.equal(validateAssumptions(full), null);
  assert.match(validateAssumptions([]) ?? "", /Purchase price/);
  assert.match(validateAssumptions([num("PURCHASE_PRICE", 0)]) ?? "", /greater than zero/);
  assert.match(validateAssumptions([num("PURCHASE_PRICE", -5)]) ?? "", /greater than zero/);
});
