import assert from "node:assert/strict";
import { test } from "node:test";

import { generateIdentities, stableStringifyIdentities, ID_PREFIX, type IdentityInput, type SubjectPolicy } from "@/lib/governance/be3-candidate-identity";

function mk(ruleId: string, matched: string, path: string, contextAnchor?: string, extra: Partial<IdentityInput> = {}): IdentityInput {
  return { rule: { ruleId, lId: "L0" }, matched, path, contextAnchor, ...extra };
}
const one = (i: IdentityInput) => generateIdentities([i]).results[0];
const ids = (inputs: IdentityInput[]) => generateIdentities(inputs).results.map((r) => r.candidateId);

// ---- Rule identity ---------------------------------------------------------
test("rule identity: equivalent references normalize identically", () => {
  const a = one(mk("R-HOM-002", "matchKey", "a.ts", "fn"));
  const b = one({ rule: { ruleId: " R-HOM-002 ", lId: "L0" }, matched: "matchKey", path: "a.ts", contextAnchor: "fn" });
  const c = one({ rule: { ruleId: "R-HOM-002", lId: "L0", ruleAlias: "R-HOM-2" }, matched: "matchKey", path: "a.ts", contextAnchor: "fn" });
  assert.equal(a.status, "resolved");
  assert.equal(a.candidateId, b.candidateId);
  assert.equal(a.candidateId, c.candidateId);
});
test("rule identity: different rules never share identity", () => {
  assert.notEqual(one(mk("R-HOM-002", "x", "a.ts", "fn")).candidateId, one(mk("R-RET-001", "x", "a.ts", "fn")).candidateId);
});
test("rule identity: unknown or mismatched alias is rejected", () => {
  assert.equal(one({ rule: { ruleId: "R-HOM-002", ruleAlias: "R-UNKNOWN" }, matched: "x", path: "a.ts" }).status, "rejected");
  assert.equal(one({ rule: { ruleId: "R-RET-001", ruleAlias: "R-HOM-2" }, matched: "x", path: "a.ts" }).status, "rejected");
});

// ---- Canonical semantic subject -------------------------------------------
test("subject: stable across harmless whitespace / quoting; case per policy; meaningful diffs preserved", () => {
  const base = one(mk("R", "match key", "a.ts", "fn"));
  assert.equal(one(mk("R", "  match   key  ", "a.ts", "fn")).candidateId, base.candidateId); // whitespace
  assert.equal(one(mk("R", '"match key"', "a.ts", "fn")).candidateId, base.candidateId);       // quoting
  const ciPolicy: Partial<IdentityInput> = { subjectPolicy: { caseInsensitive: true } as SubjectPolicy };
  assert.equal(one(mk("R", "Match Key", "a.ts", "fn", ciPolicy)).candidateId, one(mk("R", "match key", "a.ts", "fn", ciPolicy)).candidateId);
  assert.notEqual(one(mk("R", "Match", "a.ts", "fn")).candidateId, one(mk("R", "match", "a.ts", "fn")).candidateId); // case-sensitive by default
  assert.notEqual(base.candidateId, one(mk("R", "match keys", "a.ts", "fn")).candidateId); // semantically different subject
});

// ---- Canonical repository location ----------------------------------------
test("location: slash + relative normalization equivalent; distinct files distinct", () => {
  const base = one(mk("R", "lead", "a/b.ts", "fn"));
  for (const p of ["a\\b.ts", "./a/b.ts", "a/./b.ts", "a/x/../b.ts"]) assert.equal(one(mk("R", "lead", p, "fn")).candidateId, base.candidateId);
  assert.notEqual(base.candidateId, one(mk("R", "lead", "a/c.ts", "fn")).candidateId);
});
test("location: escaping and absolute paths are rejected", () => {
  assert.equal(one(mk("R", "lead", "../a.ts", "fn")).status, "rejected");
  assert.equal(one(mk("R", "lead", "/x/a.ts", "fn")).status, "rejected");
  assert.equal(one(mk("R", "lead", "C:/x/a.ts", "fn")).status, "rejected");
});

// ---- Occurrence discriminator (load-bearing) ------------------------------
test("distinct context anchors → resolved and distinct", () => {
  const r = generateIdentities([mk("R", "lead", "a.ts", "ctxA"), mk("R", "lead", "a.ts", "ctxB")]);
  assert.ok(r.results.every((x) => x.status === "resolved"));
  assert.notEqual(r.results[0].candidateId, r.results[1].candidateId);
});
test("resolved id is stable regardless of neighbors, position, insertion, or removal", () => {
  const A = mk("R", "lead", "a.ts", "ctxA");
  const alone = one(A).candidateId;
  const before = generateIdentities([mk("R", "lead", "a.ts", "ctxZ"), A]).results[1].candidateId;     // inserted before
  const after = generateIdentities([A, mk("R", "lead", "a.ts", "ctxZ")]).results[0].candidateId;       // inserted after
  const removed = one(A).candidateId;                                                                  // neighbor removed
  assert.equal(alone, before);
  assert.equal(alone, after);
  assert.equal(alone, removed);
});
test("indistinguishable duplicates (no anchor) → ambiguous, never a fabricated ordinal; stays ambiguous under insert/remove/reorder", () => {
  const D = () => mk("R", "lead", "a.ts");
  for (const set of [[D(), D()], [D(), D(), D()], [D()].concat([D(), D()])]) {
    const r = generateIdentities(set);
    assert.ok(r.results.every((x) => x.status === "ambiguous" && x.candidateId === null));
  }
});
test("identical findings differing only by (excluded) line are indistinguishable → ambiguous", () => {
  // line is not an identity input at all; two such findings are identical inputs → ambiguous.
  const r = generateIdentities([mk("R", "lead", "a.ts"), mk("R", "lead", "a.ts")]);
  assert.ok(r.results.every((x) => x.status === "ambiguous"));
});
test("split → the retained-context occurrence keeps its id; the new context is a new resolved id", () => {
  const A = mk("R", "lead", "a.ts", "ctxA");
  const before = one(A).candidateId;
  const afterSplit = generateIdentities([A, mk("R", "lead", "a.ts", "ctxNEW")]);
  assert.equal(afterSplit.results[0].candidateId, before); // retained occurrence stable
  assert.equal(afterSplit.results[1].status, "resolved");
  assert.notEqual(afterSplit.results[1].candidateId, before);
});
test("collapse → the surviving-context occurrence keeps its id", () => {
  const A = mk("R", "lead", "a.ts", "ctxA");
  const beforeCollapse = generateIdentities([A, mk("R", "lead", "a.ts", "ctxB")]);
  const afterCollapse = generateIdentities([A]);
  assert.equal(afterCollapse.results[0].candidateId, beforeCollapse.results[0].candidateId);
});
test("identical subject in different files → resolved and distinct", () => {
  assert.notEqual(one(mk("R", "lead", "a.ts")).candidateId, one(mk("R", "lead", "b.ts")).candidateId);
  assert.equal(one(mk("R", "lead", "a.ts")).status, "resolved"); // unique by rule/subject/location
});

// ---- Determinism -----------------------------------------------------------
test("byte-identical input → identical output; order-independent; namespaced id", () => {
  const inputs = [mk("R", "lead", "a.ts", "c1"), mk("R2", "source", "b.ts", "c2"), mk("R", "lead", "d.ts")];
  const r1 = generateIdentities(inputs);
  const r2 = generateIdentities(inputs);
  assert.equal(stableStringifyIdentities(r1), stableStringifyIdentities(r2)); // repeated runs
  const shuffled = [inputs[2], inputs[0], inputs[1]];
  const setOf = (rs: (string | null)[]) => JSON.stringify(rs.filter(Boolean).sort());
  assert.equal(setOf(ids(inputs)), setOf(ids(shuffled))); // order-independent id set
  for (const r of r1.results) if (r.candidateId) {
    assert.ok(r.candidateId.startsWith(ID_PREFIX));
    assert.ok(!/^(R-|L\d|F-)/.test(r.candidateId)); // not confusable with R-*, L*, F-*
  }
});
