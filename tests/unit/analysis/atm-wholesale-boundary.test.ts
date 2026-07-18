import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { computeAtmWholesaleCalculator, type AtmWholesaleCalculatorInputs } from "../../../lib/atm-wholesale-calculator";

// Wave 6 — ATM Wholesale boundary + edge cases. Tests EXISTING behavior: the calculator is a pure,
// advisory, no-persistence function that must never couple to the Underwriting kernel.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CALC_SRC = fs.readFileSync(path.join(HERE, "../../../lib/atm-wholesale-calculator.ts"), "utf8");

test("STRUCTURAL LOCK: the ATM calculator imports no prisma and no analysis kernel (advisory-only)", () => {
  // A regression here would mean ATM started reading/writing DB state or the deterministic
  // Underwriting engine — i.e. becoming a competing source of truth. Forbidden.
  const importLines = CALC_SRC.split("\n").filter((l) => /^\s*import\b/.test(l));
  for (const line of importLines) {
    assert.ok(!/prisma/i.test(line), `no prisma import (found: ${line.trim()})`);
    assert.ok(!/\banalysis\b/i.test(line), `no analysis-kernel import (found: ${line.trim()})`);
  }
  // Also: no direct DB/persistence calls in the module body.
  assert.ok(!/prisma\.|\.create\(|\.update\(|\.upsert\(|\.delete\(/.test(CALC_SRC), "no persistence calls");
});

// Base = all-zero inputs; override per case. Mirrors the workbook's zero state.
const base: AtmWholesaleCalculatorInputs = {
  propertyAddress: null, unitCount: 0, grossPotentialIncomeUsd: 0, vacancyLossUsd: 0,
  concessionsBadDebtLossToLeaseUsd: 0, otherIncomeUsd: 0, realEstateTaxesUsd: 0, insuranceUsd: 0,
  propertyManagementFeesUsd: 0, repairsMaintenanceUsd: 0, unitTurnCostsUsd: 0, utilitiesUsd: 0,
  trashUsd: 0, contractServicesUsd: 0, generalAdminUsd: 0, advertisingUsd: 0, payrollUsd: 0,
  areaCapRatePct: 0, sellerAskingPriceUsd: 0, downPaymentPct: 0, acquisitionCostsLoanFeesPct: 0,
  mortgageYears: 0, annualInterestRatePct: 0, estimatedRepairsUsd: 0, desiredWholesaleFeeUsd: 0,
};

test("zero gross potential income → 0% vacancy/concessions rates (no divide-by-zero)", () => {
  const o = computeAtmWholesaleCalculator({ ...base, vacancyLossUsd: 100, concessionsBadDebtLossToLeaseUsd: 50 });
  assert.equal(o.vacancyRatePct, 0);
  assert.equal(o.concessionsRatePct, 0);
});

test("zero area cap rate → initialPropertyValueUsd null; downstream stays safe", () => {
  const o = computeAtmWholesaleCalculator({ ...base, grossPotentialIncomeUsd: 120000, unitCount: 10, areaCapRatePct: 0 });
  assert.equal(o.initialPropertyValueUsd, null);
  assert.equal(o.downPaymentUsd, 0);
  assert.equal(o.loanAmountUsd, 0);
  assert.equal(o.cashOnCashReturnPct, null); // initialInvestment 0 → null, not NaN/Infinity
});

test("MAO = buy/hold price − desired wholesale fee", () => {
  const o = computeAtmWholesaleCalculator({
    ...base, grossPotentialIncomeUsd: 200000, otherIncomeUsd: 0, unitCount: 20,
    areaCapRatePct: 6, estimatedRepairsUsd: 25000, desiredWholesaleFeeUsd: 15000,
  });
  assert.notEqual(o.initialPropertyValueUsd, null);
  assert.equal(o.buyHoldBuyPriceUsd, Math.round((o.initialPropertyValueUsd! - 25000) * 100) / 100);
  assert.equal(o.maximumAllowableOfferUsd, Math.round((o.buyHoldBuyPriceUsd - 15000) * 100) / 100);
});

test("non-finite inputs are cleaned to 0 (no NaN leaks into outputs)", () => {
  const o = computeAtmWholesaleCalculator({ ...base, grossPotentialIncomeUsd: Number.NaN, unitCount: Number.POSITIVE_INFINITY, areaCapRatePct: 6 });
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === "number") assert.ok(Number.isFinite(v), `${k} is finite (got ${v})`);
  }
});
