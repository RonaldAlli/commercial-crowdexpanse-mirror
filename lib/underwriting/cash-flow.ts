// Commercial Underwriting (v1.3, Commit 3b-iii) — the pure multi-year operating
// cash-flow projection. No Prisma, no framework, no clock, no randomness: a
// deterministic function of primitives, safe to unit-test in isolation.
//
// Ownership boundary (CF-2/CF-5): the NOI trajectory is OPERATING — a function of
// the Scenario's income/expense + growth, financing-independent, so it is computed
// ONCE and reused identically by every FinancingCase. Only debt service and the
// resulting cash flow / DSCR are per-case. Operating cash flow ONLY — no sale,
// terminal value, refinance, waterfall, IRR, or equity multiple (future sub-slices).

function round(n: number, decimals = 2) {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

/** Operating inputs for the shared NOI trajectory (financing-independent, CF-5). */
export type NoiTrajectoryInput = {
  grossIncomeYear1: number | null;
  operatingExpensesYear1: number | null;
  incomeGrowthPct: number | null;
  expenseGrowthPct: number | null;
  holdYears: number | null;
};

export type NoiYear = {
  year: number;
  grossIncomeUsd: number;
  operatingExpensesUsd: number;
  noiUsd: number;
};

/**
 * Project the operating NOI year by year. Income and expenses grow INDEPENDENTLY
 * at their own rates (IS-1 spirit); NOI is their difference. Requires a hold
 * period > 0 and a year-1 gross income — otherwise there is nothing to project and
 * the series is empty (mirrors "no schedule → scalar fallback": no projection
 * assumptions → no cash flow). Financing-independent by construction.
 */
export function projectNoi(i: NoiTrajectoryInput): NoiYear[] {
  const years = i.holdYears != null && i.holdYears > 0 ? Math.floor(i.holdYears) : 0;
  if (years === 0 || i.grossIncomeYear1 == null) return [];

  const gi1 = i.grossIncomeYear1;
  const oe1 = i.operatingExpensesYear1 ?? 0;
  const gGrowth = (i.incomeGrowthPct ?? 0) / 100;
  const eGrowth = (i.expenseGrowthPct ?? 0) / 100;

  const out: NoiYear[] = [];
  for (let y = 1; y <= years; y++) {
    const grossIncomeUsd = round(gi1 * Math.pow(1 + gGrowth, y - 1));
    const operatingExpensesUsd = round(oe1 * Math.pow(1 + eGrowth, y - 1));
    out.push({ year: y, grossIncomeUsd, operatingExpensesUsd, noiUsd: round(grossIncomeUsd - operatingExpensesUsd) });
  }
  return out;
}

export type CashFlowYearRow = {
  year: number;
  noiUsd: number;
  debtServiceUsd: number;
  cashFlowBeforeTaxUsd: number;
  dscr: number | null;
};

/**
 * Levered operating cash flow per year: cash flow before tax = NOI − debt service.
 * Debt service is the case's fixed amortizing payment (constant across the hold —
 * no refinance, which is a future sub-slice). An all-cash case (null/0 debt
 * service) simply passes NOI through with a null DSCR.
 */
export function projectCashFlow(noiSeries: NoiYear[], annualDebtServiceUsd: number | null): CashFlowYearRow[] {
  const ds = annualDebtServiceUsd != null && annualDebtServiceUsd > 0 ? round(annualDebtServiceUsd) : 0;
  return noiSeries.map((n) => ({
    year: n.year,
    noiUsd: n.noiUsd,
    debtServiceUsd: ds,
    cashFlowBeforeTaxUsd: round(n.noiUsd - ds),
    dscr: ds > 0 ? round(n.noiUsd / ds) : null,
  }));
}

export type CashFlowSummary = {
  projectionYears: number;
  avgDscr: number | null;
  cumulativeCashFlowUsd: number | null;
};

/** Aggregate a projection: average DSCR (over years with debt) + cumulative cash flow. */
export function summarizeCashFlow(series: CashFlowYearRow[]): CashFlowSummary {
  if (series.length === 0) return { projectionYears: 0, avgDscr: null, cumulativeCashFlowUsd: null };
  const dscrs = series.map((r) => r.dscr).filter((d): d is number => d != null);
  const avgDscr = dscrs.length > 0 ? round(dscrs.reduce((a, b) => a + b, 0) / dscrs.length) : null;
  const cumulativeCashFlowUsd = Math.round(series.reduce((a, r) => a + r.cashFlowBeforeTaxUsd, 0));
  return { projectionYears: series.length, avgDscr, cumulativeCashFlowUsd };
}
