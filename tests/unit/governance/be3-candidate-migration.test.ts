import assert from "node:assert/strict";
import { test } from "node:test";

import { evaluateMigration, stableStringifyMigration, type MigrationInput, type NewCandidate, type Linkage } from "@/lib/governance/be3-candidate-migration";

const nc = (ruleId: string, matched: string, path: string, anchor?: string): NewCandidate => ({ identity: { rule: { ruleId, lId: "L0" }, matched, path, contextAnchor: anchor ?? null } });
const lk = (oldId: string, newIndex: number, lineageStatus: Linkage["lineageStatus"]): Linkage => ({ oldId, newIndex, lineageStatus });
const run = (i: MigrationInput) => evaluateMigration(i);
const byOld = (i: MigrationInput) => { const m = new Map<string, ReturnType<typeof run>["mappings"][number][]>(); for (const x of run(i).mappings) (m.get(x.oldCandidateId) ?? m.set(x.oldCandidateId, []).get(x.oldCandidateId)!).push(x); return m; };

test("one-to-one (deterministic) → not reviewRequired", () => {
  const r = run({ old: [{ oldId: "civ1-a" }], new: [nc("R", "lead", "a.ts", "fn")], linkage: [lk("civ1-a", 0, "sameCandidate")] });
  assert.equal(r.mappings[0].mappingClassification, "oneToOne");
  assert.equal(r.mappings[0].reviewRequired, false);
  assert.ok(r.mappings[0].proposedNewIds[0]?.startsWith("C-civ2-"));
});
test("one-to-many (split) → review", () => {
  const r = run({ old: [{ oldId: "civ1-a" }], new: [nc("R", "lead", "a.ts", "fnA"), nc("R", "lead", "a.ts", "fnB")], linkage: [lk("civ1-a", 0, "split"), lk("civ1-a", 1, "split")] });
  assert.equal(r.mappings[0].mappingClassification, "oneToMany");
  assert.equal(r.mappings[0].reviewRequired, true);
  assert.equal(r.mappings[0].proposedNewIds.length, 2);
});
test("many-to-one (merge) → review; duplicate proposed new id across mappings", () => {
  const r = run({ old: [{ oldId: "civ1-a" }, { oldId: "civ1-b" }], new: [nc("R", "lead", "a.ts", "fn")], linkage: [lk("civ1-a", 0, "merged"), lk("civ1-b", 0, "merged")] });
  const cls = r.mappings.map((m) => m.mappingClassification);
  assert.deepEqual(cls, ["manyToOne", "manyToOne"]);
  assert.ok(r.mappings.every((m) => m.reviewRequired));
  assert.equal(r.mappings[0].proposedNewIds[0], r.mappings[1].proposedNewIds[0]); // same new id → duplicate
});
test("unmapped remains visible → review", () => {
  const r = run({ old: [{ oldId: "civ1-a" }], new: [], linkage: [] });
  assert.equal(r.mappings.length, 1);
  assert.equal(r.mappings[0].mappingClassification, "unmapped");
  assert.equal(r.mappings[0].reviewRequired, true);
  assert.deepEqual(r.mappings[0].proposedNewIds, []); // no fabricated id
});
test("ambiguous identity → ambiguous, no fabricated id", () => {
  const r = run({ old: [{ oldId: "civ1-a" }], new: [nc("R", "lead", "a.ts"), nc("R", "lead", "a.ts")], linkage: [lk("civ1-a", 0, "sameCandidate")] });
  assert.equal(r.mappings[0].mappingClassification, "ambiguous");
  assert.equal(r.mappings[0].reviewRequired, true);
  assert.deepEqual(r.mappings[0].proposedNewIds, [null]); // ambiguity not downgraded, no invented id
});
test("ambiguous lineage → ambiguous", () => {
  const r = run({ old: [{ oldId: "civ1-a" }], new: [nc("R", "lead", "a.ts", "fn")], linkage: [lk("civ1-a", 0, "ambiguous")] });
  assert.equal(r.mappings[0].mappingClassification, "ambiguous");
  assert.equal(r.mappings[0].reviewRequired, true);
});
test("unrelated lineage on a single link → surfaced for review (not silent one-to-one)", () => {
  const r = run({ old: [{ oldId: "civ1-a" }], new: [nc("R", "lead", "a.ts", "fn")], linkage: [lk("civ1-a", 0, "unrelated")] });
  assert.equal(r.mappings[0].reviewRequired, true);
});
test("duplicate old IDs → both appear, both reviewRequired (nothing disappears)", () => {
  const r = run({ old: [{ oldId: "dup" }, { oldId: "dup" }], new: [nc("R", "lead", "a.ts", "fn")], linkage: [lk("dup", 0, "sameCandidate")] });
  assert.equal(r.mappings.length, 2);
  assert.ok(r.mappings.every((m) => m.oldCandidateId === "dup" && m.reviewRequired && m.evidence.duplicateOldId));
});
test("every old candidate appears in output", () => {
  const r = run({ old: [{ oldId: "a" }, { oldId: "b" }, { oldId: "c" }], new: [nc("R", "x", "a.ts", "1")], linkage: [lk("a", 0, "sameCandidate")] });
  assert.deepEqual(r.mappings.map((m) => m.oldCandidateId).sort(), ["a", "b", "c"]);
});
test("shuffled input → byte-identical output", () => {
  const base: MigrationInput = { old: [{ oldId: "a" }, { oldId: "b" }], new: [nc("R", "lead", "a.ts", "fn1"), nc("R", "lead", "b.ts", "fn2")], linkage: [lk("a", 0, "sameCandidate"), lk("b", 1, "renamed")] };
  const shuffled: MigrationInput = { old: [{ oldId: "b" }, { oldId: "a" }], new: base.new, linkage: [lk("b", 1, "renamed"), lk("a", 0, "sameCandidate")] };
  assert.equal(stableStringifyMigration(run(base)), stableStringifyMigration(run(shuffled)));
});
test("repeated execution → identical", () => {
  const i: MigrationInput = { old: [{ oldId: "a" }], new: [nc("R", "lead", "a.ts", "fn")], linkage: [lk("a", 0, "sameCandidate")] };
  assert.equal(stableStringifyMigration(run(i)), stableStringifyMigration(run(i)));
});
test("append-only: old ids echoed unchanged; deterministic reviewQueue", () => {
  const r = run({ old: [{ oldId: "z" }, { oldId: "a" }], new: [], linkage: [] });
  assert.deepEqual(r.reviewQueue, ["a", "z"]); // sorted, deterministic; both unmapped
  assert.deepEqual(r.mappings.map((m) => m.oldCandidateId), ["a", "z"]);
});
test("immutability: frozen old + linkage inputs are not mutated", () => {
  const oldArr = Object.freeze([Object.freeze({ oldId: "a" })]) as any;
  const linkArr = Object.freeze([Object.freeze(lk("a", 0, "sameCandidate"))]) as any;
  const newArr = [nc("R", "lead", "a.ts", "fn")];
  assert.doesNotThrow(() => evaluateMigration({ old: oldArr, new: newArr, linkage: linkArr }));
  assert.equal(oldArr.length, 1);
  assert.equal(linkArr[0].oldId, "a");
});
test("statement present verbatim; no authority switch (report is inert)", () => {
  const r = run({ old: [{ oldId: "a" }], new: [nc("R", "lead", "a.ts", "fn")], linkage: [lk("a", 0, "sameCandidate")] });
  assert.equal(r.statement, "This tooling proposes mappings. It does not migrate authority.");
});
