// Commercial Underwriting (v1.3, Commit 3b-iii) — the pure derivation of ONE
// FinancingCase from the Scenario's frozen operating economics + the case's own
// capital assumptions + model lineage. Pure: no Prisma, no clock, no randomness.
//
// This is the financing counterpart to scenario-result.ts. It never mutates the
// operating side (CF-4) and never reads another case (CF-3): it takes the already-
// derived operating AnalysisInputs (effective income/expense included) and layers
// the case's debt on top. All financial math is delegated to the UNCHANGED kernel
// (lib/analysis.ts) and the existing debt-sizing module — this module only
// composes them and runs the multi-year projection.
import { computeAnalysis, type AnalysisInputs } from "@/lib/analysis";
import { projectNoi, projectCashFlow, summarizeCashFlow, type CashFlowYearRow, type CashFlowSummary } from "./cash-flow";
import { sizeDebt, type DebtSizingResult } from "./debt-sizing";

/** The frozen operating context a FinancingCase consumes (CF-5) — never mutated. */
export type FinancingCaseInput = {
  // The Scenario's effective operating inputs (schedule roll-up already applied),
  // WITHOUT debt — exactly what deriveScenarioResult fed the kernel.
  operatingInputs: AnalysisInputs;
  // Operating projection assumptions (financing-independent).
  incomeGrowthPct: number | null;
  expenseGrowthPct: number | null;
  holdYears: number | null;
  // Capital assumptions OWNED by this case (CF-1).
  loanAmountUsd: number | null;
  interestRatePct: number | null;
  amortizationYears: number | null;
  targetLtvPct: number | null;
  targetLtcPct: number | null;
  minDscr: number | null;
};

export type DerivedFinancingCase = {
  annualDebtServiceUsd: number | null;
  dscr: number | null;
  debtYieldPct: number | null;
  sizing: DebtSizingResult;
  cashFlow: CashFlowYearRow[];
  summary: CashFlowSummary;
};

/**
 * Derive a single financing case. The operating economics arrive frozen; we layer
 * the case's debt onto them by re-running the UNCHANGED kernel with this case's
 * loan terms (so debt service / DSCR / debt yield come from the same math as
 * everywhere else), size the loan by the case's constraints, and project the
 * levered cash flow over the shared NOI trajectory.
 */
export function deriveFinancingCase(i: FinancingCaseInput): DerivedFinancingCase {
  // Layer this case's debt onto the frozen operating inputs and re-run the kernel.
  const caseInputs: AnalysisInputs = {
    ...i.operatingInputs,
    loanAmountUsd: i.loanAmountUsd,
    interestRatePct: i.interestRatePct,
    amortizationYears: i.amortizationYears,
  };
  const m = computeAnalysis(caseInputs);

  const sizing = sizeDebt({
    estimatedValueUsd: i.operatingInputs.estimatedValueUsd,
    allInCostUsd: m.allInCostUsd,
    noiAnnualUsd: m.noiAnnualUsd,
    interestRatePct: i.interestRatePct,
    amortizationYears: i.amortizationYears,
    targetLtvPct: i.targetLtvPct,
    targetLtcPct: i.targetLtcPct,
    minDscr: i.minDscr,
  });

  const noiSeries = projectNoi({
    grossIncomeYear1: i.operatingInputs.grossIncomeAnnualUsd,
    operatingExpensesYear1: i.operatingInputs.operatingExpensesUsd,
    incomeGrowthPct: i.incomeGrowthPct,
    expenseGrowthPct: i.expenseGrowthPct,
    holdYears: i.holdYears,
  });
  const cashFlow = projectCashFlow(noiSeries, m.annualDebtServiceUsd);
  const summary = summarizeCashFlow(cashFlow);

  return {
    annualDebtServiceUsd: m.annualDebtServiceUsd,
    dscr: m.dscr,
    debtYieldPct: m.debtYieldPct,
    sizing,
    cashFlow,
    summary,
  };
}
