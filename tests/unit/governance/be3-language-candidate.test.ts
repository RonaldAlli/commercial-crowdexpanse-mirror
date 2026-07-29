import assert from "node:assert/strict";
import { test } from "node:test";

import { runCandidate, stableStringifyCandidate, type CandidateInput, type Finding } from "@/lib/governance/be3-language-candidate";

const ACCEPTED = {
  detectorVersion: "be3-detector-v1.0",
  ruleSetHash: "rs",
  scopeHash: "sc",
  measurementSeriesId: "ms",
  baselineTag: "be3-measurement-baseline-v1.0",
  findingIdentityVersion: "fiv-1",
};
const CUR_COMPAT = { detectorVersion: "be3-detector-v1.0", ruleSetHash: "rs", scopeHash: "sc", measurementSeriesId: "ms" };

function f(ruleId: string, file: string, line: number, matched: string, lId = "L0"): Finding {
  return { ruleId, lId, matched, file, line };
}
function mk(baseline: Finding[], current: Finding[], options?: CandidateInput["options"], accepted = ACCEPTED, curCompat = CUR_COMPAT): CandidateInput {
  return { current: { compat: curCompat, findings: current }, baseline: { findings: baseline }, accepted, options };
}

test("exact existing finding", () => {
  const r = runCandidate(mk([f("R-RET-001", "a.ts", 10, "lead")], [f("R-RET-001", "a.ts", 10, "lead")]));
  assert.equal(r.mode, "candidate");
  assert.equal(r.summary.existing, 1);
  assert.equal(r.summary["candidate-new"], 0);
});

test("line-only movement (consistent file shift) stays existing", () => {
  const r = runCandidate(mk(
    [f("R-RET-001", "a.ts", 10, "lead"), f("R-RET-001", "a.ts", 20, "lead")],
    [f("R-RET-001", "a.ts", 13, "lead"), f("R-RET-001", "a.ts", 23, "lead")],
  ));
  assert.equal(r.summary.existing, 2);
  assert.equal(r.summary.ambiguous, 0);
});

test("verified file rename → moved", () => {
  const r = runCandidate(mk(
    [f("R-RET-001", "old.ts", 10, "lead")],
    [f("R-RET-001", "new.ts", 10, "lead")],
    { renames: { "old.ts": "new.ts" } },
  ));
  assert.equal(r.summary.moved, 1);
  assert.equal(r.summary["candidate-new"], 0);
});

test("path canonicalization matches aliased paths → existing", () => {
  const r = runCandidate(mk(
    [f("R-RET-001", "/x/link/a.ts", 10, "lead")],
    [f("R-RET-001", "/x/real/a.ts", 10, "lead")],
    { aliases: { "/x/link/a.ts": "/x/real/a.ts" } },
  ));
  assert.equal(r.summary.existing, 1);
  assert.equal(r.summary["candidate-new"], 0);
});

test("count increase → one existing + one candidate-new", () => {
  const r = runCandidate(mk(
    [f("R-RET-001", "a.ts", 10, "lead")],
    [f("R-RET-001", "a.ts", 10, "lead"), f("R-RET-001", "a.ts", 30, "lead")],
  ));
  assert.equal(r.summary.existing, 1);
  assert.equal(r.summary["candidate-new"], 1);
});

test("count decrease → one existing + one resolved", () => {
  const r = runCandidate(mk(
    [f("R-RET-001", "a.ts", 10, "lead"), f("R-RET-001", "a.ts", 30, "lead")],
    [f("R-RET-001", "a.ts", 10, "lead")],
  ));
  assert.equal(r.summary.existing, 1);
  assert.equal(r.summary.resolved, 1);
});

test("count-stable remove-and-reintroduce → ambiguous", () => {
  const r = runCandidate(mk(
    [f("R-RET-001", "a.ts", 10, "lead"), f("R-SYN-003", "a.ts", 20, "source")],
    [f("R-SYN-003", "a.ts", 20, "source"), f("R-RET-001", "a.ts", 60, "lead")],
  ));
  // "source" unchanged → existing; "lead" jumped 10→60 against a 0 file shift → ambiguous.
  assert.equal(r.summary.ambiguous, 1);
  assert.equal(r.summary.existing, 1);
});

test("competing possible matches → ambiguous", () => {
  const r = runCandidate(mk(
    [f("R-RET-001", "a.ts", 10, "lead"), f("R-RET-001", "a.ts", 12, "lead")],
    [f("R-RET-001", "a.ts", 11, "lead")],
  ));
  assert.ok(r.summary.ambiguous > 0);
  assert.equal(r.summary.existing, 0);
  assert.equal(r.summary["candidate-new"], 0);
});

test("delete and recreate → ambiguous", () => {
  const r = runCandidate(mk(
    [f("R-RET-001", "a.ts", 10, "lead")],
    [f("R-RET-001", "a.ts", 10, "lead")],
    { recreatedFiles: ["a.ts"] },
  ));
  assert.equal(r.summary.ambiguous, 1);
  assert.equal(r.summary.existing, 0);
});

test("deterministic ordering (input shuffle → identical output)", () => {
  const base = [f("R-RET-001", "a.ts", 10, "lead"), f("R-SYN-003", "b.ts", 5, "source"), f("R-HOM-002", "c.ts", 7, "matchKey")];
  const cur = [f("R-SYN-003", "b.ts", 5, "source"), f("R-HOM-002", "c.ts", 7, "matchKey"), f("R-RET-001", "a.ts", 10, "lead")];
  const r1 = stableStringifyCandidate(runCandidate(mk(base, cur)));
  const r2 = stableStringifyCandidate(runCandidate(mk([...base].reverse(), [...cur].reverse())));
  assert.equal(r1, r2);
});

test("incompatible baseline → suspended, no classifications", () => {
  const r = runCandidate(mk([f("R-RET-001", "a.ts", 10, "lead")], [f("R-RET-001", "a.ts", 10, "lead")], undefined, ACCEPTED, { ...CUR_COMPAT, ruleSetHash: "DIFFERENT" }));
  assert.equal(r.mode, "suspended");
  assert.ok(r.compatibility.reasons.includes("ruleSetHash changed"));
  assert.equal(r.candidates.length, 0);
  // findingIdentityVersion mismatch also suspends
  const r2 = runCandidate(mk([f("R-RET-001", "a.ts", 10, "lead")], [f("R-RET-001", "a.ts", 10, "lead")], undefined, { ...ACCEPTED, findingIdentityVersion: "fiv-0" }));
  assert.equal(r2.mode, "suspended");
  assert.ok(r2.compatibility.reasons.includes("findingIdentityVersion changed"));
});

test("one-to-one enforcement: a baseline occurrence is consumed at most once", () => {
  // B=1, C=2 same key: the single baseline must match exactly one current; the other is candidate-new.
  const r = runCandidate(mk(
    [f("R-RET-001", "a.ts", 10, "lead")],
    [f("R-RET-001", "a.ts", 10, "lead"), f("R-RET-001", "a.ts", 11, "lead")],
  ));
  assert.equal(r.summary.existing, 1);          // baseline consumed once
  assert.equal(r.summary["candidate-new"], 1);  // extra current not matched to the same baseline
  assert.equal(r.summary.resolved, 0);
  // no baseline identity appears in more than one baseline-consuming record
  const consumed = r.candidates.filter((c) => ["existing", "moved", "ambiguous", "resolved"].includes(c.classification) && c.baselineIdentity);
  assert.equal(consumed.length, 1);
});
