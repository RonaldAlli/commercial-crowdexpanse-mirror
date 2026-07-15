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

const full: ResolvedAssumption[] = [
  resolved("PURCHASE_PRICE", 1_000_000),
  resolved("RENOVATION_BUDGET", 50_000),
  resolved("CLOSING_COSTS", 25_000),
  resolved("GROSS_INCOME", 120_000),
  resolved("OPERATING_EXPENSES", 40_000),
  resolved("LOAN_AMOUNT", 750_000),
  resolved("INTEREST_RATE", 6),
  resolved("AMORTIZATION_YEARS", 30),
  resolved("UNIT_COUNT", 10, "SEEDED"),
  resolved("ESTIMATED_VALUE", 1_200_000, "SEEDED"),
];

test("derived metrics equal the unchanged kernel over the mapped inputs", () => {
  const { metrics } = deriveScenarioResult(full, L);
  assert.deepEqual(metrics, computeAnalysis(assumptionsToAnalysisInputs(full)));
});

test("derived scenarioVersion equals the standalone fingerprint of (canonical, source, lineage)", () => {
  const { scenarioVersion } = deriveScenarioResult(full, L);
  const expected = computeScenarioVersion(full, L);
  assert.equal(scenarioVersion, expected);
});

test("derivation is deterministic (same input → identical output)", () => {
  assert.deepEqual(deriveScenarioResult(full, L), deriveScenarioResult(full, L));
});

test("derive rejects an assumption set without a positive purchase price", () => {
  assert.throws(() => deriveScenarioResult([], L), /purchase price/i);
  const noPrice = full.filter((a) => a.key !== "PURCHASE_PRICE");
  assert.throws(() => deriveScenarioResult(noPrice, L), /purchase price/i);
});

test("an assumption change flips both the metrics and the fingerprint together", () => {
  const a = deriveScenarioResult(full, L);
  const changed = full.map((x) => (x.key === "GROSS_INCOME" ? { ...x, value: 130_000, canonical: "130000" } : x));
  const b = deriveScenarioResult(changed, L);
  assert.notEqual(a.scenarioVersion, b.scenarioVersion);
  assert.notEqual(a.metrics.noiAnnualUsd, b.metrics.noiAnnualUsd);
});
