import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MATCH_WEIGHTS,
  scoreBuyerForOpportunity,
  type MatchBuyer,
  type MatchOpportunity,
} from "../../../lib/matching";

const fullBuyer: MatchBuyer = {
  targetAssetTypes: ["MULTIFAMILY"] as MatchBuyer["targetAssetTypes"],
  targetStates: ["GA", "FL"],
  minimumPurchaseUsd: 500_000,
  maximumPurchaseUsd: 2_000_000,
};
const fullOpp: MatchOpportunity = {
  assetType: "MULTIFAMILY" as MatchOpportunity["assetType"],
  state: "ga", // case-insensitive match
  valueUsd: 1_000_000,
};

test("a fully-matching, fully-specified deal scores 100", () => {
  const r = scoreBuyerForOpportunity(fullBuyer, fullOpp);
  assert.equal(r.score, 100);
  assert.equal(r.warnings.length, 0);
});

test("weights total 100", () => {
  const { assetType, state, price, completeness } = MATCH_WEIGHTS;
  assert.equal(assetType + state + price + completeness, 100);
});

test("asset-type mismatch drops the asset-type weight", () => {
  const r = scoreBuyerForOpportunity(fullBuyer, { ...fullOpp, assetType: "OFFICE" as MatchOpportunity["assetType"] });
  assert.equal(r.score, 100 - MATCH_WEIGHTS.assetType);
  assert.ok(r.reasons.some((x) => x.includes("not in buyer targets")));
});

test("state comparison is case/whitespace-insensitive", () => {
  const r = scoreBuyerForOpportunity({ ...fullBuyer, targetStates: [" fl "] }, { ...fullOpp, state: "FL" });
  assert.ok(r.reasons.some((x) => x.includes("in buyer target states")));
});

test("out-of-state drops the state weight", () => {
  const r = scoreBuyerForOpportunity(fullBuyer, { ...fullOpp, state: "TX" });
  assert.equal(r.score, 100 - MATCH_WEIGHTS.state);
});

test("value within range scores price; outside range does not", () => {
  const inRange = scoreBuyerForOpportunity(fullBuyer, { ...fullOpp, valueUsd: 500_000 });
  assert.ok(inRange.reasons.some((x) => x.includes("within buyer range")));
  const tooHigh = scoreBuyerForOpportunity(fullBuyer, { ...fullOpp, valueUsd: 3_000_000 });
  assert.equal(tooHigh.score, 100 - MATCH_WEIGHTS.price);
  assert.ok(tooHigh.reasons.some((x) => x.includes("outside buyer range")));
});

test("open-ended min/max still score in-range", () => {
  const noMax = scoreBuyerForOpportunity({ ...fullBuyer, maximumPurchaseUsd: null }, { ...fullOpp, valueUsd: 9_000_000 });
  assert.ok(noMax.reasons.some((x) => x.includes("within buyer range")));
  const noMin = scoreBuyerForOpportunity({ ...fullBuyer, minimumPurchaseUsd: null }, { ...fullOpp, valueUsd: 1 });
  assert.ok(noMin.reasons.some((x) => x.includes("within buyer range")));
});

test("missing buyer criteria produce warnings and go unscored", () => {
  const r = scoreBuyerForOpportunity(
    { targetAssetTypes: [], targetStates: [], minimumPurchaseUsd: null, maximumPurchaseUsd: null },
    { assetType: null, state: null, valueUsd: null },
  );
  // Every dimension unscored → only the completeness contribution (0 present /6).
  assert.equal(r.score, 0);
  assert.equal(r.warnings.length, 3);
});

test("missing opportunity fields warn independently of the buyer", () => {
  const r = scoreBuyerForOpportunity(fullBuyer, { assetType: null, state: "", valueUsd: null });
  assert.ok(r.warnings.some((w) => w.includes("no asset type")));
  assert.ok(r.warnings.some((w) => w.includes("no state")));
  assert.ok(r.warnings.some((w) => w.includes("no contract or estimated value")));
});

test("completeness scales with the number of present inputs", () => {
  // 2 of 6 inputs present (buyer asset types + states) → round(10 * 2/6) = 3.
  const r = scoreBuyerForOpportunity(
    { targetAssetTypes: ["MULTIFAMILY"] as MatchBuyer["targetAssetTypes"], targetStates: ["GA"], minimumPurchaseUsd: null, maximumPurchaseUsd: null },
    { assetType: null, state: null, valueUsd: null },
  );
  assert.ok(r.reasons.some((x) => x.includes("Data completeness 2/6 inputs (+3)")));
});

test("score is always an integer clamped to 0–100", () => {
  const r = scoreBuyerForOpportunity(fullBuyer, fullOpp);
  assert.ok(Number.isInteger(r.score) && r.score >= 0 && r.score <= 100);
});
