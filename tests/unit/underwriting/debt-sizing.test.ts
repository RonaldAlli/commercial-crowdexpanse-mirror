import { test } from "node:test";
import assert from "node:assert/strict";

import { sizeDebt, type DebtSizingInputs } from "../../../lib/underwriting/debt-sizing";

const base: DebtSizingInputs = {
  estimatedValueUsd: 1_000_000,
  allInCostUsd: 900_000,
  noiAnnualUsd: 100_000,
  interestRatePct: 0,
  amortizationYears: 30,
  targetLtvPct: null,
  targetLtcPct: null,
  minDscr: null,
};

test("no constraints → no sizing (3a behavior preserved)", () => {
  const r = sizeDebt(base);
  assert.deepEqual(r, {
    loanByLtvUsd: null,
    loanByLtcUsd: null,
    loanByDscrUsd: null,
    sizedLoanUsd: null,
    bindingConstraint: null,
  });
});

test("LTV constraint: loan = LTV% of estimated value", () => {
  const r = sizeDebt({ ...base, targetLtvPct: 75 });
  assert.equal(r.loanByLtvUsd, 750_000);
  assert.equal(r.sizedLoanUsd, 750_000);
  assert.equal(r.bindingConstraint, "LTV");
});

test("LTC constraint: loan = LTC% of all-in cost", () => {
  const r = sizeDebt({ ...base, targetLtcPct: 80 });
  assert.equal(r.loanByLtcUsd, 720_000);
  assert.equal(r.sizedLoanUsd, 720_000);
  assert.equal(r.bindingConstraint, "LTC");
});

test("DSCR constraint (zero rate): loan = (NOI / minDSCR) × amortization years", () => {
  // NOI 100k / 1.25 = 80k annual debt service; zero rate ⇒ principal = 80k × 30.
  const r = sizeDebt({ ...base, minDscr: 1.25 });
  assert.equal(r.loanByDscrUsd, 2_400_000);
  assert.equal(r.sizedLoanUsd, 2_400_000);
  assert.equal(r.bindingConstraint, "DSCR");
});

test("DSCR constraint (positive rate): inverts the amortizing payment, below the zero-rate figure", () => {
  const r = sizeDebt({ ...base, interestRatePct: 6, minDscr: 1.25 });
  // 80k target ADS at 6%/30yr ⇒ ~$1.11M principal: positive, and strictly below the
  // zero-rate figure (80k × 30 = 2.4M), because interest reduces supportable principal.
  assert.ok(r.loanByDscrUsd != null);
  assert.ok(r.loanByDscrUsd > 1_000_000 && r.loanByDscrUsd < 1_200_000);
  assert.ok(r.loanByDscrUsd < 2_400_000);
});

test("all three: sized loan is the minimum, binding constraint identified", () => {
  const r = sizeDebt({ ...base, targetLtvPct: 75, targetLtcPct: 80, minDscr: 1.25 });
  // LTV 750k, LTC 720k, DSCR 2.4M ⇒ min is LTC.
  assert.equal(r.sizedLoanUsd, 720_000);
  assert.equal(r.bindingConstraint, "LTC");
});

test("ties break in fixed order LTV → LTC → DSCR", () => {
  // Make LTV and LTC both 720k; LTV should win the tie.
  const r = sizeDebt({ ...base, estimatedValueUsd: 960_000, targetLtvPct: 75, targetLtcPct: 80 });
  assert.equal(r.loanByLtvUsd, 720_000);
  assert.equal(r.loanByLtcUsd, 720_000);
  assert.equal(r.bindingConstraint, "LTV");
});

test("degrades: LTV null without a value; DSCR null without NOI or amortization", () => {
  assert.equal(sizeDebt({ ...base, estimatedValueUsd: null, targetLtvPct: 75 }).loanByLtvUsd, null);
  assert.equal(sizeDebt({ ...base, noiAnnualUsd: null, minDscr: 1.25 }).loanByDscrUsd, null);
  assert.equal(sizeDebt({ ...base, amortizationYears: null, minDscr: 1.25 }).loanByDscrUsd, null);
  assert.equal(sizeDebt({ ...base, minDscr: 0, noiAnnualUsd: 100_000 }).loanByDscrUsd, null);
  assert.equal(sizeDebt({ ...base, targetLtvPct: 0 }).loanByLtvUsd, null);
});
