import { test } from "node:test";
import assert from "node:assert/strict";

import { rollUpSchedule, type ScheduleLine } from "../../../lib/underwriting/schedule";

const line = (kind: "INCOME" | "EXPENSE", category: string, amountAnnualUsd: number, position = 0): ScheduleLine => ({
  kind,
  category,
  amountAnnualUsd,
  position,
});

test("empty schedule → both totals null, neither kind present", () => {
  assert.deepEqual(rollUpSchedule([]), {
    grossIncomeAnnualUsd: null,
    operatingExpensesUsd: null,
    hasIncomeSchedule: false,
    hasExpenseSchedule: false,
  });
});

test("income lines sum to gross income; expense stays null", () => {
  const r = rollUpSchedule([line("INCOME", "Base Rent", 100_000), line("INCOME", "Parking", 20_000)]);
  assert.equal(r.grossIncomeAnnualUsd, 120_000);
  assert.equal(r.hasIncomeSchedule, true);
  assert.equal(r.operatingExpensesUsd, null);
  assert.equal(r.hasExpenseSchedule, false);
});

test("expense lines sum to operating expenses; income stays null", () => {
  const r = rollUpSchedule([line("EXPENSE", "Taxes", 25_000), line("EXPENSE", "Insurance", 15_000)]);
  assert.equal(r.operatingExpensesUsd, 40_000);
  assert.equal(r.hasExpenseSchedule, true);
  assert.equal(r.grossIncomeAnnualUsd, null);
  assert.equal(r.hasIncomeSchedule, false);
});

test("both kinds roll up independently", () => {
  const r = rollUpSchedule([line("INCOME", "Rent", 120_000), line("EXPENSE", "Opex", 40_000)]);
  assert.equal(r.grossIncomeAnnualUsd, 120_000);
  assert.equal(r.operatingExpensesUsd, 40_000);
  assert.equal(r.hasIncomeSchedule, true);
  assert.equal(r.hasExpenseSchedule, true);
});

test("roll-up is order-independent (a sum) and rounds to whole dollars", () => {
  const a = rollUpSchedule([line("INCOME", "A", 10_000.4), line("INCOME", "B", 20_000.4)]);
  const b = rollUpSchedule([line("INCOME", "B", 20_000.4), line("INCOME", "A", 10_000.4)]);
  assert.equal(a.grossIncomeAnnualUsd, b.grossIncomeAnnualUsd);
  assert.equal(a.grossIncomeAnnualUsd, 30_001); // 30000.8 rounds to 30001
});
