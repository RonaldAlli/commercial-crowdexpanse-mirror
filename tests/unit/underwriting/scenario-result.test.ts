import { test } from "node:test";
import assert from "node:assert/strict";

import { computeAnalysis } from "../../../lib/analysis";
import { assumptionsToAnalysisInputs, type ResolvedAssumption } from "../../../lib/underwriting/assumptions";
import { CURRENT_MODEL_LINEAGE, computeScenarioVersion } from "../../../lib/underwriting/model-version";
import { deriveScenarioResult } from "../../../lib/underwriting/scenario-result";

const L = CURRENT_MODEL_LINEAGE;

const resolved = (key: string, value: number, source = "MANUAL"): ResolvedAssumption => ({
  key: key as ResolvedAssumption["key"],
  value,
  source,
  canonical: String(value),
});

// Operating-only (3b-iii, CF-1): capital (loan/rate/amort + sizing) is owned by the
// FinancingCase now, not the Scenario, so the operating result is debt-free.
const full: ResolvedAssumption[] = [
  resolved("PURCHASE_PRICE", 1_000_000),
  resolved("RENOVATION_BUDGET", 50_000),
  resolved("CLOSING_COSTS", 25_000),
  resolved("GROSS_INCOME", 120_000),
  resolved("OPERATING_EXPENSES", 40_000),
  resolved("UNIT_COUNT", 10, "SEEDED"),
  resolved("ESTIMATED_VALUE", 1_200_000, "SEEDED"),
];

test("derived OPERATING metrics equal the unchanged kernel over the mapped inputs (debt-free)", () => {
  const { metrics } = deriveScenarioResult(full, [], L);
  assert.deepEqual(metrics, computeAnalysis(assumptionsToAnalysisInputs(full)));
  // Financing-dependent metrics are null on the operating result (they belong to the case).
  assert.equal(metrics.annualDebtServiceUsd, null);
  assert.equal(metrics.dscr, null);
  assert.equal(metrics.debtYieldPct, null);
});

test("derived scenarioVersion equals the standalone fingerprint of (canonical, source, lineage)", () => {
  const { scenarioVersion } = deriveScenarioResult(full, [], L);
  const expected = computeScenarioVersion(full, L);
  assert.equal(scenarioVersion, expected);
});

test("derivation is deterministic (same input → identical output)", () => {
  assert.deepEqual(deriveScenarioResult(full, [], L), deriveScenarioResult(full, [], L));
});

test("derive rejects an assumption set without a positive purchase price", () => {
  assert.throws(() => deriveScenarioResult([], [], L), /purchase price/i);
  const noPrice = full.filter((a) => a.key !== "PURCHASE_PRICE");
  assert.throws(() => deriveScenarioResult(noPrice, [], L), /purchase price/i);
});

test("an assumption change flips both the metrics and the fingerprint together", () => {
  const a = deriveScenarioResult(full, [], L);
  const changed = full.map((x) => (x.key === "GROSS_INCOME" ? { ...x, value: 130_000, canonical: "130000" } : x));
  const b = deriveScenarioResult(changed, [], L);
  assert.notEqual(a.scenarioVersion, b.scenarioVersion);
  assert.notEqual(a.metrics.noiAnnualUsd, b.metrics.noiAnnualUsd);
});

test("an income schedule overrides the scalar gross income and flips the fingerprint", () => {
  const lines = [
    { kind: "INCOME" as const, category: "Base Rent", amountAnnualUsd: 100_000, position: 0, canonical: "100000" },
    { kind: "INCOME" as const, category: "Other", amountAnnualUsd: 20_000, position: 1, canonical: "20000" },
  ];
  const withSchedule = deriveScenarioResult(full, lines, L);
  const scalar = deriveScenarioResult(full, [], L);
  // full has GROSS_INCOME 120k / OPEX 40k ⇒ NOI 80k; the income schedule sums to 120k
  // too, so NOI is unchanged, but the effective total is now schedule-sourced and the
  // fingerprint differs (a schedule is a different deterministic input than a scalar).
  assert.equal(withSchedule.effective.grossIncomeAnnualUsd, 120_000);
  assert.notEqual(withSchedule.scenarioVersion, scalar.scenarioVersion);
  // A reordered schedule is a presentation change ⇒ identical fingerprint.
  const reordered = [lines[1], { ...lines[0], position: 1 }];
  assert.equal(deriveScenarioResult(full, reordered, L).scenarioVersion, withSchedule.scenarioVersion);
});
