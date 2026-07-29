import assert from "node:assert/strict";
import { test } from "node:test";

import { evaluateCompatibility, stableStringifyCompatibility, COMPATIBILITY_CONTRACT_VERSION, type CompatibilityFields } from "@/lib/governance/be3-compatibility-contract";

const ACCEPTED: CompatibilityFields = {
  findingIdentityVersion: "fiv-1",
  candidateIdentityVersion: "civ-2",
  classificationAlgorithmVersion: "cav-1",
  detectorVersion: "be3-detector-v1.0",
  ruleSetHash: "rs",
  scopeHash: "sc",
  measurementSeriesId: "ms",
  baselineTag: "be3-candidate-mode-v1.0",
};
const withField = (f: keyof CompatibilityFields, v: string): CompatibilityFields => ({ ...ACCEPTED, [f]: v });

test("fully compatible contract → proceed, no incompatibilities", () => {
  const r = evaluateCompatibility(ACCEPTED, { ...ACCEPTED });
  assert.equal(r.mode, "compatible");
  assert.equal(r.compatible, true);
  assert.equal(r.candidateEvaluation, "proceed");
  assert.equal(r.classification, null);
  assert.equal(r.incompatibilities.length, 0);
  assert.equal(r.contractVersion, COMPATIBILITY_CONTRACT_VERSION);
});

const singleMismatchCases: [keyof CompatibilityFields, string][] = [
  ["candidateIdentityVersion", "civ-3"],
  ["findingIdentityVersion", "fiv-0"],
  ["classificationAlgorithmVersion", "cav-2"],
  ["detectorVersion", "X"],
  ["ruleSetHash", "X"],
  ["scopeHash", "X"],
  ["measurementSeriesId", "X"],
  ["baselineTag", "X"],
];
for (const [field, val] of singleMismatchCases) {
  test(`single mismatch: ${field} → suspended with that field only`, () => {
    const r = evaluateCompatibility(ACCEPTED, withField(field, val));
    assert.equal(r.mode, "suspended");
    assert.equal(r.candidateEvaluation, "skipped");
    assert.equal(r.classification, "none");
    assert.equal(r.incompatibilities.length, 1);
    const inc = r.incompatibilities[0];
    assert.equal(inc.field, field);
    assert.equal(inc.expected, ACCEPTED[field]);
    assert.equal(inc.actual, val);
    assert.ok(r.reason && r.reason.includes(field));
  });
}

test("multiple simultaneous mismatches → all reported, deterministic precedence order", () => {
  // deliberately mutate in a non-precedence order; expect precedence-ordered output
  const current: CompatibilityFields = { ...ACCEPTED, baselineTag: "B", candidateIdentityVersion: "civ-9", detectorVersion: "D", measurementSeriesId: "M" };
  const r = evaluateCompatibility(ACCEPTED, current);
  assert.equal(r.mode, "suspended");
  assert.deepEqual(r.incompatibilities.map((i) => i.field), ["candidateIdentityVersion", "detectorVersion", "measurementSeriesId", "baselineTag"]);
  // reason names every incompatible field
  for (const f of ["candidateIdentityVersion", "detectorVersion", "measurementSeriesId", "baselineTag"]) assert.ok(r.reason!.includes(f));
});

test("precedence groups ordered identity-version → detector/rule/scope → measurement → baseline", () => {
  const current: CompatibilityFields = { ...ACCEPTED, findingIdentityVersion: "x", candidateIdentityVersion: "x", classificationAlgorithmVersion: "x", detectorVersion: "x", ruleSetHash: "x", scopeHash: "x", measurementSeriesId: "x", baselineTag: "x" };
  const r = evaluateCompatibility(ACCEPTED, current);
  assert.deepEqual(r.incompatibilities.map((i) => i.field), [
    "findingIdentityVersion", "candidateIdentityVersion", "classificationAlgorithmVersion",
    "detectorVersion", "ruleSetHash", "scopeHash", "measurementSeriesId", "baselineTag",
  ]);
  assert.deepEqual(r.incompatibilities.map((i) => i.group), [
    "identity-version", "identity-version", "identity-version",
    "detector-rule-scope", "detector-rule-scope", "detector-rule-scope",
    "measurement", "baseline",
  ]);
});

test("deterministic + repeated execution → identical output; pure (no id/baseline fields)", () => {
  const current = withField("candidateIdentityVersion", "civ-3");
  const a = stableStringifyCompatibility(evaluateCompatibility(ACCEPTED, current));
  const b = stableStringifyCompatibility(evaluateCompatibility(ACCEPTED, current));
  assert.equal(a, b);
  // suspension result carries no regenerated candidate IDs and no baseline payload
  const r = evaluateCompatibility(ACCEPTED, current);
  assert.ok(!("candidateId" in (r as object)) && !("baseline" in (r as object)) && !("candidates" in (r as object)));
});

test("suspension stops before classification: skipped + none, never a classification result", () => {
  const r = evaluateCompatibility(ACCEPTED, withField("candidateIdentityVersion", "civ-3"));
  assert.equal(r.candidateEvaluation, "skipped");
  assert.equal(r.classification, "none");
  // no field implies partial/best-effort classification occurred
  assert.equal((r as any).candidates, undefined);
});
