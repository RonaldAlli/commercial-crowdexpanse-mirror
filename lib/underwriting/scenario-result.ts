// Commercial Underwriting (v1.3, Commit 3a) — the pure derivation of a
// ScenarioResult from a frozen assumption set + model lineage. This is the single
// deterministic function the persisted ScenarioResult mirrors; rebuilding a result
// calls ONLY this — it never reads current Property projections (reconstruction
// invariant). No Prisma, no clock, no randomness. The financial math is delegated
// unchanged to lib/analysis.ts (CALCULATION_LIBRARY_VERSION). A ResolvedAssumption
// already carries { key, canonical, source }, so it feeds the fingerprint directly.
import { computeAnalysis, type AnalysisMetrics } from "@/lib/analysis";
import { assumptionValue, assumptionsToAnalysisInputs, validateAssumptions, type ResolvedAssumption } from "./assumptions";
import { sizeDebt, type DebtSizingResult } from "./debt-sizing";
import { computeScenarioVersion, type ModelLineage } from "./model-version";

export type DerivedScenario = { scenarioVersion: string; metrics: AnalysisMetrics; sizing: DebtSizingResult };

/** Derive a scenario's result purely from its frozen assumptions + lineage. */
export function deriveScenarioResult(assumptions: ResolvedAssumption[], lineage: ModelLineage): DerivedScenario {
  const invalid = validateAssumptions(assumptions);
  if (invalid) throw new Error(`Cannot derive ScenarioResult: ${invalid}`);
  const scenarioVersion = computeScenarioVersion(assumptions, lineage);
  const inputs = assumptionsToAnalysisInputs(assumptions);
  const metrics = computeAnalysis(inputs);
  const sizing = sizeDebt({
    estimatedValueUsd: inputs.estimatedValueUsd,
    allInCostUsd: metrics.allInCostUsd,
    noiAnnualUsd: metrics.noiAnnualUsd,
    interestRatePct: inputs.interestRatePct,
    amortizationYears: inputs.amortizationYears,
    targetLtvPct: assumptionValue(assumptions, "TARGET_LTV_PCT"),
    targetLtcPct: assumptionValue(assumptions, "TARGET_LTC_PCT"),
    minDscr: assumptionValue(assumptions, "MIN_DSCR"),
  });
  return { scenarioVersion, metrics, sizing };
}
