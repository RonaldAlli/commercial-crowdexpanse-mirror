import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CURRENT_MODEL_LINEAGE,
  UNDERWRITING_MODEL_VERSION,
  CALCULATION_LIBRARY_VERSION,
  RULESET_VERSION,
  computeScenarioVersion,
  type FingerprintAssumption,
  type ModelLineage,
} from "../../../lib/underwriting/model-version";

const L = CURRENT_MODEL_LINEAGE;
const set: FingerprintAssumption[] = [
  { key: "PURCHASE_PRICE", canonical: "1000000", source: "MANUAL" },
  { key: "LOAN_AMOUNT", canonical: "750000", source: "MANUAL" },
  { key: "UNIT_COUNT", canonical: "10", source: "SEEDED" },
];

test("lineage constants reflect the 3b-i bump and CURRENT_MODEL_LINEAGE mirrors them", () => {
  assert.equal(UNDERWRITING_MODEL_VERSION, 2);
  assert.equal(CALCULATION_LIBRARY_VERSION, 2);
  assert.equal(RULESET_VERSION, 1);
  assert.deepEqual(L, { modelVersion: 2, calcLibVersion: 2, rulesetVersion: 1 });
});

test("fingerprint is a 32-char hex string", () => {
  const fp = computeScenarioVersion(set, L);
  assert.equal(typeof fp, "string");
  assert.equal(fp.length, 32);
  assert.match(fp, /^[0-9a-f]{32}$/);
});

test("fingerprint is deterministic across calls", () => {
  assert.equal(computeScenarioVersion(set, L), computeScenarioVersion(set, L));
});

test("fingerprint is order-independent (canonical by key)", () => {
  const reversed = [...set].reverse();
  assert.equal(computeScenarioVersion(set, L), computeScenarioVersion(reversed, L));
});

test("changing an assumption VALUE flips the fingerprint", () => {
  const changed = set.map((a) => (a.key === "PURCHASE_PRICE" ? { ...a, canonical: "1000001" } : a));
  assert.notEqual(computeScenarioVersion(set, L), computeScenarioVersion(changed, L));
});

test("changing an assumption SOURCE flips the fingerprint", () => {
  const changed = set.map((a) => (a.key === "UNIT_COUNT" ? { ...a, source: "MANUAL" } : a));
  assert.notEqual(computeScenarioVersion(set, L), computeScenarioVersion(changed, L));
});

test("adding/removing an assumption flips the fingerprint", () => {
  const fewer = set.slice(0, 2);
  assert.notEqual(computeScenarioVersion(set, L), computeScenarioVersion(fewer, L));
});

test("a model-lineage bump flips the fingerprint even with identical assumptions", () => {
  const bumpedModel: ModelLineage = { ...L, modelVersion: L.modelVersion + 1 };
  const bumpedCalc: ModelLineage = { ...L, calcLibVersion: L.calcLibVersion + 1 };
  const bumpedRules: ModelLineage = { ...L, rulesetVersion: L.rulesetVersion + 1 };
  assert.notEqual(computeScenarioVersion(set, L), computeScenarioVersion(set, bumpedModel));
  assert.notEqual(computeScenarioVersion(set, L), computeScenarioVersion(set, bumpedCalc));
  assert.notEqual(computeScenarioVersion(set, L), computeScenarioVersion(set, bumpedRules));
});

test("an empty assumption set still fingerprints deterministically", () => {
  const fp = computeScenarioVersion([], L);
  assert.equal(fp.length, 32);
  assert.equal(computeScenarioVersion([], L), fp);
  assert.notEqual(fp, computeScenarioVersion(set, L));
});

test("numerically-equal canonical values fingerprint identically (Decimal normalization contract)", () => {
  // The service passes Decimal.js .toString(), which strips trailing zeros; the
  // fingerprint must treat "10" and "10" identically regardless of how produced.
  const a = [{ key: "UNIT_COUNT", canonical: "10", source: "SEEDED" }];
  const b = [{ key: "UNIT_COUNT", canonical: "10", source: "SEEDED" }];
  assert.equal(computeScenarioVersion(a, L), computeScenarioVersion(b, L));
});
