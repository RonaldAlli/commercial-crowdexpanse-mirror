// Commercial Underwriting (v1.3, Commit 3b-i) — deterministic DEBT SIZING. Pure:
// no Prisma, no clock, no randomness — a function of its inputs only, unit-testable
// in isolation and held to the Underwriting Calculation Principles (calculations are
// pure; reproducible; recommendations never feed in). This is a NEW pure sibling to
// lib/analysis.ts (CALCULATION_LIBRARY_VERSION), never a change to the kernel.
//
// Sizing takes the largest loan permitted by each provided constraint and returns
// the SMALLEST (the binding one) — the standard "min of LTV / LTC / DSCR" sizing:
//   • LTV  — loan ≤ targetLtv%  · value        (estimated value basis)
//   • LTC  — loan ≤ targetLtc%  · all-in cost
//   • DSCR — loan whose annual debt service = NOI / minDSCR (invert the amortizing
//            payment for that target service)
// Every constraint is OPTIONAL and degrades to null when its inputs are absent, so a
// scenario with no sizing constraints simply has no sizing (3a behavior preserved).

export type DebtSizingConstraint = "LTV" | "LTC" | "DSCR";

export type DebtSizingInputs = {
  estimatedValueUsd: number | null; // LTV basis
  allInCostUsd: number; // LTC basis (from the kernel)
  noiAnnualUsd: number | null; // DSCR basis
  interestRatePct: number | null;
  amortizationYears: number | null;
  targetLtvPct: number | null;
  targetLtcPct: number | null;
  minDscr: number | null;
};

export type DebtSizingResult = {
  loanByLtvUsd: number | null;
  loanByLtcUsd: number | null;
  loanByDscrUsd: number | null;
  sizedLoanUsd: number | null;
  bindingConstraint: DebtSizingConstraint | null;
};

/** The principal supporting a target annual debt service under a fully-amortizing loan. */
function principalForAnnualDebtService(
  annualDebtServiceUsd: number,
  interestRatePct: number | null,
  amortizationYears: number,
): number {
  const payment = annualDebtServiceUsd / 12;
  const monthlyRate = (interestRatePct ?? 0) / 100 / 12;
  const n = amortizationYears * 12;
  if (monthlyRate === 0) return Math.round(payment * n);
  return Math.round((payment * (1 - Math.pow(1 + monthlyRate, -n))) / monthlyRate);
}

/**
 * Size a loan by the provided constraints. Deterministic and pure. Ties break in a
 * fixed constraint order (LTV → LTC → DSCR) so the binding constraint is stable.
 */
export function sizeDebt(i: DebtSizingInputs): DebtSizingResult {
  const loanByLtvUsd =
    i.targetLtvPct != null && i.targetLtvPct > 0 && i.estimatedValueUsd != null
      ? Math.round((i.estimatedValueUsd * i.targetLtvPct) / 100)
      : null;

  const loanByLtcUsd =
    i.targetLtcPct != null && i.targetLtcPct > 0 ? Math.round((i.allInCostUsd * i.targetLtcPct) / 100) : null;

  const loanByDscrUsd =
    i.minDscr != null &&
    i.minDscr > 0 &&
    i.noiAnnualUsd != null &&
    i.amortizationYears != null &&
    i.amortizationYears > 0
      ? principalForAnnualDebtService(i.noiAnnualUsd / i.minDscr, i.interestRatePct, i.amortizationYears)
      : null;

  const candidates: { constraint: DebtSizingConstraint; value: number }[] = [];
  if (loanByLtvUsd != null) candidates.push({ constraint: "LTV", value: loanByLtvUsd });
  if (loanByLtcUsd != null) candidates.push({ constraint: "LTC", value: loanByLtcUsd });
  if (loanByDscrUsd != null) candidates.push({ constraint: "DSCR", value: loanByDscrUsd });

  let sizedLoanUsd: number | null = null;
  let bindingConstraint: DebtSizingConstraint | null = null;
  for (const c of candidates) {
    if (sizedLoanUsd == null || c.value < sizedLoanUsd) {
      sizedLoanUsd = c.value;
      bindingConstraint = c.constraint;
    }
  }

  return { loanByLtvUsd, loanByLtcUsd, loanByDscrUsd, sizedLoanUsd, bindingConstraint };
}
