import { test } from "node:test";
import assert from "node:assert/strict";

import { computeAtmWholesaleCalculator, type AtmWholesaleCalculatorInputs } from "../../../lib/atm-wholesale-calculator";

const base: AtmWholesaleCalculatorInputs = {
  propertyAddress: "123 Sample St",
  unitCount: 10,
  grossPotentialIncomeUsd: 100_000,
  vacancyLossUsd: 7_000,
  concessionsBadDebtLossToLeaseUsd: 4_000,
  otherIncomeUsd: 3_000,
  realEstateTaxesUsd: 16_000,
  insuranceUsd: 7_000,
  propertyManagementFeesUsd: 5_000,
  repairsMaintenanceUsd: 4_000,
  unitTurnCostsUsd: 4_000,
  utilitiesUsd: 15_000,
  trashUsd: 3_500,
  contractServicesUsd: 3_500,
  generalAdminUsd: 4_000,
  advertisingUsd: 1_800,
  payrollUsd: 18_000,
  areaCapRatePct: 8,
  sellerAskingPriceUsd: 700_000,
  downPaymentPct: 25,
  acquisitionCostsLoanFeesPct: 3,
  mortgageYears: 30,
  annualInterestRatePct: 6,
  estimatedRepairsUsd: 50_000,
  desiredWholesaleFeeUsd: 20_000,
};

test("operating section matches workbook math", () => {
  const r = computeAtmWholesaleCalculator(base);
  assert.equal(r.grossOperatingIncomeUsd, 92_000);
  assert.equal(r.replacementReserveUsd, 3_000);
  assert.equal(r.annualOperatingExpensesUsd, 84_800);
  assert.equal(r.annualOperatingExpensesPerUnitUsd, 8_480);
  assert.equal(r.annualNetOperatingIncomeUsd, 7_200);
  assert.equal(r.vacancyRatePct, 7);
  assert.equal(r.concessionsRatePct, 4);
  assert.equal(r.expenseRatioPct, 92.17);
});

test("valuation and MAO section follows workbook formulas", () => {
  const r = computeAtmWholesaleCalculator(base);
  assert.equal(r.initialPropertyValueUsd, 90_000);
  assert.equal(r.sellerCapRatePct, 1.03);
  assert.equal(r.buyHoldBuyPriceUsd, 40_000);
  assert.equal(r.maximumAllowableOfferUsd, 20_000);
});

test("debt and cash flow match workbook-parity formulas", () => {
  const r = computeAtmWholesaleCalculator(base);
  assert.equal(r.downPaymentUsd, 22_500);
  assert.equal(r.loanAmountUsd, 67_500);
  assert.equal(r.acquisitionCostsLoanFeesUsd, 2_700);
  assert.equal(r.initialInvestmentUsd, 25_200);
  assert.equal(r.estimatedMonthlyMortgagePaymentUsd, 404.7);
  assert.equal(r.annualInterestUsd, 4_027.45);
  assert.equal(r.annualPrincipalUsd, 828.95);
  assert.equal(r.annualDebtServiceUsd, 4_856.4);
  assert.equal(r.totalMonthlyCashFlowBeforeTaxesUsd, 6_795.3);
  assert.equal(r.totalAnnualCashFlowBeforeTaxesUsd, 2_343.6);
  assert.equal(r.cashOnCashReturnPct, 9.3);
});
