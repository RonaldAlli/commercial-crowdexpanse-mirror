// ATM Wholesale Calculator parity layer. These formulas mirror the workbook
// `ATM---Wholesale-Calculator-FINAL-v8.xlsx` so the app can reproduce the same
// operating, valuation, debt, cash-flow, and MAO outputs without Excel.

export type AtmWholesaleCalculatorInputs = {
  propertyAddress?: string | null;
  unitCount: number;
  grossPotentialIncomeUsd: number;
  vacancyLossUsd: number;
  concessionsBadDebtLossToLeaseUsd: number;
  otherIncomeUsd: number;
  realEstateTaxesUsd: number;
  insuranceUsd: number;
  propertyManagementFeesUsd: number;
  repairsMaintenanceUsd: number;
  unitTurnCostsUsd: number;
  utilitiesUsd: number;
  trashUsd: number;
  contractServicesUsd: number;
  generalAdminUsd: number;
  advertisingUsd: number;
  payrollUsd: number;
  areaCapRatePct: number;
  sellerAskingPriceUsd: number;
  downPaymentPct: number;
  acquisitionCostsLoanFeesPct: number;
  mortgageYears: number;
  annualInterestRatePct: number;
  estimatedRepairsUsd: number;
  desiredWholesaleFeeUsd: number;
};

export type AtmWholesaleCalculatorOutputs = {
  vacancyRatePct: number;
  concessionsRatePct: number;
  replacementReserveUsd: number;
  grossOperatingIncomeUsd: number;
  annualOperatingExpensesUsd: number;
  annualOperatingExpensesPerUnitUsd: number;
  annualNetOperatingIncomeUsd: number;
  expenseRatioPct: number;
  initialPropertyValueUsd: number | null;
  sellerCapRatePct: number | null;
  downPaymentUsd: number;
  loanAmountUsd: number;
  acquisitionCostsLoanFeesUsd: number;
  initialInvestmentUsd: number;
  estimatedMonthlyMortgagePaymentUsd: number;
  annualInterestUsd: number;
  annualPrincipalUsd: number;
  annualDebtServiceUsd: number;
  totalMonthlyCashFlowBeforeTaxesUsd: number;
  totalAnnualCashFlowBeforeTaxesUsd: number;
  cashOnCashReturnPct: number | null;
  buyHoldBuyPriceUsd: number;
  maximumAllowableOfferUsd: number;
};

export const ATM_RULE_OF_THUMB = {
  vacancyRatePct: 7,
  concessionsRatePct: 4,
  expensesPerUnitUsd: {
    realEstateTaxesUsd: 1600,
    insuranceUsd: 700,
    propertyManagementFeesUsd: 500,
    repairsMaintenanceUsd: 400,
    unitTurnCostsUsd: 400,
    utilitiesUsd: 1500,
    trashUsd: 350,
    contractServicesUsd: 350,
    generalAdminUsd: 400,
    advertisingUsd: 180,
    payrollUsd: 1800,
    replacementReserveUsd: 300,
  },
  expenseRatioPct: 50,
  areaCapRatePct: 6,
  downPaymentPctRange: "20-30%",
  acquisitionCostsLoanFeesPctRange: "2-4%",
  mortgageYears: 30,
  annualInterestRatePct: 6,
} as const;

function round(value: number, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function toRatio(pct: number) {
  return pct / 100;
}

function cleanAmount(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function monthlyPayment(loanAmountUsd: number, annualInterestRatePct: number, mortgageYears: number) {
  if (loanAmountUsd <= 0 || mortgageYears <= 0) {
    return 0;
  }
  const monthlyRate = toRatio(annualInterestRatePct) / 12;
  const periods = mortgageYears * 12;
  if (monthlyRate === 0) {
    return round(loanAmountUsd / periods);
  }
  const payment = (loanAmountUsd * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -periods));
  return round(payment);
}

function firstYearDebtBreakdown(loanAmountUsd: number, annualInterestRatePct: number, mortgageYears: number) {
  const payment = monthlyPayment(loanAmountUsd, annualInterestRatePct, mortgageYears);
  if (loanAmountUsd <= 0 || mortgageYears <= 0 || payment <= 0) {
    return { estimatedMonthlyMortgagePaymentUsd: 0, annualInterestUsd: 0, annualPrincipalUsd: 0, annualDebtServiceUsd: 0 };
  }

  const monthlyRate = toRatio(annualInterestRatePct) / 12;
  if (monthlyRate === 0) {
    const annualPrincipalUsd = round(payment * 12);
    return {
      estimatedMonthlyMortgagePaymentUsd: payment,
      annualInterestUsd: 0,
      annualPrincipalUsd,
      annualDebtServiceUsd: annualPrincipalUsd,
    };
  }

  let balance = loanAmountUsd;
  let annualInterestUsd = 0;
  let annualPrincipalUsd = 0;
  for (let month = 0; month < 12; month += 1) {
    const interest = balance * monthlyRate;
    const principal = Math.min(payment - interest, balance);
    annualInterestUsd += interest;
    annualPrincipalUsd += principal;
    balance -= principal;
  }

  return {
    estimatedMonthlyMortgagePaymentUsd: payment,
    annualInterestUsd: round(annualInterestUsd),
    annualPrincipalUsd: round(annualPrincipalUsd),
    annualDebtServiceUsd: round(payment * 12),
  };
}

// The workbook's "monthly" cash-flow cell mixes annual GOI/OPEX with the monthly PI payment.
// We preserve that formula exactly for parity with the existing spreadsheet.
export function computeAtmWholesaleCalculator(raw: AtmWholesaleCalculatorInputs): AtmWholesaleCalculatorOutputs {
  const i = {
    ...raw,
    unitCount: cleanAmount(raw.unitCount),
    grossPotentialIncomeUsd: cleanAmount(raw.grossPotentialIncomeUsd),
    vacancyLossUsd: cleanAmount(raw.vacancyLossUsd),
    concessionsBadDebtLossToLeaseUsd: cleanAmount(raw.concessionsBadDebtLossToLeaseUsd),
    otherIncomeUsd: cleanAmount(raw.otherIncomeUsd),
    realEstateTaxesUsd: cleanAmount(raw.realEstateTaxesUsd),
    insuranceUsd: cleanAmount(raw.insuranceUsd),
    propertyManagementFeesUsd: cleanAmount(raw.propertyManagementFeesUsd),
    repairsMaintenanceUsd: cleanAmount(raw.repairsMaintenanceUsd),
    unitTurnCostsUsd: cleanAmount(raw.unitTurnCostsUsd),
    utilitiesUsd: cleanAmount(raw.utilitiesUsd),
    trashUsd: cleanAmount(raw.trashUsd),
    contractServicesUsd: cleanAmount(raw.contractServicesUsd),
    generalAdminUsd: cleanAmount(raw.generalAdminUsd),
    advertisingUsd: cleanAmount(raw.advertisingUsd),
    payrollUsd: cleanAmount(raw.payrollUsd),
    areaCapRatePct: cleanAmount(raw.areaCapRatePct),
    sellerAskingPriceUsd: cleanAmount(raw.sellerAskingPriceUsd),
    downPaymentPct: cleanAmount(raw.downPaymentPct),
    acquisitionCostsLoanFeesPct: cleanAmount(raw.acquisitionCostsLoanFeesPct),
    mortgageYears: cleanAmount(raw.mortgageYears),
    annualInterestRatePct: cleanAmount(raw.annualInterestRatePct),
    estimatedRepairsUsd: cleanAmount(raw.estimatedRepairsUsd),
    desiredWholesaleFeeUsd: cleanAmount(raw.desiredWholesaleFeeUsd),
  };

  const vacancyRatePct = i.grossPotentialIncomeUsd > 0 ? round((i.vacancyLossUsd / i.grossPotentialIncomeUsd) * 100) : 0;
  const concessionsRatePct =
    i.grossPotentialIncomeUsd > 0 ? round((i.concessionsBadDebtLossToLeaseUsd / i.grossPotentialIncomeUsd) * 100) : 0;
  const replacementReserveUsd = round(300 * i.unitCount);

  const grossOperatingIncomeUsd = round(
    i.grossPotentialIncomeUsd - i.vacancyLossUsd - i.concessionsBadDebtLossToLeaseUsd + i.otherIncomeUsd,
  );

  const annualOperatingExpensesUsd = round(
    i.realEstateTaxesUsd +
      i.insuranceUsd +
      i.propertyManagementFeesUsd +
      i.repairsMaintenanceUsd +
      i.unitTurnCostsUsd +
      i.utilitiesUsd +
      i.trashUsd +
      i.contractServicesUsd +
      i.generalAdminUsd +
      i.advertisingUsd +
      i.payrollUsd +
      replacementReserveUsd,
  );
  const annualOperatingExpensesPerUnitUsd = i.unitCount > 0 ? round(annualOperatingExpensesUsd / i.unitCount) : 0;

  const annualNetOperatingIncomeUsd = round(grossOperatingIncomeUsd - annualOperatingExpensesUsd);
  const expenseRatioPct = grossOperatingIncomeUsd > 0 ? round((annualOperatingExpensesUsd / grossOperatingIncomeUsd) * 100) : 0;

  const initialPropertyValueUsd =
    i.areaCapRatePct > 0 ? round(annualNetOperatingIncomeUsd / toRatio(i.areaCapRatePct)) : null;
  const sellerCapRatePct =
    i.sellerAskingPriceUsd > 0 ? round((annualNetOperatingIncomeUsd / i.sellerAskingPriceUsd) * 100) : null;

  const downPaymentUsd = initialPropertyValueUsd != null ? round(toRatio(i.downPaymentPct) * initialPropertyValueUsd) : 0;
  const loanAmountUsd = initialPropertyValueUsd != null ? round(initialPropertyValueUsd - downPaymentUsd) : 0;
  const acquisitionCostsLoanFeesUsd =
    initialPropertyValueUsd != null ? round(toRatio(i.acquisitionCostsLoanFeesPct) * initialPropertyValueUsd) : 0;
  const initialInvestmentUsd = round(downPaymentUsd + acquisitionCostsLoanFeesUsd);

  const debt = firstYearDebtBreakdown(loanAmountUsd, i.annualInterestRatePct, i.mortgageYears);

  const totalMonthlyCashFlowBeforeTaxesUsd = round(
    grossOperatingIncomeUsd - annualOperatingExpensesUsd - debt.estimatedMonthlyMortgagePaymentUsd,
  );
  const totalAnnualCashFlowBeforeTaxesUsd = round(annualNetOperatingIncomeUsd - debt.annualDebtServiceUsd);
  const cashOnCashReturnPct =
    initialInvestmentUsd > 0 ? round((totalAnnualCashFlowBeforeTaxesUsd / initialInvestmentUsd) * 100) : null;

  const buyHoldBuyPriceUsd = initialPropertyValueUsd != null ? round(initialPropertyValueUsd - i.estimatedRepairsUsd) : 0;
  const maximumAllowableOfferUsd = round(buyHoldBuyPriceUsd - i.desiredWholesaleFeeUsd);

  return {
    vacancyRatePct,
    concessionsRatePct,
    replacementReserveUsd,
    grossOperatingIncomeUsd,
    annualOperatingExpensesUsd,
    annualOperatingExpensesPerUnitUsd,
    annualNetOperatingIncomeUsd,
    expenseRatioPct,
    initialPropertyValueUsd,
    sellerCapRatePct,
    downPaymentUsd,
    loanAmountUsd,
    acquisitionCostsLoanFeesUsd,
    initialInvestmentUsd,
    estimatedMonthlyMortgagePaymentUsd: debt.estimatedMonthlyMortgagePaymentUsd,
    annualInterestUsd: debt.annualInterestUsd,
    annualPrincipalUsd: debt.annualPrincipalUsd,
    annualDebtServiceUsd: debt.annualDebtServiceUsd,
    totalMonthlyCashFlowBeforeTaxesUsd,
    totalAnnualCashFlowBeforeTaxesUsd,
    cashOnCashReturnPct,
    buyHoldBuyPriceUsd,
    maximumAllowableOfferUsd,
  };
}
