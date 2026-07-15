import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CURRENT_MODEL_LINEAGE,
  UNDERWRITING_MODEL_VERSION,
  CALCULATION_LIBRARY_VERSION,
  RULESET_VERSION,
  computeScenarioVersion,
  type FingerprintAssumption,
  type FingerprintLine,
  type ModelLineage,
} from "../../../lib/underwriting/model-version";

const L = CURRENT_MODEL_LINEAGE;
const set: FingerprintAssumption[] = [
  { key: "PURCHASE_PRICE", canonical: "1000000", source: "MANUAL" },
  { key: "LOAN_AMOUNT", canonical: "750000", source: "MANUAL" },
  { key: "UNIT_COUNT", canonical: "10", source: "SEEDED" },
];

test("lineage constants reflect the 3b-ii bump and CURRENT_MODEL_LINEAGE mirrors them", () => {
  assert.equal(UNDERWRITING_MODEL_VERSION, 3);
  assert.equal(CALCULATION_LIBRARY_VERSION, 3);
  assert.equal(RULESET_VERSION, 1);
  assert.deepEqual(L, { modelVersion: 3, calcLibVersion: 3, rulesetVersion: 1 });
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

// --- Schedule line-item participation (3b-ii) -------------------------------
// Lines crafted to force every tie-break in the canonical comparator: two share
// kind+category (differ only by amount), one shares kind but not category, one
// differs by kind. Sorting this set exercises all three `||` operands.
const lines: FingerprintLine[] = [
  { kind: "INCOME", category: "Base Rent", canonical: "100000" },
  { kind: "INCOME", category: "Base Rent", canonical: "50000" },
  { kind: "INCOME", category: "Other Income", canonical: "40000" },
  { kind: "EXPENSE", category: "Taxes", canonical: "30000" },
];

test("adding a schedule flips the fingerprint versus the same assumptions with no schedule", () => {
  assert.notEqual(computeScenarioVersion(set, L), computeScenarioVersion(set, L, lines));
});

test("reordering schedule lines does NOT change the fingerprint (canonical, position-independent — UW-8)", () => {
  const reordered = [lines[3], lines[1], lines[0], lines[2]];
  assert.equal(computeScenarioVersion(set, L, lines), computeScenarioVersion(set, L, reordered));
});

test("changing a line AMOUNT (canonical), CATEGORY, or KIND each flips the fingerprint", () => {
  const base = computeScenarioVersion(set, L, lines);
  const amount = lines.map((l, i) => (i === 0 ? { ...l, canonical: "100001" } : l));
  const category = lines.map((l, i) => (i === 2 ? { ...l, category: "Parking" } : l));
  const kind = lines.map((l, i) => (i === 3 ? { ...l, kind: "INCOME" } : l));
  assert.notEqual(base, computeScenarioVersion(set, L, amount));
  assert.notEqual(base, computeScenarioVersion(set, L, category));
  assert.notEqual(base, computeScenarioVersion(set, L, kind));
});

test("numerically-equal canonical values fingerprint identically (Decimal normalization contract)", () => {
  // The service passes Decimal.js .toString(), which strips trailing zeros; the
  // fingerprint must treat "10" and "10" identically regardless of how produced.
  const a = [{ key: "UNIT_COUNT", canonical: "10", source: "SEEDED" }];
  const b = [{ key: "UNIT_COUNT", canonical: "10", source: "SEEDED" }];
  assert.equal(computeScenarioVersion(a, L), computeScenarioVersion(b, L));
});
