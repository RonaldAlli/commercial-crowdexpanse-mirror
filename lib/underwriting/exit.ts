// Commercial Underwriting (v1.3, Commit 3b-iv) — the pure exit-valuation, equity
// cash-flow, and return-metric layer. No Prisma, no framework, no clock, no
// randomness: a deterministic function of primitives, safe to unit-test alone.
//
// This is the next layer ON TOP OF the cash-flow projection (Principle 8): it reads
// the settled operating NOI trajectory + the case's debt as frozen inputs and adds
// terminal value, equity cash flows, and returns — it never restates a lower layer
// (EX-1). Operating economics only: NO tax, depreciation, refinance, promote,
// preferred return, catch-up, or multiple partners (all future slices).

function round(n: number, decimals = 2) {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

/**
 * Remaining principal on a fully-amortizing loan after `exitYear` years — the true
 * amortization balance, never a shortcut (EX-3). Derived only from the case's frozen
 * loan terms + exit timing; it never reads a live lender or current Property state.
 */
export function remainingLoanBalance(
  loanAmountUsd: number | null,
  interestRatePct: number | null,
  amortizationYears: number | null,
  exitYear: number,
): number {
  if (loanAmountUsd == null || loanAmountUsd <= 0 || amortizationYears == null || amortizationYears <= 0) return 0;
  if (exitYear >= amortizationYears) return 0; // fully amortized by exit

  const monthlyRate = (interestRatePct ?? 0) / 100 / 12;
  const n = amortizationYears * 12;
  const k = Math.min(Math.round(exitYear * 12), n);
  if (monthlyRate === 0) {
    // Straight-line principal amortization when the rate is zero.
    return round(loanAmountUsd * (1 - k / n));
  }
  // Standard closed-form remaining balance after k payments of an n-month loan.
  const pow_n = Math.pow(1 + monthlyRate, n);
  const pow_k = Math.pow(1 + monthlyRate, k);
  return round((loanAmountUsd * (pow_n - pow_k)) / (pow_n - 1));
}

export type ExitValuation = {
  grossExitValueUsd: number;
  sellingCostsUsd: number;
  debtPayoffUsd: number;
  netSaleProceedsUsd: number;
};

/**
 * Terminal valuation from the exit-year NOI, capitalized at the exit cap rate, net of
 * selling costs and the debt payoff. `netSaleProceeds` is the equity's share of the
 * sale (single holder). Requires a positive exit cap rate.
 */
export function projectExit(i: {
  terminalNoiUsd: number;
  exitCapRatePct: number;
  sellingCostsPct: number | null;
  debtPayoffUsd: number;
}): ExitValuation {
  const grossExitValueUsd = round(i.terminalNoiUsd / (i.exitCapRatePct / 100));
  const sellingCostsUsd = round(grossExitValueUsd * ((i.sellingCostsPct ?? 0) / 100));
  const netSaleProceedsUsd = round(grossExitValueUsd - sellingCostsUsd - i.debtPayoffUsd);
  return { grossExitValueUsd, sellingCostsUsd, debtPayoffUsd: round(i.debtPayoffUsd), netSaleProceedsUsd };
}

/**
 * The equity cash-flow series: year 0 is the negative initial equity, years 1..N are
 * the levered operating cash flow before tax, and the FINAL year adds the net sale
 * proceeds. The final year's operating cash flow is counted ONCE — combined with the
 * sale, never separately (EX-5).
 */
export function computeEquityCashFlows(i: {
  contributedEquityUsd: number;
  annualCashFlowsBeforeTax: number[]; // ordered year 1..N
  netSaleProceedsUsd: number;
}): number[] {
  const series: number[] = [round(-i.contributedEquityUsd)];
  const last = i.annualCashFlowsBeforeTax.length - 1;
  i.annualCashFlowsBeforeTax.forEach((cf, idx) => {
    series.push(round(idx === last ? cf + i.netSaleProceedsUsd : cf));
  });
  return series;
}

/** Deterministic levered IRR via bisection; null when the series has no sign change. */
export function leveredIrr(series: number[]): number | null {
  const npv = (r: number) => series.reduce((acc, cf, t) => acc + cf / Math.pow(1 + r, t), 0);
  let lo = -0.9999;
  let hi = 10.0;
  let flo = npv(lo);
  let fhi = npv(hi);
  if (flo === 0) return round(lo * 100);
  if (fhi === 0) return round(hi * 100);
  if (flo * fhi > 0) return null; // no root in the bracketed range
  for (let iter = 0; iter < 200; iter++) {
    const mid = (lo + hi) / 2;
    const fm = npv(mid);
    if (fm === 0) return round(mid * 100);
    if (flo * fm < 0) {
      hi = mid;
      fhi = fm;
    } else {
      lo = mid;
      flo = fm;
    }
  }
  return round(((lo + hi) / 2) * 100);
}

export type EquityReturns = {
  equityMultiple: number | null;
  leveredIrrPct: number | null;
  totalProfitUsd: number;
  totalDistributionsUsd: number;
};

/**
 * Equity returns as pure functions of the complete equity cash-flow series (EX-4).
 * IRR / multiple are OUTPUTS only — they never feed another calculation.
 */
export function computeReturns(series: number[], contributedEquityUsd: number): EquityReturns {
  const totalDistributionsUsd = round(series.slice(1).reduce((a, b) => a + b, 0));
  const totalProfitUsd = round(totalDistributionsUsd - contributedEquityUsd);
  const equityMultiple = contributedEquityUsd > 0 ? round(totalDistributionsUsd / contributedEquityUsd) : null;
  const leveredIrrPct = contributedEquityUsd > 0 ? leveredIrr(series) : null;
  return { equityMultiple, leveredIrrPct, totalProfitUsd, totalDistributionsUsd };
}
