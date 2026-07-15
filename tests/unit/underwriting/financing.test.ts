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
  exitCapRatePct: null,
  sellingCostsPct: null,
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

// --- Exit valuation + equity returns (3b-iv) --------------------------------
const round2 = (n: number) => Math.round(n * 100) / 100;

test("no exit is modeled without an exit cap rate", () => {
  const d = deriveFinancingCase({ ...base, loanAmountUsd: 750_000, interestRatePct: 6, amortizationYears: 30 });
  assert.equal(d.exit, null);
});

test("a financed exit computes terminal value, amortized debt payoff, and equity returns", () => {
  const d = deriveFinancingCase({ ...base, exitCapRatePct: 8, sellingCostsPct: 2, loanAmountUsd: 750_000, interestRatePct: 6, amortizationYears: 30 });
  assert.ok(d.exit);
  assert.equal(d.exit.terminalNoiUsd, 100_000); // exit-year NOI (0 growth)
  assert.equal(d.exit.grossExitValueUsd, 1_250_000); // 100k / 8%
  assert.equal(d.exit.sellingCostsUsd, 25_000); // 2% of 1.25M
  assert.ok(d.exit.debtPayoffUsd > 700_000 && d.exit.debtPayoffUsd < 740_000, "≈722k remaining after 3 of 30 years");
  assert.equal(d.exit.contributedEquityUsd, 325_000); // 1.075M all-in − 750k loan
  assert.equal(d.exit.netSaleProceedsUsd, round2(1_250_000 - 25_000 - d.exit.debtPayoffUsd));
  assert.equal(d.exit.equityCashFlow.length, 4); // year 0..3
  assert.equal(d.exit.equityCashFlow[0], -325_000);
  assert.ok(d.exit.equityMultiple != null && d.exit.equityMultiple > 1, "profitable levered deal");
  assert.ok(d.exit.leveredIrrPct != null && d.exit.leveredIrrPct > 0, "positive levered IRR");
});

test("EX-5: the final-year equity cash flow combines operating CF + sale ONCE, not double-counted", () => {
  const d = deriveFinancingCase({ ...base, exitCapRatePct: 8, sellingCostsPct: 2, loanAmountUsd: 750_000, interestRatePct: 6, amortizationYears: 30 });
  assert.ok(d.exit);
  const cf3 = d.cashFlow[2].cashFlowBeforeTaxUsd;
  assert.equal(d.exit.equityCashFlow[3], round2(cf3 + d.exit.netSaleProceedsUsd)); // final = operating CF + sale
  assert.equal(d.exit.equityCashFlow[1], d.cashFlow[0].cashFlowBeforeTaxUsd); // year 1 = plain operating CF
  assert.equal(d.exit.equityCashFlow[2], d.cashFlow[1].cashFlowBeforeTaxUsd); // year 2 = plain operating CF
});

test("an all-cash exit has zero debt payoff and equity = all-in cost", () => {
  const d = deriveFinancingCase({ ...base, exitCapRatePct: 8, sellingCostsPct: 2, loanAmountUsd: null, interestRatePct: null, amortizationYears: null, targetLtvPct: null, targetLtcPct: null });
  assert.ok(d.exit);
  assert.equal(d.exit.debtPayoffUsd, 0);
  assert.equal(d.exit.contributedEquityUsd, 1_075_000);
  assert.equal(d.exit.netSaleProceedsUsd, 1_225_000); // 1.25M − 25k − 0
});

test("zero selling costs → net sale proceeds = gross − debt payoff", () => {
  const d = deriveFinancingCase({ ...base, exitCapRatePct: 8, sellingCostsPct: 0, loanAmountUsd: null, interestRatePct: null, amortizationYears: null, targetLtvPct: null, targetLtcPct: null });
  assert.ok(d.exit);
  assert.equal(d.exit.sellingCostsUsd, 0);
  assert.equal(d.exit.netSaleProceedsUsd, 1_250_000);
});

test("a loss yields an equity multiple < 1 and a negative IRR (negative-return case)", () => {
  const lowNoi = { ...operatingInputs, grossIncomeAnnualUsd: 20_000, operatingExpensesUsd: 10_000 }; // NOI 10k
  const d = deriveFinancingCase({ ...base, operatingInputs: lowNoi, exitCapRatePct: 8, sellingCostsPct: 2, loanAmountUsd: null, interestRatePct: null, amortizationYears: null, targetLtvPct: null, targetLtcPct: null });
  assert.ok(d.exit);
  assert.ok(d.exit.equityMultiple != null && d.exit.equityMultiple < 1, "multiple below 1 (loss)");
  assert.ok(d.exit.leveredIrrPct != null && d.exit.leveredIrrPct < 0, "negative IRR");
  assert.ok(d.exit.totalProfitUsd < 0, "negative total profit");
});
