// Commercial Underwriting (v1.3, Commit 3b-vi) — the pure findings/risk + suggested
// recommendation layer. The TOP of the stack: interpretation, not calculation. It reads
// the already-settled deterministic outputs (operating ScenarioResult + each
// FinancingCase's financing/exit results) and a FIXED, VERSIONED ruleset, and emits
// Scenario findings + one advisory recommendation. Pure: no Prisma, no clock, no
// randomness, no I/O, no cross-scenario read (FR-1). It NEVER feeds back into a
// calculation (Principle 7 / UW-7) and never decides (UW-4 / FR-5).
//
// RULESET (RULESET_VERSION 2 — the first real ruleset). Every rule and threshold below
// is part of this ruleset; changing, adding, or removing ANY of them REQUIRES a
// RULESET_VERSION increment and nothing else (FR-4). The rules are deliberately fixed
// (no user-authored formulas) and evaluate ONLY the scenario's own frozen underwriting
// outputs — no market signals or external data (deferred, R-E).

export type FindingSeverity = "INFO" | "WARNING" | "CRITICAL";
export type FindingCategory = "DEAL_QUALITY" | "FINANCING" | "CASH_FLOW" | "RETURN";
export type RecommendationLevel = "PROCEED" | "PROCEED_WITH_CONDITIONS" | "PASS";

/** Fixed thresholds for RULESET_VERSION 2. Changing any of these is a RULESET bump (FR-4). */
export const RULESET_THRESHOLDS = {
  thinSpreadPctOfCost: 0.05, // spread under 5% of all-in cost is thin
  highExpenseRatioPct: 55, // operating expense ratio above 55% is high
  minDscrFallback: 1.25, // when a case sets no MIN_DSCR, flag DSCR under 1.25
  thinDebtYieldPct: 8, // debt yield under 8% is thin
  irrHurdlePct: 8, // levered IRR under 8% is below hurdle
  healthyDscr: 1.5, // DSCR at/above 1.5 is a positive signal
  strongEquityMultiple: 2.0, // equity multiple at/above 2.0x is a strong return
  strongIrrPct: 15, // levered IRR at/above 15% is a strong return
} as const;

/** Settled operating outputs the ruleset reads (from ScenarioResult). */
export type OperatingFindingInput = {
  spreadUsd: number | null;
  allInCostUsd: number | null;
  expenseRatioPct: number | null;
};

/** Settled per-case outputs the ruleset reads (from FinancingCaseResult + cash flow). */
export type CaseFindingInput = {
  id: string;
  label: string;
  isPrimary: boolean; // position 0 — the analyst's primary structure
  hasDebt: boolean; // financing modeled (a debt service exists)
  dscr: number | null;
  minDscr: number | null;
  debtYieldPct: number | null;
  avgDscr: number | null;
  year1CashFlowBeforeTaxUsd: number | null;
  hasExit: boolean; // exit valuation modeled
  equityMultiple: number | null;
  leveredIrrPct: number | null;
};

export type Finding = {
  code: string;
  category: FindingCategory;
  severity: FindingSeverity;
  decisive: boolean;
  title: string;
  detail: string;
  financingCaseId: string | null;
  observedValue: number | null;
  thresholdValue: number | null;
};

export type FindingsResult = { findings: Finding[]; recommendation: RecommendationLevel };

const SEVERITY_RANK: Record<FindingSeverity, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };

/**
 * Derive the deterministic findings + suggested recommendation. Findings are emitted for
 * the operating scenario (financingCaseId = null) and for each financing case (citing its
 * id); a case's financing/exit findings are `decisive` only for the PRIMARY case (position
 * 0). The recommendation is the worst severity among the DECISIVE findings:
 * any CRITICAL → PASS; else any WARNING → PROCEED_WITH_CONDITIONS; else PROCEED (FR-5).
 */
export function deriveFindings(operating: OperatingFindingInput, cases: CaseFindingInput[]): FindingsResult {
  const out: Finding[] = [];

  // --- Operating (scenario-level, always decisive) ---------------------------
  const { spreadUsd, allInCostUsd, expenseRatioPct } = operating;
  if (spreadUsd != null && spreadUsd <= 0) {
    out.push({
      code: "NEGATIVE_SPREAD",
      category: "DEAL_QUALITY",
      severity: "CRITICAL",
      decisive: true,
      title: "Non-positive spread",
      detail: "The spread over all-in cost is zero or negative — the deal has no equity cushion.",
      financingCaseId: null,
      observedValue: spreadUsd,
      thresholdValue: 0,
    });
  } else if (spreadUsd != null && allInCostUsd != null && allInCostUsd > 0 && spreadUsd < RULESET_THRESHOLDS.thinSpreadPctOfCost * allInCostUsd) {
    out.push({
      code: "THIN_SPREAD",
      category: "DEAL_QUALITY",
      severity: "WARNING",
      decisive: true,
      title: "Thin spread",
      detail: "The spread is under 5% of all-in cost — little margin for error.",
      financingCaseId: null,
      observedValue: spreadUsd,
      thresholdValue: RULESET_THRESHOLDS.thinSpreadPctOfCost * allInCostUsd,
    });
  }
  if (expenseRatioPct != null && expenseRatioPct > RULESET_THRESHOLDS.highExpenseRatioPct) {
    out.push({
      code: "HIGH_EXPENSE_RATIO",
      category: "DEAL_QUALITY",
      severity: "WARNING",
      decisive: true,
      title: "High operating expense ratio",
      detail: "Operating expenses exceed 55% of gross income.",
      financingCaseId: null,
      observedValue: expenseRatioPct,
      thresholdValue: RULESET_THRESHOLDS.highExpenseRatioPct,
    });
  }

  // --- Per financing case ----------------------------------------------------
  for (const c of cases) {
    const decisive = c.isPrimary;
    const cite = c.id;
    if (c.hasDebt) {
      if (c.dscr != null && c.dscr < 1.0) {
        out.push({ code: "DSCR_BELOW_ONE", category: "FINANCING", severity: "CRITICAL", decisive, title: `DSCR below 1.0 (${c.label})`, detail: "Year-1 net operating income does not cover debt service.", financingCaseId: cite, observedValue: c.dscr, thresholdValue: 1.0 });
      } else if (c.dscr != null) {
        const minDscr = c.minDscr ?? RULESET_THRESHOLDS.minDscrFallback;
        if (c.dscr < minDscr) {
          out.push({ code: "DSCR_BELOW_MIN", category: "FINANCING", severity: "WARNING", decisive, title: `DSCR below target (${c.label})`, detail: `Year-1 DSCR is under the ${c.minDscr != null ? "case minimum" : "1.25 default"} coverage target.`, financingCaseId: cite, observedValue: c.dscr, thresholdValue: minDscr });
        } else if (c.dscr >= RULESET_THRESHOLDS.healthyDscr) {
          out.push({ code: "HEALTHY_DSCR", category: "FINANCING", severity: "INFO", decisive, title: `Healthy DSCR (${c.label})`, detail: "Year-1 DSCR is at or above 1.5x.", financingCaseId: cite, observedValue: c.dscr, thresholdValue: RULESET_THRESHOLDS.healthyDscr });
        }
      }
      if (c.debtYieldPct != null && c.debtYieldPct < RULESET_THRESHOLDS.thinDebtYieldPct) {
        out.push({ code: "THIN_DEBT_YIELD", category: "FINANCING", severity: "WARNING", decisive, title: `Thin debt yield (${c.label})`, detail: "Debt yield is under 8%.", financingCaseId: cite, observedValue: c.debtYieldPct, thresholdValue: RULESET_THRESHOLDS.thinDebtYieldPct });
      }
      if (c.avgDscr != null && c.avgDscr < 1.0) {
        out.push({ code: "AVG_DSCR_BELOW_ONE", category: "CASH_FLOW", severity: "CRITICAL", decisive, title: `Average DSCR below 1.0 (${c.label})`, detail: "Average DSCR across the hold does not cover debt service.", financingCaseId: cite, observedValue: c.avgDscr, thresholdValue: 1.0 });
      }
      if (c.year1CashFlowBeforeTaxUsd != null && c.year1CashFlowBeforeTaxUsd < 0) {
        out.push({ code: "NEGATIVE_YEAR1_CF", category: "CASH_FLOW", severity: "WARNING", decisive, title: `Negative year-1 cash flow (${c.label})`, detail: "Year-1 cash flow before tax is negative after debt service.", financingCaseId: cite, observedValue: c.year1CashFlowBeforeTaxUsd, thresholdValue: 0 });
      }
    }
    if (c.hasExit) {
      if (c.equityMultiple != null && c.equityMultiple < 1.0) {
        out.push({ code: "EQUITY_MULTIPLE_BELOW_ONE", category: "RETURN", severity: "CRITICAL", decisive, title: `Equity multiple below 1.0 (${c.label})`, detail: "Projected distributions do not return the contributed equity.", financingCaseId: cite, observedValue: c.equityMultiple, thresholdValue: 1.0 });
      }
      if (c.leveredIrrPct != null && c.leveredIrrPct < 0) {
        out.push({ code: "NEGATIVE_IRR", category: "RETURN", severity: "CRITICAL", decisive, title: `Negative levered IRR (${c.label})`, detail: "The projected levered IRR is negative.", financingCaseId: cite, observedValue: c.leveredIrrPct, thresholdValue: 0 });
      } else if (c.leveredIrrPct != null && c.leveredIrrPct < RULESET_THRESHOLDS.irrHurdlePct) {
        out.push({ code: "IRR_BELOW_HURDLE", category: "RETURN", severity: "WARNING", decisive, title: `Levered IRR below hurdle (${c.label})`, detail: "The projected levered IRR is under an 8% hurdle.", financingCaseId: cite, observedValue: c.leveredIrrPct, thresholdValue: RULESET_THRESHOLDS.irrHurdlePct });
      }
      const strong = (c.equityMultiple != null && c.equityMultiple >= RULESET_THRESHOLDS.strongEquityMultiple) || (c.leveredIrrPct != null && c.leveredIrrPct >= RULESET_THRESHOLDS.strongIrrPct);
      if (strong) {
        out.push({ code: "STRONG_RETURN", category: "RETURN", severity: "INFO", decisive, title: `Strong projected return (${c.label})`, detail: "Projected return clears a strong-return threshold (≥2.0x or ≥15% IRR).", financingCaseId: cite, observedValue: c.leveredIrrPct, thresholdValue: RULESET_THRESHOLDS.strongIrrPct });
      }
    }
  }

  // Deterministic ordering: severity (CRITICAL→WARNING→INFO), then insertion order
  // (stable) so identical inputs always yield an identical, position-stable list.
  const withSeq = out.map((f, seq) => ({ f, seq }));
  withSeq.sort((a, b) => SEVERITY_RANK[a.f.severity] - SEVERITY_RANK[b.f.severity] || a.seq - b.seq);
  const findings = withSeq.map((x) => x.f);

  // Recommendation from the DECISIVE findings only (operating + primary case).
  const decisiveSeverities = findings.filter((f) => f.decisive).map((f) => f.severity);
  const recommendation: RecommendationLevel = decisiveSeverities.includes("CRITICAL")
    ? "PASS"
    : decisiveSeverities.includes("WARNING")
      ? "PROCEED_WITH_CONDITIONS"
      : "PROCEED";

  return { findings, recommendation };
}
