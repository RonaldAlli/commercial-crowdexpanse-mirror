import { test } from "node:test";
import assert from "node:assert/strict";

import { remainingLoanBalance, projectExit, computeEquityCashFlows, leveredIrr, computeReturns } from "../../../lib/underwriting/exit";

// --- remainingLoanBalance (EX-3: true amortization, not a shortcut) ----------
test("remainingLoanBalance is 0 with no loan or invalid amortization", () => {
  assert.equal(remainingLoanBalance(null, 6, 30, 3), 0);
  assert.equal(remainingLoanBalance(0, 6, 30, 3), 0);
  assert.equal(remainingLoanBalance(750_000, 6, null, 3), 0);
});

test("remainingLoanBalance is 0 once the loan is fully amortized at exit", () => {
  assert.equal(remainingLoanBalance(750_000, 6, 30, 30), 0);
  assert.equal(remainingLoanBalance(750_000, 6, 30, 31), 0);
});

test("remainingLoanBalance amortizes straight-line at a zero rate", () => {
  assert.equal(remainingLoanBalance(750_000, 0, 30, 10), 500_000); // 1 − 120/360
  assert.equal(remainingLoanBalance(600_000, 0, 20, 5), 450_000); // 1 − 60/240
});

test("remainingLoanBalance uses the closed-form balance at a positive rate", () => {
  // 750k @ 6% / 30yr after 3 years ≈ 720.6k (real amortization, barely paid down).
  const b = remainingLoanBalance(750_000, 6, 30, 3);
  assert.ok(b > 715_000 && b < 725_000, `expected ≈720.6k, got ${b}`);
});

// --- projectExit -------------------------------------------------------------
test("projectExit capitalizes terminal NOI, nets selling costs and debt payoff", () => {
  const v = projectExit({ terminalNoiUsd: 100_000, exitCapRatePct: 8, sellingCostsPct: 2, debtPayoffUsd: 720_000 });
  assert.equal(v.grossExitValueUsd, 1_250_000); // 100k / 8%
  assert.equal(v.sellingCostsUsd, 25_000); // 2% of 1.25M
  assert.equal(v.debtPayoffUsd, 720_000);
  assert.equal(v.netSaleProceedsUsd, 505_000); // 1.25M − 25k − 720k
});

test("projectExit treats zero/null selling costs as zero", () => {
  assert.equal(projectExit({ terminalNoiUsd: 100_000, exitCapRatePct: 8, sellingCostsPct: 0, debtPayoffUsd: 0 }).netSaleProceedsUsd, 1_250_000);
  assert.equal(projectExit({ terminalNoiUsd: 100_000, exitCapRatePct: 8, sellingCostsPct: null, debtPayoffUsd: 0 }).sellingCostsUsd, 0);
});

// --- computeEquityCashFlows (EX-5: no double-count) --------------------------
test("computeEquityCashFlows negates initial equity and combines final CF + sale once", () => {
  const s = computeEquityCashFlows({ contributedEquityUsd: 325_000, annualCashFlowsBeforeTax: [46_000, 46_000, 46_000], netSaleProceedsUsd: 505_000 });
  assert.deepEqual(s, [-325_000, 46_000, 46_000, 551_000]); // final = 46k + 505k, ONCE
});

// --- leveredIrr (deterministic bisection) ------------------------------------
test("leveredIrr solves a simple doubling over 3 years to ~26%", () => {
  const irr = leveredIrr([-100_000, 0, 0, 200_000]); // (1+r)^3 = 2
  assert.ok(irr != null && irr > 25.5 && irr < 26.5, `expected ≈25.99%, got ${irr}`);
});

test("leveredIrr is negative for a loss and null when the series never changes sign", () => {
  const loss = leveredIrr([-100_000, 10_000, 10_000, 10_000]); // distributions < equity
  assert.ok(loss != null && loss < 0, `expected negative IRR, got ${loss}`);
  assert.equal(leveredIrr([-100_000]), null); // no positive flow ever ⇒ no root
  assert.equal(leveredIrr([-100_000, 0, 0, 0]), null);
});

// --- computeReturns (EX-4) ---------------------------------------------------
test("computeReturns derives multiple, profit, and distributions from the series", () => {
  const r = computeReturns([-325_000, 46_000, 46_000, 551_000], 325_000);
  assert.equal(r.totalDistributionsUsd, 643_000); // 46k + 46k + 551k
  assert.equal(r.totalProfitUsd, 318_000); // 643k − 325k
  assert.equal(r.equityMultiple, 1.98); // 643k / 325k, rounded
  assert.ok(r.leveredIrrPct != null && r.leveredIrrPct > 0);
});

test("computeReturns returns null multiple/IRR when there is no contributed equity", () => {
  const r = computeReturns([0, 46_000, 46_000, 551_000], 0);
  assert.equal(r.equityMultiple, null);
  assert.equal(r.leveredIrrPct, null);
  assert.equal(r.totalDistributionsUsd, 643_000); // still totals the distributions
});
