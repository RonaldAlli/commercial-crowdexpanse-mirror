// Pure deal-analysis math — no Prisma, no framework. Safe to unit-test and to
// import from both server actions and server components.

export type AnalysisInputs = {
  purchasePriceUsd: number;
  renovationBudgetUsd: number | null;
  closingCostsUsd: number | null;
  grossIncomeAnnualUsd: number | null;
  operatingExpensesUsd: number | null;
  loanAmountUsd: number | null;
  interestRatePct: number | null;
  amortizationYears: number | null;
  // Context pulled from the related property.
  unitCount: number | null;
  estimatedValueUsd: number | null;
};

export type AnalysisMetrics = {
  noiAnnualUsd: number | null;
  allInCostUsd: number;
  capRate: number | null;
  pricePerUnitUsd: number | null;
  expenseRatioPct: number | null;
  annualDebtServiceUsd: number | null;
  dscr: number | null;
  debtYieldPct: number | null;
  spreadUsd: number | null;
};

function round(n: number, decimals = 2) {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

export function computeAnalysis(i: AnalysisInputs): AnalysisMetrics {
  const reno = i.renovationBudgetUsd ?? 0;
  const closing = i.closingCostsUsd ?? 0;
  const allInCostUsd = i.purchasePriceUsd + reno + closing;

  const noiAnnualUsd =
    i.grossIncomeAnnualUsd != null ? i.grossIncomeAnnualUsd - (i.operatingExpensesUsd ?? 0) : null;

  const capRate =
    noiAnnualUsd != null && i.purchasePriceUsd > 0 ? round((noiAnnualUsd / i.purchasePriceUsd) * 100) : null;

  const pricePerUnitUsd = i.unitCount && i.unitCount > 0 ? round(i.purchasePriceUsd / i.unitCount) : null;

  const expenseRatioPct =
    i.grossIncomeAnnualUsd && i.grossIncomeAnnualUsd > 0 && i.operatingExpensesUsd != null
      ? round((i.operatingExpensesUsd / i.grossIncomeAnnualUsd) * 100)
      : null;

  // Annual debt service from a standard fully-amortizing payment.
  let annualDebtServiceUsd: number | null = null;
  if (i.loanAmountUsd != null && i.loanAmountUsd > 0 && i.amortizationYears != null && i.amortizationYears > 0) {
    const monthlyRate = (i.interestRatePct ?? 0) / 100 / 12;
    const n = i.amortizationYears * 12;
    if (monthlyRate === 0) {
      annualDebtServiceUsd = round(i.loanAmountUsd / i.amortizationYears);
    } else {
      const payment = (i.loanAmountUsd * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -n));
      annualDebtServiceUsd = round(payment * 12);
    }
  }

  const dscr =
    noiAnnualUsd != null && annualDebtServiceUsd != null && annualDebtServiceUsd > 0
      ? round(noiAnnualUsd / annualDebtServiceUsd)
      : null;

  const debtYieldPct =
    noiAnnualUsd != null && i.loanAmountUsd != null && i.loanAmountUsd > 0
      ? round((noiAnnualUsd / i.loanAmountUsd) * 100)
      : null;

  const spreadUsd = i.estimatedValueUsd != null ? i.estimatedValueUsd - allInCostUsd : null;

  return {
    noiAnnualUsd,
    allInCostUsd,
    capRate,
    pricePerUnitUsd,
    expenseRatioPct,
    annualDebtServiceUsd,
    dscr,
    debtYieldPct,
    spreadUsd,
  };
}
