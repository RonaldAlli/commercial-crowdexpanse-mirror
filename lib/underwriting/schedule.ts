// Commercial Underwriting (v1.3, Commit 3b-ii) — deterministic income/expense
// SCHEDULE roll-up. Pure: no Prisma, no clock, no randomness — a function of its
// line items only, unit-testable in isolation and held to the Calculation
// Principles. A NEW pure sibling to lib/analysis.ts (CALCULATION_LIBRARY_VERSION);
// the kernel is unchanged. Income lines sum to the effective gross income and
// expense lines to the effective operating expenses, which then feed the kernel.
//
// When a schedule of a given kind exists it is authoritative for that total; when
// it is absent the caller falls back to the scalar assumption (3a behavior
// preserved). `position` is presentation ordering only — the roll-up is a sum, so
// order never affects the result.

export type ScheduleLine = {
  kind: "INCOME" | "EXPENSE";
  category: string;
  amountAnnualUsd: number;
  position: number;
};

/** A ScheduleLine resolved at the calculation boundary, carrying its canonical string for the fingerprint. */
export type ResolvedLine = ScheduleLine & { canonical: string };

export type ScheduleRollup = {
  grossIncomeAnnualUsd: number | null;
  operatingExpensesUsd: number | null;
  hasIncomeSchedule: boolean;
  hasExpenseSchedule: boolean;
};

/** Sum income and expense lines to effective annual totals (null when that kind is absent). */
export function rollUpSchedule(lines: ScheduleLine[]): ScheduleRollup {
  let income = 0;
  let expense = 0;
  let hasIncome = false;
  let hasExpense = false;
  for (const l of lines) {
    if (l.kind === "INCOME") {
      income += l.amountAnnualUsd;
      hasIncome = true;
    } else {
      expense += l.amountAnnualUsd;
      hasExpense = true;
    }
  }
  return {
    grossIncomeAnnualUsd: hasIncome ? Math.round(income) : null,
    operatingExpensesUsd: hasExpense ? Math.round(expense) : null,
    hasIncomeSchedule: hasIncome,
    hasExpenseSchedule: hasExpense,
  };
}
