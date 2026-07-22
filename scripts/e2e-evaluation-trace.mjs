// AC-GI2 (trace) · E2 Slice B — EvaluationTrace / EvaluationArtifact acceptance (evaluator v1.1).
// Verifies the deterministic reasoning trace: shape, call tree, PE-INV-6 (trace determinism), PE-INV-7 (trace
// completeness), logical-only nodes, immutability. Runs against the *_test DB (auto-discovered by e2e-all).
import { randomUUID } from "node:crypto";
import { assertTestDatabase } from "./e2e-guard.mjs";

import { prisma } from "../lib/prisma.ts";
import { recordFact } from "../lib/pipeline-facts/service.ts";
import { buildFactGraph } from "../lib/pipeline-facts/fact-graph.ts";
import { evaluateArtifact } from "../lib/pipeline-predicates/evaluator.ts";

const TAG = "e2e-trace";
const ORG = `${TAG}-${process.pid}`;
const PV = "p1";
assertTestDatabase();
let ok = 0;
const fail = [];
const assert = (cond, msg) => { if (cond) { ok++; console.log(`  ✓ ${msg}`); } else { fail.push(msg); console.log(`  ✗ ${msg}`); } };
const newOpp = () => `opp-${randomUUID()}`;
const rf = (opp, factType, operation, extra = {}) => recordFact({ organizationId: ORG, opportunityId: opp, factType, operation, actorType: "HUMAN", ...extra });
const artifact = async (opp, predicateId) => {
  const graph = await buildFactGraph({ organizationId: ORG, opportunityId: opp, versionContext: { policyVersion: PV, ruleSetVersion: "rs-1" } });
  return evaluateArtifact(predicateId, { graph, ruleSetVersion: "rs-1", policyVersion: PV });
};
const NODE_KEYS = ["children", "factsRelied", "missing", "predicateId", "reasons", "satisfied"];
const collect = (node, acc = []) => { acc.push(node); node.children.forEach((c) => collect(c, acc)); return acc; };

try {
  console.log("\n[1] EvaluationArtifact shape + trace explains result:");
  const opp = newOpp();
  for (const k of ["t12", "rent_roll", "psa"]) await rf(opp, "DILIGENCE_MATERIAL_RECEIVED", "RECORD_EVIDENCE", { subjectKey: k });
  for (const c of ["inspection", "financing"]) await rf(opp, "CONTINGENCY_REMOVED", "DECLARE", { subjectKey: c });
  await rf(opp, "FINANCING", "DECLARE", { state: "CLEARED" });
  const a = await artifact(opp, "CLEAR_TO_CLOSE");
  assert(a.result && a.trace && a.trace.root, "artifact has { result, trace: { root } }");
  assert(a.trace.root.predicateId === "CLEAR_TO_CLOSE" && a.trace.root.satisfied === a.result.satisfied, "root node explains the result (predicateId + satisfied match)");
  assert(JSON.stringify(a.trace.root.reasons) === JSON.stringify(a.result.reasons), "PE-INV-7: every result reason appears in the trace root");

  console.log("\n[2] Call tree — composition through the evaluator is recorded:");
  const childIds = a.trace.root.children.map((c) => c.predicateId);
  assert(childIds.includes("DILIGENCE_COMPLETE"), "CLEAR_TO_CLOSE trace has a DILIGENCE_COMPLETE child node");
  const finOpp = newOpp();
  await rf(finOpp, "CONTRACT_EXECUTED", "DECLARE"); for (const c of ["inspection", "financing"]) await rf(finOpp, "CONTINGENCY_REMOVED", "DECLARE", { subjectKey: c }); await rf(finOpp, "SETTLEMENT_COMPLETED", "DECLARE"); await rf(finOpp, "FUNDS_DISBURSED", "RECORD_EVIDENCE", { payload: { recipient: "r", purpose: "SellerProceeds", amount: 1, obligation: "o" } }); await rf(finOpp, "FINANCING", "DECLARE", { state: "FUNDED" });
  const fin = await artifact(finOpp, "TRANSACTION_CLOSED.THIRD_PARTY_FINANCED");
  assert(fin.trace.root.children.some((c) => c.predicateId === "TRANSACTION_CLOSED.CASH"), "THIRD_PARTY_FINANCED trace nests the CASH core as a child");
  assert(fin.result.satisfied === true && fin.trace.root.satisfied === true, "financed positive closes and the trace agrees");

  console.log("\n[3] PE-INV-6 · trace determinism — identical inputs ⇒ identical (result, trace):");
  const a1 = await artifact(opp, "CLEAR_TO_CLOSE");
  const a2 = await artifact(opp, "CLEAR_TO_CLOSE");
  assert(JSON.stringify(a1) === JSON.stringify(a2), "evaluateArtifact(X) == evaluateArtifact(X) — trace included");

  console.log("\n[4] Logical-only nodes (no timestamps/durations/execution data):");
  const allNodes = collect(a.trace.root);
  const keysOk = allNodes.every((n) => JSON.stringify(Object.keys(n).sort()) === JSON.stringify(NODE_KEYS));
  assert(keysOk, "every TraceNode has exactly {predicateId,satisfied,reasons,factsRelied,missing,children} — no timing/exec fields");
  assert(allNodes.every((n) => n.factsRelied.every((x) => typeof x === "string")), "factsExamined are fact ids (logical), not query/exec details");

  console.log("\n[5] Immutability (trace is derived + disposable, never mutable business truth):");
  assert(Object.isFrozen(a) && Object.isFrozen(a.trace) && Object.isFrozen(a.trace.root) && Object.isFrozen(a.trace.root.children), "artifact, trace, root, children are frozen");
  let threw = false;
  try { a.trace.root.children.push(a.trace.root); } catch { threw = true; }
  assert(threw, "mutating a trace node's children throws (frozen)");

  console.log("\n[6] Negative-path trace still complete (explains WHY not satisfied):");
  const bad = newOpp();
  for (const k of ["t12", "rent_roll"]) await rf(bad, "DILIGENCE_MATERIAL_RECEIVED", "RECORD_EVIDENCE", { subjectKey: k }); // missing psa
  const b = await artifact(bad, "CLEAR_TO_CLOSE");
  assert(!b.result.satisfied, "unsatisfied when diligence incomplete");
  const dilNode = b.trace.root.children.find((c) => c.predicateId === "DILIGENCE_COMPLETE");
  assert(dilNode && dilNode.missing.includes("diligence:psa"), "the child DILIGENCE_COMPLETE node records the missing material (explainable)");

  console.log("\n[7] PE-INV-8 · trace locality — nodes hold only their own predicate + IMMEDIATE children:");
  // CLEAR_TO_CLOSE calls exactly one sub-predicate (DILIGENCE_COMPLETE); contingency/financing checks are not predicates.
  assert(JSON.stringify(a.trace.root.children.map((c) => c.predicateId)) === JSON.stringify(["DILIGENCE_COMPLETE"]), "CLEAR_TO_CLOSE node's children are exactly its immediate sub-evaluations");
  assert(a.trace.root.children[0].children.length === 0, "the DILIGENCE_COMPLETE child is a leaf — its (absent) grandchildren are not present");
  // THIRD_PARTY_FINANCED nests CASH as its ONLY immediate child; CASH's internals are not hoisted into the parent.
  assert(JSON.stringify(fin.trace.root.children.map((c) => c.predicateId)) === JSON.stringify(["TRANSACTION_CLOSED.CASH"]), "THIRD_PARTY_FINANCED node's children are exactly [CASH] — no subtree flattening");
  assert(!fin.trace.root.children.some((c) => c.predicateId === "DILIGENCE_COMPLETE"), "no descendant is hoisted above its actual call depth (locality preserved)");
} finally {
  console.log("\nCleaning up test facts (raw prisma test-infra)...");
  await prisma.pipelineFact.deleteMany({ where: { organizationId: ORG } }).catch((e) => console.log(`  cleanup warn: ${e.message}`));
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
