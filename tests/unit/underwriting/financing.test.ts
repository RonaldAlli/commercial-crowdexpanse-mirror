import { test } from "node:test";
import assert from "node:assert/strict";

import type { AnalysisInputs } from "../../../lib/analysis";
import { deriveFinancingCase } from "../../../lib/underwriting/financing";

// Frozen operating economics a case consumes (debt-free by construction, CF-5).
const operatingInputs: AnalysisInputs = {
  purchasePriceUsd: 1_000_000,
  renovationBudgetUsd: 50_000,
  closingCostsUsd: 25_000,
  grossIncomeAnnualUsd: 130_000,
  operatingExpensesUsd: 30_000,
  loanAmountUsd: null,
  interestRatePct: null,
  amortizationYears: null,
  unitCount: 10,
  estimatedValueUsd: 1_000_000,
};
// NOI = 100_000; all-in cost = 1_075_000.

const base = {
  operatingInputs,
  incomeGrowthPct: 0,
  expenseGrowthPct: 0,
  holdYears: 3,
  targetLtvPct: 75,
  targetLtcPct: 80,
  minDscr: null,
};

test("a levered case derives debt service, DSCR, and debt yield from the unchanged kernel", () => {
  const d = deriveFinancingCase({ ...base, loanAmountUsd: 750_000, interestRatePct: 6, amortizationYears: 30 });
  assert.ok(d.annualDebtServiceUsd != null && d.annualDebtServiceUsd > 53_000 && d.annualDebtServiceUsd < 54_500, "ADS ≈ 54k on a 750k/6%/30yr loan");
  assert.ok(d.dscr != null && d.dscr > 1.8 && d.dscr < 1.9, "DSCR ≈ 100k / 54k");
  assert.equal(d.debtYieldPct, 13.33); // 100k / 750k
});

test("a levered case sizes the loan by the binding of its own constraints", () => {
  const d = deriveFinancingCase({ ...base, loanAmountUsd: 750_000, interestRatePct: 6, amortizationYears: 30 });
  assert.equal(d.sizing.loanByLtvUsd, 750_000); // 75% × 1.0M estimated value
  assert.equal(d.sizing.loanByLtcUsd, 860_000); // 80% × 1.075M all-in cost
  assert.equal(d.sizing.sizedLoanUsd, 750_000); // min
  assert.equal(d.sizing.bindingConstraint, "LTV");
});

test("a levered case projects levered cash flow over the shared NOI trajectory", () => {
  const d = deriveFinancingCase({ ...base, loanAmountUsd: 750_000, interestRatePct: 6, amortizationYears: 30 });
  assert.equal(d.cashFlow.length, 3);
  assert.equal(d.cashFlow[0].noiUsd, 100_000);
  assert.ok(d.cashFlow[0].cashFlowBeforeTaxUsd > 45_000 && d.cashFlow[0].cashFlowBeforeTaxUsd < 47_000, "CF ≈ 100k − 54k");
  assert.equal(d.summary.projectionYears, 3);
});

test("an all-cash case has no debt service or DSCR; cash flow is the full NOI", () => {
  const d = deriveFinancingCase({ ...base, loanAmountUsd: null, interestRatePct: null, amortizationYears: null, targetLtvPct: null, targetLtcPct: null });
  assert.equal(d.annualDebtServiceUsd, null);
  assert.equal(d.dscr, null);
  assert.equal(d.debtYieldPct, null);
  assert.equal(d.sizing.sizedLoanUsd, null);
  assert.equal(d.cashFlow[0].cashFlowBeforeTaxUsd, 100_000);
  assert.equal(d.cashFlow[0].dscr, null);
  assert.equal(d.summary.avgDscr, null);
  assert.equal(d.summary.cumulativeCashFlowUsd, 300_000);
});

test("two cases over identical operating inputs differ only by their capital (CF-3 independence)", () => {
  const a = deriveFinancingCase({ ...base, loanAmountUsd: 750_000, interestRatePct: 6, amortizationYears: 30 });
  const b = deriveFinancingCase({ ...base, loanAmountUsd: 500_000, interestRatePct: 6, amortizationYears: 30 });
  assert.notEqual(a.annualDebtServiceUsd, b.annualDebtServiceUsd);
  assert.notEqual(a.dscr, b.dscr);
  // Same operating NOI feeds both (CF-5).
  assert.equal(a.cashFlow[0].noiUsd, b.cashFlow[0].noiUsd);
});
