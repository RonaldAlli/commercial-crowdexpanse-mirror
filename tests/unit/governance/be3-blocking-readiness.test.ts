import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import { evaluate, stableStringifyEvidence, type Corpus } from "@/lib/governance/be3-blocking-readiness";

const raw = readFileSync(resolve("docs/business/evolution/be-3/blocking-readiness/corpus.json"), "utf8");
const corpus = JSON.parse(raw) as Corpus;
const OPTS = { evaluatedAtActive: "2026-07-30", evaluatedAtExpired: "2026-08-02", corpusDigest: "digest" };

test("confusion matrix reports each class separately with expected corpus outcomes", () => {
  const ev = evaluate(corpus, OPTS);
  const c = ev.confusion;
  assert.equal(c.truePositives, 2); // genuine-new-drift, duplicate-addition
  assert.equal(c.trueNegatives, 4); // harmless-line-movement, file-rename, path-canonicalization, resolved-finding
  assert.equal(c.falsePositives, 0);
  assert.equal(c.silentFalseNegatives, 0); // no real drift was silently classified existing
  assert.equal(c.ambiguousFalseNegatives, 1); // reintroduced-violation surfaced as ambiguous (not silent)
  assert.equal(c.unclassified, 0);
});

test("reintroduced drift is surfaced (ambiguous), never a silent false negative", () => {
  const ev = evaluate(corpus, OPTS);
  const reintro = ev.confusion.byCase.find((x) => x.name === "reintroduced-violation");
  assert.equal(reintro?.outcome, "FN_ambiguous");
  assert.equal(ev.confusion.silentFalseNegatives, 0);
});

test("incompatible baseline suspends (no classification)", () => {
  const ev = evaluate(corpus, OPTS);
  const inc = ev.confusion.byCase.find((x) => x.name === "incompatible-baseline");
  assert.equal(inc?.mode, "suspended");
});

test("candidate-identity stability documents the classification-independence gap", () => {
  const ev = evaluate(corpus, OPTS);
  const s = ev.candidateIdentityStability;
  assert.equal(s.classificationIndependence, false); // the material gap
  assert.equal(s.repeats, true);
  assert.equal(s.pathCanonicalization, true);
  assert.equal(s.baselineEvolution, false);
});

test("exception simulation: at least one expires and one is revoked, both → candidate-new", () => {
  const ev = evaluate(corpus, OPTS);
  const outcomes = ev.exceptionSimulations.map((e) => e.outcome);
  assert.ok(outcomes.includes("expired→candidate-new"));
  assert.ok(outcomes.includes("revoked→candidate-new"));
  assert.ok(outcomes.some((o) => o.startsWith("active"))); // active exception suppresses (logged), never mutates baseline
});

test("compatibility suspension: all supported triggers suspend; gaps flagged", () => {
  const ev = evaluate(corpus, OPTS);
  const supported = ev.suspensionOutcomes.filter((s) => s.supported);
  assert.equal(supported.length, 5);
  assert.ok(supported.every((s) => s.result === "suspended"));
  assert.ok(ev.suspensionOutcomes.some((s) => s.trigger === "candidateIdentityVersion changed" && s.result === "not-wired"));
});

test("self-check deterministic and whole evidence reproducible", () => {
  const ev1 = evaluate(corpus, OPTS);
  const ev2 = evaluate(corpus, OPTS);
  assert.equal(ev1.selfCheck.deterministic, true);
  assert.equal(stableStringifyEvidence(ev1), stableStringifyEvidence(ev2));
});

test("no pass threshold is defined", () => {
  const ev = evaluate(corpus, OPTS);
  assert.match(ev.thresholdPolicy, /NONE/);
});
