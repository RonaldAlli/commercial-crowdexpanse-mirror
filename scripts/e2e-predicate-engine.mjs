// AC-GI2-* · E2 Slice B — Predicate Engine acceptance suite (Phase 4).
// Verifies the single side-effect-free evaluator + rs-1 predicates against PE-INV-1..4 and the AC-GI2 matrix
// (positive / negative / missing-evidence / wrong-version / regression / migration) per predicate. Runs against
// the *_test DB (auto-discovered by e2e-all). Scope: evaluation only — no projection / authz / mutation.
import { randomUUID } from "node:crypto";
import { assertTestDatabase } from "./e2e-guard.mjs";

import { prisma } from "../lib/prisma.ts";
import { recordFact, recordMigrationFact, recordSupersession } from "../lib/pipeline-facts/service.ts";
import { buildFactGraph } from "../lib/pipeline-facts/fact-graph.ts";
import { evaluatePredicate } from "../lib/pipeline-predicates/evaluator.ts";

const TAG = "e2e-pe";
const ORG = `${TAG}-${process.pid}`;
const PV = "p1";
assertTestDatabase();
let ok = 0;
const fail = [];
const assert = (cond, msg) => { if (cond) { ok++; console.log(`  ✓ ${msg}`); } else { fail.push(msg); console.log(`  ✗ ${msg}`); } };
const newOpp = () => `opp-${randomUUID()}`;

const rf = (opp, factType, operation, extra = {}) => recordFact({ organizationId: ORG, opportunityId: opp, factType, operation, actorType: "HUMAN", ...extra });
const evalP = async (opp, predicateId, rs = "rs-1") => {
  const graph = await buildFactGraph({ organizationId: ORG, opportunityId: opp, versionContext: { policyVersion: PV, ruleSetVersion: rs } });
  return evaluatePredicate(predicateId, { graph, ruleSetVersion: rs, policyVersion: PV });
};
const diligence = (opp, key) => rf(opp, "DILIGENCE_MATERIAL_RECEIVED", "RECORD_EVIDENCE", { subjectKey: key });
const contingency = (opp, key) => rf(opp, "CONTINGENCY_REMOVED", "DECLARE", { subjectKey: key });
const funds = (opp, purpose) => rf(opp, "FUNDS_DISBURSED", "RECORD_EVIDENCE", { payload: { recipient: "r", purpose, amount: 1, obligation: "o" } });

try {
  console.log("\n[1] AC-GI2 · DILIGENCE_COMPLETE — positive/negative/missing/wrong-version/regression/migration:");
  const dOk = newOpp();
  await diligence(dOk, "t12"); await diligence(dOk, "rent_roll"); await diligence(dOk, "psa");
  let r = await evalP(dOk, "DILIGENCE_COMPLETE");
  assert(r.satisfied && r.missing.length === 0, "positive: all required materials → satisfied");
  assert(r.factsRelied.length === 3, "factsRelied lists the 3 relied materials (traceability)");
  const dNo = newOpp();
  await diligence(dNo, "t12"); await diligence(dNo, "rent_roll");
  r = await evalP(dNo, "DILIGENCE_COMPLETE");
  assert(!r.satisfied && r.missing.includes("diligence:psa"), "missing-evidence: absent psa → unsatisfied, missing names it");
  r = await evalP(dOk, "DILIGENCE_COMPLETE", "rs-nope");
  assert(!r.satisfied && r.reasons[0].code === "UNKNOWN_PREDICATE", "wrong-version: unregistered rule-set → fail-closed UNKNOWN_PREDICATE");
  await rf(dOk, "LOI_DRAFTED", "DRAFT"); // unrelated
  r = await evalP(dOk, "DILIGENCE_COMPLETE");
  assert(r.satisfied, "regression: an unrelated later fact does not change the verdict");
  const dMig = newOpp();
  for (const k of ["t12", "rent_roll", "psa"]) await recordMigrationFact({ organizationId: ORG, opportunityId: dMig, factType: "DILIGENCE_MATERIAL_RECEIVED", operation: "RECORD_EVIDENCE", subjectKey: k, actorId: "migration:v1", reason: "backfill" });
  r = await evalP(dMig, "DILIGENCE_COMPLETE");
  assert(r.satisfied, "migration: migration-origin materials interpreted identically → satisfied");

  console.log("\n[2] AC-GI2 · CLEAR_TO_CLOSE — positive/negative + composition through the evaluator (PE-INV-1):");
  const cOk = newOpp();
  for (const k of ["t12", "rent_roll", "psa"]) await diligence(cOk, k);
  await contingency(cOk, "inspection"); await contingency(cOk, "financing");
  await rf(cOk, "FINANCING", "DECLARE", { state: "CLEARED" });
  r = await evalP(cOk, "CLEAR_TO_CLOSE");
  assert(r.satisfied, "positive: diligence complete ∧ contingencies removed ∧ financing CLEARED → satisfied");
  assert(r.factsRelied.length >= 6, "composition merged the sub-predicate's factsRelied (diligence facts present)");
  const cNo = newOpp();
  for (const k of ["t12", "rent_roll", "psa"]) await diligence(cNo, k);
  await contingency(cNo, "inspection");
  await rf(cNo, "FINANCING", "DECLARE", { state: "CLEARED" });
  r = await evalP(cNo, "CLEAR_TO_CLOSE");
  assert(!r.satisfied && r.missing.includes("contingency:financing"), "negative: a missing required contingency → unsatisfied");

  console.log("\n[3] AC-GI2 · TRANSACTION_CLOSED.CASH — positive/negative + decision-visibility on retraction:");
  const cashOk = newOpp();
  await rf(cashOk, "CONTRACT_EXECUTED", "DECLARE", { artifactVersion: "v1" });
  await contingency(cashOk, "inspection"); await contingency(cashOk, "financing");
  await rf(cashOk, "SETTLEMENT_COMPLETED", "DECLARE");
  await funds(cashOk, "SellerProceeds");
  r = await evalP(cashOk, "TRANSACTION_CLOSED.CASH");
  assert(r.satisfied, "positive: contract ∧ contingencies ∧ settlement ∧ funds(SellerProceeds) → closed");
  const cashNo = newOpp();
  await rf(cashNo, "CONTRACT_EXECUTED", "DECLARE"); await contingency(cashNo, "inspection"); await contingency(cashNo, "financing"); await rf(cashNo, "SETTLEMENT_COMPLETED", "DECLARE");
  r = await evalP(cashNo, "TRANSACTION_CLOSED.CASH");
  assert(!r.satisfied && r.missing.includes("FUNDS_DISBURSED:SellerProceeds"), "negative: no disbursement → unsatisfied");
  const contractFact = (await buildFactGraph({ organizationId: ORG, opportunityId: cashOk, versionContext: { policyVersion: PV, ruleSetVersion: "rs-1" } })).activeByType("CONTRACT_EXECUTED");
  await recordSupersession(ORG, contractFact.id, { operation: "RETRACT", reason: "contract voided", actorType: "HUMAN" });
  r = await evalP(cashOk, "TRANSACTION_CLOSED.CASH");
  assert(!r.satisfied && r.missing.includes("CONTRACT_EXECUTED"), "decision-visibility: a RETRACTed contract is absent-for-decision → no longer closed");

  console.log("\n[4] AC-GI2 · TRANSACTION_CLOSED.THIRD_PARTY_FINANCED — archetype composition (cash core ∧ FUNDED):");
  const finOk = newOpp();
  await rf(finOk, "CONTRACT_EXECUTED", "DECLARE"); await contingency(finOk, "inspection"); await contingency(finOk, "financing"); await rf(finOk, "SETTLEMENT_COMPLETED", "DECLARE"); await funds(finOk, "SellerProceeds");
  await rf(finOk, "FINANCING", "DECLARE", { state: "FUNDED" });
  r = await evalP(finOk, "TRANSACTION_CLOSED.THIRD_PARTY_FINANCED");
  assert(r.satisfied, "positive: cash core ∧ FINANCING FUNDED → closed");
  const finNo = newOpp();
  await rf(finNo, "CONTRACT_EXECUTED", "DECLARE"); await contingency(finNo, "inspection"); await contingency(finNo, "financing"); await rf(finNo, "SETTLEMENT_COMPLETED", "DECLARE"); await funds(finNo, "SellerProceeds");
  await rf(finNo, "FINANCING", "DECLARE", { state: "CLEARED" });
  r = await evalP(finNo, "TRANSACTION_CLOSED.THIRD_PARTY_FINANCED");
  assert(!r.satisfied && r.missing.includes("financing:FUNDED"), "negative: financing CLEARED but not FUNDED → unsatisfied");

  console.log("\n[5] AC-GI2 · TRANSACTION_CLOSED.ASSIGNMENT — archetype policy + typed payload purpose:");
  const asgOk = newOpp();
  await rf(asgOk, "CONTRACT_EXECUTED", "DECLARE"); await rf(asgOk, "ASSIGNMENT_EXECUTED", "DECLARE"); await funds(asgOk, "AssignmentFee");
  r = await evalP(asgOk, "TRANSACTION_CLOSED.ASSIGNMENT");
  assert(r.satisfied, "positive: contract ∧ assignment ∧ funds(AssignmentFee) → closed");
  const asgNo = newOpp();
  await rf(asgNo, "CONTRACT_EXECUTED", "DECLARE"); await funds(asgNo, "AssignmentFee");
  r = await evalP(asgNo, "TRANSACTION_CLOSED.ASSIGNMENT");
  assert(!r.satisfied && r.missing.includes("ASSIGNMENT_EXECUTED"), "negative: no assignment execution → unsatisfied");
  const asgWrongPurpose = newOpp();
  await rf(asgWrongPurpose, "CONTRACT_EXECUTED", "DECLARE"); await rf(asgWrongPurpose, "ASSIGNMENT_EXECUTED", "DECLARE"); await funds(asgWrongPurpose, "SellerProceeds");
  r = await evalP(asgWrongPurpose, "TRANSACTION_CLOSED.ASSIGNMENT");
  assert(!r.satisfied && r.missing.includes("FUNDS_DISBURSED:AssignmentFee"), "typed payload: wrong funds purpose does not satisfy an assignment");

  console.log("\n[6] Engine · PE-INV-2 referential transparency, determinism surface, fail-closed:");
  const rA = await evalP(cOk, "CLEAR_TO_CLOSE");
  const rB = await evalP(cOk, "CLEAR_TO_CLOSE");
  assert(JSON.stringify(rA) === JSON.stringify(rB), "PE-INV-2: evaluate(X) == evaluate(X) — identical result incl. evaluationId");
  assert(rA.evaluationId === rB.evaluationId, "evaluationId is deterministic (content-derived, not random)");
  assert(rA.determinismStamp.predicateVersion === "rs-1" && rA.determinismStamp.graphVersionContext.ruleSetVersion === "rs-1", "determinismStamp carries graph versionContext + predicate version");
  const unknown = await evalP(cOk, "NOPE_PREDICATE");
  assert(!unknown.satisfied && unknown.reasons[0].code === "UNKNOWN_PREDICATE", "fail-closed: an unknown predicate → satisfied:false");
} finally {
  console.log("\nCleaning up test facts (raw prisma test-infra)...");
  await prisma.pipelineFact.deleteMany({ where: { organizationId: ORG } }).catch((e) => console.log(`  cleanup warn: ${e.message}`));
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
