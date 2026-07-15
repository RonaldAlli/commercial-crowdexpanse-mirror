import { test } from "node:test";
import assert from "node:assert/strict";

import {
  classifyResolution,
  computePairFingerprint,
  propertyPairKey,
  type ResolutionEvidence,
  type ResolutionMatches,
} from "../../../lib/intelligence/property-resolution";

const EV: ResolutionEvidence = { anchors: { countyFipsCode: null, apnNormalized: null, addressNormalized: null }, externalIds: [] };
const matches = (over: Partial<ResolutionMatches> = {}): ResolutionMatches => ({ parcelIds: [], addrIds: [], xwalkTargets: [], ...over });

test("Tier 1A — a unique conflict-free parcel match resolves (UNIQUE_PARCEL)", () => {
  const out = classifyResolution(EV, matches({ parcelIds: ["p1"] }));
  assert.equal(out.tier, "1A");
  assert.equal(out.basis, "UNIQUE_PARCEL");
  assert.equal(out.targetPropertyId, "p1");
  assert.deepEqual(out.candidatePropertyIds, []);
});

test("Tier 1A — a unique external-identifier match with no parcel resolves (UNIQUE_EXTERNAL_IDENTIFIER)", () => {
  const out = classifyResolution(EV, matches({ xwalkTargets: ["p9"] }));
  assert.equal(out.tier, "1A");
  assert.equal(out.basis, "UNIQUE_EXTERNAL_IDENTIFIER");
  assert.equal(out.targetPropertyId, "p9");
});

test("Tier 1A — parcel + corroborating external id on the SAME property stays 1A (parcel basis wins)", () => {
  const out = classifyResolution(EV, matches({ parcelIds: ["p1"], xwalkTargets: ["p1"] }));
  assert.equal(out.tier, "1A");
  assert.equal(out.basis, "UNIQUE_PARCEL");
  assert.equal(out.targetPropertyId, "p1");
});

test("Tier 1A — a duplicated single target (dedup) still resolves", () => {
  const out = classifyResolution(EV, matches({ parcelIds: ["p1", "p1"], xwalkTargets: ["p1"] }));
  assert.equal(out.tier, "1A");
  assert.equal(out.targetPropertyId, "p1");
});

test("Tier 1A — a weak address disagreement alone does NOT block resolution", () => {
  // parcel → p1 (authoritative, unique); address → p2 (weak) is ignored for blocking.
  const out = classifyResolution(EV, matches({ parcelIds: ["p1"], addrIds: ["p2"] }));
  assert.equal(out.tier, "1A");
  assert.equal(out.targetPropertyId, "p1");
});

test("Tier 1B — two properties share the parcel key ⇒ PARCEL_CONFLICT candidates", () => {
  const out = classifyResolution(EV, matches({ parcelIds: ["p1", "p2"] }));
  assert.equal(out.tier, "1B");
  assert.equal(out.basis, "PARCEL_CONFLICT");
  assert.deepEqual([...out.candidatePropertyIds].sort(), ["p1", "p2"]);
  assert.equal(out.targetPropertyId, null);
});

test("Tier 1B — Decision A: parcel and external id disagree ⇒ downgrade (PARCEL_CONFLICT)", () => {
  const out = classifyResolution(EV, matches({ parcelIds: ["p1"], xwalkTargets: ["p2"] }));
  assert.equal(out.tier, "1B");
  assert.equal(out.basis, "PARCEL_CONFLICT");
  assert.deepEqual([...out.candidatePropertyIds].sort(), ["p1", "p2"]);
});

test("Tier 1B — two external ids disagree, no parcel ⇒ EXTERNAL_ID_CONFLICT", () => {
  const out = classifyResolution(EV, matches({ xwalkTargets: ["p3", "p4"] }));
  assert.equal(out.tier, "1B");
  assert.equal(out.basis, "EXTERNAL_ID_CONFLICT");
  assert.deepEqual([...out.candidatePropertyIds].sort(), ["p3", "p4"]);
});

test("Tier 2 — no authoritative target, exact in-jurisdiction address ⇒ ADDRESS_PROPOSAL", () => {
  const out = classifyResolution(EV, matches({ addrIds: ["p5"] }));
  assert.equal(out.tier, "2");
  assert.equal(out.basis, "ADDRESS_PROPOSAL");
  assert.deepEqual(out.candidatePropertyIds, ["p5"]);
  assert.equal(out.targetPropertyId, null);
});

test("Tier 2 — address is ignored entirely when an authoritative target exists", () => {
  // authoritative (external id → p1) present ⇒ never Tier 2 even with address matches.
  const out = classifyResolution(EV, matches({ xwalkTargets: ["p1"], addrIds: ["p5", "p6"] }));
  assert.equal(out.tier, "1A");
  assert.equal(out.targetPropertyId, "p1");
});

test("NONE — no matches at all ⇒ create a new canonical property", () => {
  const out = classifyResolution(EV, matches());
  assert.equal(out.tier, "NONE");
  assert.equal(out.basis, null);
  assert.equal(out.targetPropertyId, null);
  assert.deepEqual(out.candidatePropertyIds, []);
});

test("classification is PURE — identical inputs yield deeply-equal outputs, inputs untouched", () => {
  const m = matches({ parcelIds: ["p1"], addrIds: ["p2"], xwalkTargets: ["p1"] });
  const snapshot = JSON.stringify(m);
  const a = classifyResolution(EV, m);
  const b = classifyResolution(EV, m);
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(m), snapshot); // no mutation of the lookup input
});

test("propertyPairKey is canonical / order-independent", () => {
  assert.deepEqual(propertyPairKey("b", "a"), ["a", "b"]);
  assert.deepEqual(propertyPairKey("a", "b"), ["a", "b"]);
  assert.deepEqual(propertyPairKey("a", "b"), propertyPairKey("b", "a"));
});

test("computePairFingerprint is deterministic, order-independent, and basis/version sensitive", () => {
  const f1 = computePairFingerprint("va", "vb", "PARCEL_CONFLICT");
  assert.equal(f1, computePairFingerprint("va", "vb", "PARCEL_CONFLICT")); // deterministic
  assert.equal(f1, computePairFingerprint("vb", "va", "PARCEL_CONFLICT")); // order-independent
  assert.notEqual(f1, computePairFingerprint("va", "vb", "ADDRESS_PROPOSAL")); // basis-sensitive
  assert.notEqual(f1, computePairFingerprint("va", "vX", "PARCEL_CONFLICT")); // identity-change sensitive
  assert.equal(f1.length, 32);
});
