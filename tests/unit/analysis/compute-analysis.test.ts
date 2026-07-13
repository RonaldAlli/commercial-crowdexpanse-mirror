import { test } from "node:test";
import assert from "node:assert/strict";

import { computeAnalysis, type AnalysisInputs } from "../../../lib/analysis";

// A fully-specified, sensible base deal; individual tests override single fields.
const base: AnalysisInputs = {
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
};

test("all-in cost sums price + renovation + closing", () => {
  assert.equal(computeAnalysis(base).allInCostUsd, 1_075_000);
});

test("null renovation/closing are treated as 0", () => {
  const m = computeAnalysis({ ...base, renovationBudgetUsd: null, closingCostsUsd: null });
  assert.equal(m.allInCostUsd, 1_000_000);
});

test("NOI = gross income − operating expenses", () => {
  assert.equal(computeAnalysis(base).noiAnnualUsd, 80_000);
});

test("NOI is null when gross income is null; opex null counts as 0", () => {
  assert.equal(computeAnalysis({ ...base, grossIncomeAnnualUsd: null }).noiAnnualUsd, null);
  assert.equal(computeAnalysis({ ...base, operatingExpensesUsd: null }).noiAnnualUsd, 120_000);
});

test("cap rate = NOI / price %, rounded to 2dp", () => {
  assert.equal(computeAnalysis(base).capRate, 8);
});

test("cap rate is null when price is 0 or NOI is null", () => {
  assert.equal(computeAnalysis({ ...base, purchasePriceUsd: 0 }).capRate, null);
  assert.equal(computeAnalysis({ ...base, grossIncomeAnnualUsd: null }).capRate, null);
});

test("price per unit is null unless unitCount > 0", () => {
  assert.equal(computeAnalysis(base).pricePerUnitUsd, 100_000);
  assert.equal(computeAnalysis({ ...base, unitCount: 0 }).pricePerUnitUsd, null);
  assert.equal(computeAnalysis({ ...base, unitCount: null }).pricePerUnitUsd, null);
});

test("expense ratio needs gross income > 0 and opex present", () => {
  assert.equal(computeAnalysis(base).expenseRatioPct, 33.33);
  assert.equal(computeAnalysis({ ...base, operatingExpensesUsd: null }).expenseRatioPct, null);
  assert.equal(computeAnalysis({ ...base, grossIncomeAnnualUsd: 0 }).expenseRatioPct, null);
});

test("annual debt service uses the amortizing payment formula", () => {
  // 750k @ 6% / 30y = $53,959.55/yr.
  assert.equal(computeAnalysis(base).annualDebtServiceUsd, 53_959.55);
});

test("zero interest falls back to straight-line principal / years", () => {
  const m = computeAnalysis({ ...base, interestRatePct: 0 });
  assert.equal(m.annualDebtServiceUsd, 25_000); // 750k / 30
});

test("null interest is treated as 0% (straight-line)", () => {
  assert.equal(computeAnalysis({ ...base, interestRatePct: null }).annualDebtServiceUsd, 25_000);
});

test("debt service is null without a loan or amortization term", () => {
  assert.equal(computeAnalysis({ ...base, loanAmountUsd: null }).annualDebtServiceUsd, null);
  assert.equal(computeAnalysis({ ...base, loanAmountUsd: 0 }).annualDebtServiceUsd, null);
  assert.equal(computeAnalysis({ ...base, amortizationYears: null }).annualDebtServiceUsd, null);
  assert.equal(computeAnalysis({ ...base, amortizationYears: 0 }).annualDebtServiceUsd, null);
});

test("DSCR = NOI / debt service, null when debt service is 0/absent", () => {
  const m = computeAnalysis({ ...base, interestRatePct: 0 }); // ds = 25k
  assert.equal(m.dscr, 3.2); // 80k / 25k
  assert.equal(computeAnalysis({ ...base, loanAmountUsd: null }).dscr, null);
  assert.equal(computeAnalysis({ ...base, grossIncomeAnnualUsd: null }).dscr, null);
});

test("debt yield = NOI / loan %, null without a loan or NOI", () => {
  assert.equal(computeAnalysis(base).debtYieldPct, 10.67); // 80k / 750k
  assert.equal(computeAnalysis({ ...base, loanAmountUsd: null }).debtYieldPct, null);
  assert.equal(computeAnalysis({ ...base, grossIncomeAnnualUsd: null }).debtYieldPct, null);
});

test("spread = estimated value − all-in cost, null when no estimate", () => {
  assert.equal(computeAnalysis(base).spreadUsd, 125_000); // 1.2M − 1.075M
  assert.equal(computeAnalysis({ ...base, estimatedValueUsd: null }).spreadUsd, null);
});
