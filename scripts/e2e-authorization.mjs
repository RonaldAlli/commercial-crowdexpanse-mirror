// AC-AUTH-* · E3 Authorization acceptance suite (Phase 4).
// Verifies the pure authorize() + commit-guard against the frozen §11a DENY taxonomy, decision/explanation split,
// and AUTH-INV-12/13/14. Every scenario asserts decision + deny grouping + explanation preservation — not just
// ALLOW/DENY. Runs against the *_test DB. Scope: permission only — no predicate eval / projection / mutation here.
import { randomUUID } from "node:crypto";
import { assertTestDatabase } from "./e2e-guard.mjs";

import { prisma } from "../lib/prisma.ts";
import { recordFact, recordSupersession } from "../lib/pipeline-facts/service.ts";
import { buildFactGraph } from "../lib/pipeline-facts/fact-graph.ts";
import { evaluateArtifact } from "../lib/pipeline-predicates/evaluator.ts";
import { authorize } from "../lib/pipeline-authorization/authorize.ts";
import { getPolicy } from "../lib/pipeline-authorization/policy.ts";
import { revalidateForCommit } from "../lib/pipeline-authorization/commit-guard.ts";

const TAG = "e2e-authz";
const ORG = `${TAG}-${process.pid}`;
const CTX = { policyVersion: "p1", ruleSetVersion: "rs-1" };
assertTestDatabase();
let ok = 0;
const fail = [];
const assert = (c, m) => { if (c) { ok++; console.log(`  ✓ ${m}`); } else { fail.push(m); console.log(`  ✗ ${m}`); } };
const newOpp = () => `opp-${randomUUID()}`;
const rf = (opp, factType, operation, extra = {}) => recordFact({ organizationId: ORG, opportunityId: opp, factType, operation, actorType: "HUMAN", ...extra });
const art = async (opp, predicateId, ctx = CTX) => {
  const graph = await buildFactGraph({ organizationId: ORG, opportunityId: opp, versionContext: ctx });
  return evaluateArtifact(predicateId, { graph, ruleSetVersion: ctx.ruleSetVersion, policyVersion: ctx.policyVersion });
};
const CAPS = ["DECLARE_DILIGENCE_COMPLETE", "DECLARE_CLEAR_TO_CLOSE", "DECLARE_TRANSACTION_CLOSED"];
const HUMAN_OK = { actorId: "u1", actorClass: "HUMAN", capabilities: CAPS, identityVersion: "v1" };
const HUMAN_NOCAP = { actorId: "u2", actorClass: "HUMAN", capabilities: [], identityVersion: "v1" };
const EXTERNAL_WITHCAP = { actorId: "svc", actorClass: "EXTERNAL_PRINCIPAL", capabilities: CAPS, identityVersion: "v1" };
const OP_DIL = { factType: "DILIGENCE_COMPLETE", factClass: "DECISION", op: "DECLARE" };
const POL_DIL = getPolicy("ap1-declare-diligence-complete");
const has = (d, code) => d.decision.denyCodes.includes(code);
const reason = (d, code) => d.explanation.policyReasons.some((r) => r.code === code);

try {
  console.log("\n[1] AC-AUTH · ALLOW — capability held, actor class allowed, precondition satisfied:");
  const dOk = newOpp();
  for (const k of ["t12", "rent_roll", "psa"]) await rf(dOk, "DILIGENCE_MATERIAL_RECEIVED", "RECORD_EVIDENCE", { subjectKey: k });
  const aOk = await art(dOk, "DILIGENCE_COMPLETE");
  const dec = authorize({ actor: HUMAN_OK, capability: "DECLARE_DILIGENCE_COMPLETE", operation: OP_DIL, policy: POL_DIL, evaluationArtifact: aOk });
  assert(dec.decision.allow && dec.decision.denyCodes.length === 0, "ALLOW with empty denyCodes");
  assert(typeof dec.decision.decisionId === "string" && dec.decision.decisionId.length === 32, "decision carries a deterministic decisionId");

  console.log("\n[2] AC-AUTH · explanation preservation (AUTH-INV-13) — embedded artifact is unchanged:");
  assert(JSON.stringify(dec.explanation.evaluationArtifact) === JSON.stringify(aOk), "the EvaluationArtifact is embedded byte-identical (never rewritten)");

  console.log("\n[3] AC-AUTH · DENY on failed business predicate → MISSING_REQUIRED_EVIDENCE (business group):");
  const dNo = newOpp();
  await rf(dNo, "DILIGENCE_MATERIAL_RECEIVED", "RECORD_EVIDENCE", { subjectKey: "t12" });
  const aNo = await art(dNo, "DILIGENCE_COMPLETE");
  const d3 = authorize({ actor: HUMAN_OK, capability: "DECLARE_DILIGENCE_COMPLETE", operation: OP_DIL, policy: POL_DIL, evaluationArtifact: aNo });
  assert(!d3.decision.allow && has(d3, "MISSING_REQUIRED_EVIDENCE"), "unsatisfied precondition denies with MISSING_REQUIRED_EVIDENCE");

  console.log("\n[4] AC-AUTH · DENY on missing capability → INSUFFICIENT_CAPABILITY (authorization group):");
  const d4 = authorize({ actor: HUMAN_NOCAP, capability: "DECLARE_DILIGENCE_COMPLETE", operation: OP_DIL, policy: POL_DIL, evaluationArtifact: aOk });
  assert(!d4.decision.allow && has(d4, "INSUFFICIENT_CAPABILITY") && reason(d4, "CAPABILITY_NOT_HELD"), "missing capability → INSUFFICIENT_CAPABILITY + CAPABILITY_NOT_HELD reason");

  console.log("\n[5] AC-AUTH · DENY on wrong actor class → INSUFFICIENT_CAPABILITY + ACTOR_CLASS_NOT_ALLOWED:");
  const d5 = authorize({ actor: EXTERNAL_WITHCAP, capability: "DECLARE_DILIGENCE_COMPLETE", operation: OP_DIL, policy: POL_DIL, evaluationArtifact: aOk });
  assert(!d5.decision.allow && has(d5, "INSUFFICIENT_CAPABILITY") && reason(d5, "ACTOR_CLASS_NOT_ALLOWED"), "wrong actor class mapped to frozen INSUFFICIENT_CAPABILITY (structured reason preserves detail)");

  console.log("\n[6] AC-AUTH · DENY on wrong version → VERSION_MISMATCH (business binding):");
  const aWrongRs = await art(dOk, "DILIGENCE_COMPLETE", { policyVersion: "p1", ruleSetVersion: "rs-2" });
  const d6 = authorize({ actor: HUMAN_OK, capability: "DECLARE_DILIGENCE_COMPLETE", operation: OP_DIL, policy: POL_DIL, evaluationArtifact: aWrongRs });
  assert(!d6.decision.allow && has(d6, "VERSION_MISMATCH") && reason(d6, "RULE_SET_MISMATCH"), "rule-set mismatch → VERSION_MISMATCH + RULE_SET_MISMATCH reason");
  const d6b = authorize({ actor: HUMAN_OK, capability: "DECLARE_DILIGENCE_COMPLETE", operation: OP_DIL, policy: POL_DIL, evaluationArtifact: await art(dOk, "CLEAR_TO_CLOSE") });
  assert(has(d6b, "VERSION_MISMATCH") && reason(d6b, "REQUIRED_PREDICATE_MISMATCH"), "wrong predicate artifact → VERSION_MISMATCH + REQUIRED_PREDICATE_MISMATCH");

  console.log("\n[7] AC-AUTH · DENY on migration op by non-MIGRATION_PRINCIPAL → MIGRATION_NOT_PERMITTED:");
  const d7 = authorize({ actor: HUMAN_OK, capability: "DECLARE_DILIGENCE_COMPLETE", operation: { ...OP_DIL, provenance: "MIGRATION_ORIGIN" }, policy: POL_DIL, evaluationArtifact: aOk });
  assert(!d7.decision.allow && has(d7, "MIGRATION_NOT_PERMITTED"), "migration-origin op by a HUMAN → MIGRATION_NOT_PERMITTED");

  console.log("\n[8] AC-AUTH · canonical deny ordering + accumulation (no-cap + wrong-version together):");
  const d8 = authorize({ actor: HUMAN_NOCAP, capability: "DECLARE_DILIGENCE_COMPLETE", operation: OP_DIL, policy: POL_DIL, evaluationArtifact: aWrongRs });
  assert(d8.decision.denyCodes.indexOf("INSUFFICIENT_CAPABILITY") < d8.decision.denyCodes.indexOf("VERSION_MISMATCH"), "denyCodes accumulate in canonical precedence (capability before version)");

  console.log("\n[9] AC-AUTH · determinism — same inputs ⇒ identical decision incl. decisionId:");
  const dA = authorize({ actor: HUMAN_OK, capability: "DECLARE_DILIGENCE_COMPLETE", operation: OP_DIL, policy: POL_DIL, evaluationArtifact: aOk });
  assert(JSON.stringify(dA) === JSON.stringify(dec), "authorize(X) == authorize(X)");
  const dOther = authorize({ actor: HUMAN_OK, capability: "DECLARE_CLEAR_TO_CLOSE", operation: { factType: "CLEAR_TO_CLOSE", factClass: "DECISION", op: "DECLARE" }, policy: getPolicy("ap1-declare-clear-to-close"), evaluationArtifact: await art(dOk, "CLEAR_TO_CLOSE") });
  assert(dOther.decision.decisionId !== dec.decision.decisionId, "different operation/capability ⇒ different decisionId (target identity included)");

  console.log("\n[10] AC-AUTH · TRANSACTION_CLOSED archetype (cash) ALLOW:");
  const cash = newOpp();
  await rf(cash, "CONTRACT_EXECUTED", "DECLARE"); for (const c of ["inspection", "financing"]) await rf(cash, "CONTINGENCY_REMOVED", "DECLARE", { subjectKey: c }); await rf(cash, "SETTLEMENT_COMPLETED", "DECLARE"); await rf(cash, "FUNDS_DISBURSED", "RECORD_EVIDENCE", { payload: { recipient: "r", purpose: "SellerProceeds", amount: 1, obligation: "o" } });
  const aCash = await art(cash, "TRANSACTION_CLOSED.CASH");
  const dCash = authorize({ actor: HUMAN_OK, capability: "DECLARE_TRANSACTION_CLOSED", operation: { factType: "TRANSACTION_CLOSED", factClass: "DECISION", op: "DECLARE" }, policy: getPolicy("ap1-declare-transaction-closed-cash"), evaluationArtifact: aCash });
  assert(dCash.decision.allow, "cash-closed opportunity authorizes DECLARE TRANSACTION_CLOSED");

  console.log("\n[11] AC-AUTH · commit guard (AUTH-INV-14) — valid when unchanged, STALE when graph changes:");
  const guardBase = { expectedDecisionId: dec.decision.decisionId, organizationId: ORG, opportunityId: dOk, actor: HUMAN_OK, capability: "DECLARE_DILIGENCE_COMPLETE", operation: OP_DIL, policy: POL_DIL, versionContext: CTX };
  const v1 = await revalidateForCommit(guardBase);
  assert(v1.valid && !v1.stale, "revalidate with unchanged graph → valid, not stale");
  const extra = await rf(dOk, "DILIGENCE_MATERIAL_RECEIVED", "RECORD_EVIDENCE", { subjectKey: "extra_doc" });
  const v2 = await revalidateForCommit(guardBase);
  assert(!v2.valid && v2.stale && v2.decision.decision.denyCodes.includes("STALE_FACT_GRAPH"), "graph changed after authorization → STALE_FACT_GRAPH, not valid (a prior ALLOW is not a lock)");
} finally {
  await prisma.pipelineFact.deleteMany({ where: { organizationId: ORG } }).catch(() => {});
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
