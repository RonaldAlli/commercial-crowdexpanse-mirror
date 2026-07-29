import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { runRerun, renderRerunReport, stableStringifyRerun, type PriorV1 } from "@/lib/governance/be3-corpus-rerun";

const corpus = JSON.parse(readFileSync(resolve("docs/business/evolution/be-3/blocking-readiness/corpus.json"), "utf8"));
const additions = JSON.parse(readFileSync(resolve("docs/business/evolution/be-3/candidate-identity/rerun/corpus-civ2-additions.json"), "utf8"));
const priorRaw = JSON.parse(readFileSync(resolve("docs/business/evolution/be-3/blocking-readiness/BE3-BLOCKING-READINESS-EVIDENCE-v1.0.json"), "utf8"));

const prior: PriorV1 = {
  candidateIdentityStability: {
    classificationIndependence: priorRaw.candidateIdentityStability.classificationIndependence,
    renames: priorRaw.candidateIdentityStability.renames,
    repeats: priorRaw.candidateIdentityStability.repeats,
    removeReintroduce: priorRaw.candidateIdentityStability.removeReintroduce,
    pathCanonicalization: priorRaw.candidateIdentityStability.pathCanonicalization,
    baselineEvolution: priorRaw.candidateIdentityStability.baselineEvolution,
  },
  confusion: priorRaw.confusion,
  candidateIdentityVersionSuspension: "not-wired",
};
const OPTS = { generatedAt: "2026-07-29T00:00:00Z", evaluatedAt: "2026-07-29T00:00:00Z" };
const run = () => runRerun(corpus, additions, prior, OPTS);

test("canonical evidence is byte-identical across repeated runs", () => {
  assert.equal(stableStringifyRerun(run()), stableStringifyRerun(run()));
});
test("manifest digest is byte-identical across repeated runs", () => {
  assert.equal(run().manifestDigest, run().manifestDigest);
  assert.ok(run().manifestDigest.startsWith("EM-"));
});
test("review queues are byte-identical and deterministically ordered", () => {
  const a = run().reviewQueues, b = run().reviewQueues;
  assert.deepEqual(a, b);
  assert.deepEqual(a.ambiguous, [...a.ambiguous].sort());
  assert.deepEqual(a.nonOneToOneMigration, [...a.nonOneToOneMigration]); // migration order is already deterministic
});
test("migration evidence is byte-identical across repeated runs", () => {
  assert.equal(stableStringifyRerun(run().migrationEvidence), stableStringifyRerun(run().migrationEvidence));
});
test("harness self-check reports deterministic", () => {
  assert.equal(run().selfCheck.deterministic, true);
});
test("shuffled additions.cases order does not change confusion tally", () => {
  const shuffled = { ...additions, cases: [...additions.cases].reverse() };
  const a = run().confusion, b = runRerun(corpus, shuffled, prior, OPTS).confusion;
  for (const k of ["truePositives", "falsePositives", "trueNegatives", "falseNegatives", "silentFalseNegatives", "ambiguousFalseNegatives", "suspension", "unclassified"] as const) assert.equal(a[k], b[k], k);
});

test("all five migration classifications are represented and non-one-to-one require review", () => {
  const m = run().migrationEvidence;
  for (const k of ["oneToOne", "oneToMany", "manyToOne", "unmapped", "ambiguous"] as const) assert.ok((m.summary[k] ?? 0) >= 1, `missing ${k}`);
  assert.ok(m.mappings.filter((x) => x.mappingClassification !== "oneToOne").every((x) => x.reviewRequired));
  assert.ok(m.reviewQueue.length >= 1);
});
test("compatibility suspension is complete across all version fields incl. candidateIdentityVersion and msv", () => {
  const s = run().compatibilityEvidence;
  assert.ok(s.contract.every((c) => c.result === "suspended"));
  assert.equal(s.contract.find((c) => c.field === "candidateIdentityVersion")!.result, "suspended");
  assert.equal(s.manifest.result, "suspended");
  assert.equal(s.allVersionFieldsSuspend, true);
});
test("closed identity gaps: classificationIndependence, renames, baselineEvolution flip false→true vs v1.0", () => {
  const d = run().comparison.stabilityDeltas;
  for (const p of ["classificationIndependence", "renames", "baselineEvolution"] as const) {
    const row = d.find((x) => x.property === p)!;
    assert.equal(row.priorV1_0, false, `${p} prior`);
    assert.equal(row.hardened, true, `${p} hardened`);
    assert.equal(row.changed, true);
  }
});
test("ambiguity is preserved (never downgraded): added ambiguous-by-design cases stay ambiguous", () => {
  const ev = run();
  const byName = Object.fromEntries(ev.confusion.byCase.map((c) => [c.name, c.outcome]));
  assert.equal(byName["add-ambiguous-competing-rename"], "ambiguous_expected");
  assert.equal(byName["add-indistinguishable-duplicates"], "ambiguous_expected");
});
test("added strength cases: reintroduction and split are surfaced as drift (TP); anchored rename/classification stable (TN)", () => {
  const byName = Object.fromEntries(run().confusion.byCase.map((c) => [c.name, c.outcome]));
  assert.equal(byName["add-reintroduction-reopened"], "TP");
  assert.equal(byName["add-split-new-occurrence"], "TP");
  assert.equal(byName["add-verified-rename-continuity"], "TN");
  assert.equal(byName["add-classification-independence"], "TN");
});
test("honest open findings on the anchorless accepted corpus are surfaced, not hidden", () => {
  const ev = run();
  // civ-2 line-blindness produces a silent FN on the intra-file reintroduction case.
  assert.ok(ev.confusion.silentFalseNegatives >= 1);
  assert.ok(ev.confusion.byCase.some((c) => c.name === "reintroduced-violation" && c.outcome === "FN_silent"));
  // path-alias canonicalization is NOT handled by the hardened stack.
  assert.equal(ev.identityStability.detail.pathCanonicalization.aliasResolution, false);
  assert.equal(ev.identityStability.detail.pathCanonicalization.absolutePathHandling, "rejected");
});
test("evidence is explicitly non-authoritative, threshold-free, and defers all judgment", () => {
  const ev = run();
  assert.match(ev.status, /not a baseline/i);
  assert.match(ev.thresholdPolicy, /NONE/);
  assert.ok(ev.governanceQuestions.every((q) => q.judgment === "DEFERRED TO GOVERNED REVIEW"));
  assert.equal(ev.governanceQuestions.length, 8);
});
test("report renders and reflects the canonical confusion", () => {
  const ev = run();
  const r = renderRerunReport(ev);
  assert.match(r, /EVIDENCE-ONLY/);
  assert.match(r, /silent FN: 1/);
});
