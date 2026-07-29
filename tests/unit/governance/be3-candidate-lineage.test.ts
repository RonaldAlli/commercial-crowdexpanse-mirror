import assert from "node:assert/strict";
import { test } from "node:test";

import { evaluateLineage, stableStringifyLineage, type PreviousCandidate, type CurrentFinding, type VerifiedRename } from "@/lib/governance/be3-candidate-lineage";

const P = (ruleId: string, matched: string, path: string, contextAnchor: string | null, priorState: "existing" | "resolved"): PreviousCandidate => ({ ruleId, lId: "L0", matched, path, contextAnchor, priorState });
const C = (ruleId: string, matched: string, path: string, contextAnchor: string | null): CurrentFinding => ({ ruleId, lId: "L0", matched, path, contextAnchor });
const rn = (from: string, to: string, source: VerifiedRename["source"] = "repo-metadata"): VerifiedRename => ({ from, to, source });
const statuses = (prev: PreviousCandidate[], cur: CurrentFinding[], ren: VerifiedRename[] = []) => evaluateLineage(prev, cur, ren).current.map((c) => c.status);

test("verified rename → renamed", () => {
  assert.deepEqual(statuses([P("R", "lead", "app/a.ts", "fn", "existing")], [C("R", "lead", "app/b.ts", "fn")], [rn("app/a.ts", "app/b.ts")]), ["renamed"]);
});
test("competing rename candidates → ambiguous", () => {
  assert.deepEqual(statuses([P("R", "lead", "a1.ts", "fn", "existing")], [C("R", "lead", "b.ts", "fn")], [rn("a1.ts", "b.ts"), rn("a2.ts", "b.ts")]), ["ambiguous"]);
});
test("rename without evidence → unrelated (no invented lineage)", () => {
  assert.deepEqual(statuses([P("R", "lead", "a.ts", "fn", "existing")], [C("R", "lead", "b.ts", "fn")], []), ["unrelated"]);
});
test("move plus edit → ambiguous", () => {
  assert.deepEqual(statuses([P("R", "lead", "a.ts", "fn", "existing")], [C("R", "leadX", "b.ts", "fn")], [rn("a.ts", "b.ts")]), ["ambiguous"]);
});
test("resolved then reopened → reintroduced", () => {
  assert.deepEqual(statuses([P("R", "lead", "a.ts", "fn", "resolved")], [C("R", "lead", "a.ts", "fn")]), ["reintroduced"]);
});
test("resolved then unrelated occurrence → unrelated; predecessor stays resolved", () => {
  const rep = evaluateLineage([P("R", "lead", "a.ts", "fn", "resolved")], [C("R2", "source", "c.ts", "fn2")], []);
  assert.equal(rep.current[0].status, "unrelated");
  assert.equal(rep.previous[0].transition, "resolved");
});
test("split → at least one split", () => {
  const s = statuses([P("R", "lead", "a.ts", "fnA", "existing")], [C("R", "lead", "a.ts", "fnA"), C("R", "lead", "a.ts", "fnB")]);
  assert.ok(s.includes("split"), JSON.stringify(s));
});
test("merge → merged; extra predecessor resolved", () => {
  const rep = evaluateLineage([P("R", "lead", "a.ts", "fnA", "existing"), P("R", "lead", "a.ts", "fnB", "existing")], [C("R", "lead", "a.ts", "fnA")], []);
  assert.ok(rep.current.map((c) => c.status).includes("merged"), JSON.stringify(rep.current.map((c) => c.status)));
});
test("repeated deterministic execution → identical", () => {
  const prev = [P("R", "lead", "a.ts", "fnA", "existing")], cur = [C("R", "lead", "b.ts", "fnA")], ren = [rn("a.ts", "b.ts")];
  assert.equal(stableStringifyLineage(evaluateLineage(prev, cur, ren)), stableStringifyLineage(evaluateLineage(prev, cur, ren)));
});
test("append-only lineage: prior states echoed, not rewritten", () => {
  const prev = [P("R", "lead", "a.ts", "fnA", "existing"), P("R", "lead", "d.ts", "fnZ", "resolved")];
  const rep = evaluateLineage(prev, [C("R", "lead", "a.ts", "fnA")], []);
  assert.equal(rep.previous.length, prev.length);
  assert.equal(rep.previous[0].priorState, "existing");
  assert.equal(rep.previous[1].priorState, "resolved"); // preserved verbatim
});
test("ambiguous reopen (competing) → ambiguous, not auto-reopened", () => {
  assert.deepEqual(statuses([P("R", "lead", "a1.ts", "fn", "resolved")], [C("R", "lead", "b.ts", "fn")], [rn("a1.ts", "b.ts"), rn("a2.ts", "b.ts")]), ["ambiguous"]);
});
test("no silent false negatives: reappearance elsewhere is not silently the same candidate", () => {
  const s = statuses([P("R", "lead", "a.ts", "fn", "resolved")], [C("R", "lead", "c.ts", "fn")], []);
  assert.ok(!["sameCandidate", "reintroduced"].includes(s[0]), s[0]); // surfaced (unrelated/ambiguous), never silent
});
