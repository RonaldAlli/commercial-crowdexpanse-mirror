// Commercial Underwriting (v1.3, Commit 3a) — the pure derivation of a
// ScenarioResult from a frozen assumption set + model lineage. This is the single
// deterministic function the persisted ScenarioResult mirrors; rebuilding a result
// calls ONLY this — it never reads current Property projections (reconstruction
// invariant). No Prisma, no clock, no randomness. The financial math is delegated
// unchanged to lib/analysis.ts (CALCULATION_LIBRARY_VERSION). A ResolvedAssumption
// already carries { key, canonical, source }, so it feeds the fingerprint directly.
//
// As of 3b-iii this is OPERATING-ONLY (CF-2): debt sizing and every financing-
// dependent metric moved to the FinancingCase (see financing.ts). A Scenario's
// result carries no capital economics. The effective operating `inputs` are
// exposed so each FinancingCase can layer its debt onto the same frozen numbers.
import { computeAnalysis, type AnalysisInputs, type AnalysisMetrics } from "@/lib/analysis";
import { assumptionsToAnalysisInputs, validateAssumptions, type ResolvedAssumption } from "./assumptions";
import { computeScenarioVersion, type ModelLineage } from "./model-version";
import { rollUpSchedule, type ResolvedLine } from "./schedule";

export type DerivedScenario = {
  scenarioVersion: string;
  metrics: AnalysisMetrics;
  // Effective income/expense actually used for NOI (schedule roll-up or scalar).
  effective: { grossIncomeAnnualUsd: number | null; operatingExpensesUsd: number | null };
  // The effective operating AnalysisInputs (schedule applied, no debt) — the frozen
  // numbers each FinancingCase consumes (CF-5). Debt-less by construction.
  inputs: AnalysisInputs;
};

/** Derive a scenario's OPERATING result purely from its frozen assumptions + line items + lineage. */
export function deriveScenarioResult(
  assumptions: ResolvedAssumption[],
  lines: ResolvedLine[],
  lineage: ModelLineage,
): DerivedScenario {
  const invalid = validateAssumptions(assumptions);
  if (invalid) throw new Error(`Cannot derive ScenarioResult: ${invalid}`);
  const fpLines = lines.map((l) => ({ kind: l.kind, category: l.category, canonical: l.canonical }));
  const scenarioVersion = computeScenarioVersion(assumptions, lineage, fpLines);

  // A schedule of a given kind, when present, is authoritative for that total;
  // otherwise fall back to the scalar assumption (3a behavior preserved).
  const rollup = rollUpSchedule(lines);
  const base = assumptionsToAnalysisInputs(assumptions);
  const inputs: AnalysisInputs = {
    ...base,
    grossIncomeAnnualUsd: rollup.hasIncomeSchedule ? rollup.grossIncomeAnnualUsd : base.grossIncomeAnnualUsd,
    operatingExpensesUsd: rollup.hasExpenseSchedule ? rollup.operatingExpensesUsd : base.operatingExpensesUsd,
    // Capital lives on the FinancingCase now (CF-1) — the operating result carries no debt.
    loanAmountUsd: null,
    interestRatePct: null,
    amortizationYears: null,
  };

  const metrics = computeAnalysis(inputs);

  return {
    scenarioVersion,
    metrics,
    effective: { grossIncomeAnnualUsd: inputs.grossIncomeAnnualUsd, operatingExpensesUsd: inputs.operatingExpensesUsd },
    inputs,
  };
}
