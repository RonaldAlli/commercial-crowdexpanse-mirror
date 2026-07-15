import { test } from "node:test";
import assert from "node:assert/strict";

import { projectNoi, projectCashFlow, summarizeCashFlow } from "../../../lib/underwriting/cash-flow";

test("projectNoi returns an empty series when there is no hold period or no income", () => {
  assert.deepEqual(projectNoi({ grossIncomeYear1: 100_000, operatingExpensesYear1: 40_000, incomeGrowthPct: 3, expenseGrowthPct: 2, holdYears: null }), []);
  assert.deepEqual(projectNoi({ grossIncomeYear1: 100_000, operatingExpensesYear1: 40_000, incomeGrowthPct: 3, expenseGrowthPct: 2, holdYears: 0 }), []);
  assert.deepEqual(projectNoi({ grossIncomeYear1: null, operatingExpensesYear1: 40_000, incomeGrowthPct: 3, expenseGrowthPct: 2, holdYears: 5 }), []);
});

test("projectNoi grows income and expenses INDEPENDENTLY at their own rates", () => {
  const s = projectNoi({ grossIncomeYear1: 100_000, operatingExpensesYear1: 40_000, incomeGrowthPct: 10, expenseGrowthPct: 5, holdYears: 3 });
  assert.equal(s.length, 3);
  // Year 1 is the base (no growth applied yet).
  assert.deepEqual(s[0], { year: 1, grossIncomeUsd: 100_000, operatingExpensesUsd: 40_000, noiUsd: 60_000 });
  // Year 2: income ×1.10, expense ×1.05.
  assert.equal(s[1].grossIncomeUsd, 110_000);
  assert.equal(s[1].operatingExpensesUsd, 42_000);
  assert.equal(s[1].noiUsd, 68_000);
  // Year 3: income ×1.10², expense ×1.05².
  assert.equal(s[2].grossIncomeUsd, 121_000);
  assert.equal(s[2].operatingExpensesUsd, 44_100);
  assert.equal(s[2].noiUsd, 76_900);
});

test("projectNoi treats null growth as 0% and a null expense as 0", () => {
  const s = projectNoi({ grossIncomeYear1: 100_000, operatingExpensesYear1: null, incomeGrowthPct: null, expenseGrowthPct: null, holdYears: 2 });
  assert.deepEqual(s.map((y) => y.noiUsd), [100_000, 100_000]);
  assert.deepEqual(s.map((y) => y.operatingExpensesUsd), [0, 0]);
});

test("projectNoi floors a fractional hold period to whole years", () => {
  assert.equal(projectNoi({ grossIncomeYear1: 100_000, operatingExpensesYear1: 0, incomeGrowthPct: 0, expenseGrowthPct: 0, holdYears: 2.9 }).length, 2);
});

const noi = projectNoi({ grossIncomeYear1: 100_000, operatingExpensesYear1: 40_000, incomeGrowthPct: 0, expenseGrowthPct: 0, holdYears: 3 });

test("projectCashFlow subtracts a constant debt service and computes DSCR per year", () => {
  const cf = projectCashFlow(noi, 50_000);
  assert.equal(cf.length, 3);
  for (const y of cf) {
    assert.equal(y.debtServiceUsd, 50_000);
    assert.equal(y.cashFlowBeforeTaxUsd, 10_000); // 60k NOI − 50k DS
    assert.equal(y.dscr, 1.2); // 60k / 50k
  }
});

test("projectCashFlow with no debt service (all-cash) passes NOI through with a null DSCR", () => {
  const cf = projectCashFlow(noi, null);
  assert.equal(cf[0].debtServiceUsd, 0);
  assert.equal(cf[0].cashFlowBeforeTaxUsd, 60_000);
  assert.equal(cf[0].dscr, null);
  // Zero is treated the same as null (no debt).
  assert.equal(projectCashFlow(noi, 0)[0].dscr, null);
});

test("summarizeCashFlow aggregates average DSCR (over levered years) and cumulative cash flow", () => {
  const cf = projectCashFlow(noi, 50_000);
  const s = summarizeCashFlow(cf);
  assert.equal(s.projectionYears, 3);
  assert.equal(s.avgDscr, 1.2);
  assert.equal(s.cumulativeCashFlowUsd, 30_000); // 3 × 10k
});

test("summarizeCashFlow of an empty projection is all-null", () => {
  assert.deepEqual(summarizeCashFlow([]), { projectionYears: 0, avgDscr: null, cumulativeCashFlowUsd: null });
});

test("summarizeCashFlow reports a null avgDscr for an all-cash projection but still totals cash flow", () => {
  const s = summarizeCashFlow(projectCashFlow(noi, null));
  assert.equal(s.avgDscr, null);
  assert.equal(s.cumulativeCashFlowUsd, 180_000); // 3 × 60k
});
