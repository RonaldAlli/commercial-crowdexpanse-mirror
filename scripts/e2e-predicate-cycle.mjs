// AC-GI2 (cycle) · E2 Slice B — PE-INV-9 acyclic-trace acceptance (evaluator cycle guard).
// A cyclic rule-set must TERMINATE and fail closed (CYCLE_DETECTED), never infinite-loop. A diamond (same
// predicate reached via two branches) is NOT a cycle. Uses a custom in-test registry; runs against *_test DB.
import { randomUUID } from "node:crypto";
import { assertTestDatabase } from "./e2e-guard.mjs";

import { prisma } from "../lib/prisma.ts";
import { buildFactGraph } from "../lib/pipeline-facts/fact-graph.ts";
import { evaluateArtifact } from "../lib/pipeline-predicates/evaluator.ts";

const TAG = "e2e-cycle";
const ORG = `${TAG}-${process.pid}`;
assertTestDatabase();
let ok = 0;
const fail = [];
const assert = (cond, msg) => { if (cond) { ok++; console.log(`  ✓ ${msg}`); } else { fail.push(msg); console.log(`  ✗ ${msg}`); } };

// A custom registry with cycles + a diamond. Predicates just forward their sub-evaluation's satisfied.
const forward = (childId) => (ctx) => ({ satisfied: ctx.evaluate(childId).satisfied, reasons: [], factsRelied: [], missing: [] });
const PREDS = {
  CYC_A: forward("CYC_B"),
  CYC_B: forward("CYC_A"),
  CYC_SELF: forward("CYC_SELF"),
  DIA_ROOT: (ctx) => { const l = ctx.evaluate("DIA_LEAF"); const r = ctx.evaluate("DIA_LEAF"); return { satisfied: l.satisfied && r.satisfied, reasons: [], factsRelied: [], missing: [] }; },
  DIA_LEAF: () => ({ satisfied: true, reasons: [{ code: "SATISFIED" }], factsRelied: [], missing: [] }),
};
const registry = { get: (id) => PREDS[id], has: (id) => id in PREDS };
const collect = (node, acc = []) => { acc.push(node); node.children.forEach((c) => collect(c, acc)); return acc; };

try {
  const graph = await buildFactGraph({ organizationId: ORG, opportunityId: `opp-${randomUUID()}`, versionContext: { policyVersion: "p", ruleSetVersion: "rs-x" } });
  const evalA = (id) => evaluateArtifact(id, { graph, ruleSetVersion: "rs-x", policyVersion: "p", registry });

  console.log("\n[1] PE-INV-9 · mutual cycle A→B→A terminates and fails closed:");
  const a = evalA("CYC_A"); // if this returns at all, it terminated (no infinite loop)
  assert(true, "evaluation TERMINATED (no infinite recursion)");
  assert(a.result.satisfied === false, "cyclic predicate resolves to satisfied:false (fail-closed)");
  const cycleNodes = collect(a.trace.root).filter((n) => n.reasons.some((r) => r.code === "CYCLE_DETECTED"));
  assert(cycleNodes.length >= 1, "the trace contains a CYCLE_DETECTED node where the path re-entered");

  console.log("\n[2] Self-cycle CYC_SELF terminates at depth with CYCLE_DETECTED:");
  const s = evalA("CYC_SELF");
  assert(s.result.satisfied === false, "self-referential predicate fails closed");
  assert(collect(s.trace.root).some((n) => n.reasons.some((r) => r.code === "CYCLE_DETECTED")), "self-cycle produces a CYCLE_DETECTED node");

  console.log("\n[3] Diamond is NOT a cycle — same predicate via two branches evaluates independently:");
  const d = evalA("DIA_ROOT");
  assert(d.result.satisfied === true, "DIA_ROOT satisfied — both DIA_LEAF branches evaluate normally");
  const leaves = d.trace.root.children.filter((c) => c.predicateId === "DIA_LEAF");
  assert(leaves.length === 2, "DIA_LEAF appears twice (once per branch) with no false CYCLE_DETECTED");
  assert(!collect(d.trace.root).some((n) => n.reasons.some((r) => r.code === "CYCLE_DETECTED")), "no cycle is falsely reported for a diamond");

  console.log("\n[4] Determinism preserved — a cyclic evaluation is still referentially transparent:");
  assert(JSON.stringify(evalA("CYC_A")) === JSON.stringify(a), "evaluateArtifact(cyclic) == evaluateArtifact(cyclic) (deterministic incl. trace)");

  console.log("\n[5] PE-INV-10 · path locality — interleaved evaluations do not carry state between them:");
  const b1 = evalA("CYC_B");
  evalA("CYC_A"); evalA("DIA_ROOT"); evalA("CYC_SELF"); // unrelated evaluations in between
  const b2 = evalA("CYC_B");
  assert(JSON.stringify(b1) === JSON.stringify(b2), "evaluating CYC_B is identical before and after other evaluations (no path carry-over)");
  assert(evalA("DIA_ROOT").result.satisfied === true, "a fresh evaluation starts with a clean path (unaffected by prior cyclic runs)");
} finally {
  await prisma.pipelineFact.deleteMany({ where: { organizationId: ORG } }).catch(() => {});
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
