// AC-OWN1/STM/OPP3 · E4 Opportunity-Pipeline Projection acceptance suite (Phase 4).
// Verifies stage is projected by OBSERVING active Decision Facts (PR-INV-8/10), the frontier + completeness,
// the core inconsistency taxonomy, decision-survives-evaluation-change, and byte-identical artifact preservation.
// Runs against the *_test DB. Scope: presentation only — no eval/authorize/mutation of truth.
import { randomUUID } from "node:crypto";
import { assertTestDatabase } from "./e2e-guard.mjs";

import { prisma } from "../lib/prisma.ts";
import { recordFact, recordSupersession } from "../lib/pipeline-facts/service.ts";
import { buildFactGraph } from "../lib/pipeline-facts/fact-graph.ts";
import { evaluateArtifact } from "../lib/pipeline-predicates/evaluator.ts";
import { project } from "../lib/pipeline-projection/project.ts";
import { SS1 } from "../lib/pipeline-projection/spine.ts";

const TAG = "e2e-pproj";
const ORG = `${TAG}-${process.pid}`;
const VC = { policyVersion: "p1", ruleSetVersion: "rs-1" };
const POLICY = { projectionVersion: "pp-1", mutuallyExclusive: [["ASSIGNMENT_EXECUTED", "FINANCING"]] };
assertTestDatabase();
let ok = 0;
const fail = [];
const assert = (c, m) => { if (c) { ok++; console.log(`  ✓ ${m}`); } else { fail.push(m); console.log(`  ✗ ${m}`); } };
const newOpp = () => `opp-${randomUUID()}`;
const declare = (opp, factType, extra = {}) => recordFact({ organizationId: ORG, opportunityId: opp, factType, operation: "DECLARE", actorType: "HUMAN", ...extra });
const graphOf = (opp) => buildFactGraph({ organizationId: ORG, opportunityId: opp, versionContext: VC });
const proj = async (opp, artifacts = {}) => project({ spine: SS1, graph: await graphOf(opp), evaluationArtifacts: artifacts, projectionPolicy: POLICY });
const inc = (p, code) => p.explanation.inconsistencies.some((i) => i.code === code);

try {
  console.log("\n[1] AC-OWN1 · base LEAD:");
  const lead = newOpp();
  const p1 = await proj(lead);
  assert(p1.stage === "LEAD" && p1.completeness === "COMPLETE", "empty opportunity projects LEAD (base), COMPLETE");
  assert(p1.frontier[0].present && !p1.frontier[1].present, "frontier: LEAD present, further stages absent");

  console.log("\n[2] AC-OWN1 · each stage projected from its active Decision Fact (furthest wins):");
  const seq = newOpp();
  await declare(seq, "UNDERWRITING_APPROVED");
  assert((await proj(seq)).stage === "UNDERWRITTEN", "UNDERWRITING_APPROVED → UNDERWRITTEN");
  await declare(seq, "BUYER_MATCHED"); await declare(seq, "LOI_ACCEPTED");
  const ce = await declare(seq, "CONTRACT_EXECUTED");
  assert((await proj(seq)).stage === "UNDER_CONTRACT", "furthest active Decision Fact → UNDER_CONTRACT");

  console.log("\n[3] AC-OWN1 · regression — retracting a decision moves the stage back (OWN-1):");
  await recordSupersession(ORG, ce.id, { operation: "RETRACT", reason: "voided", actorType: "HUMAN" });
  assert((await proj(seq)).stage === "LOI_ACCEPTED", "retracting CONTRACT_EXECUTED regresses stage to LOI_ACCEPTED");

  console.log("\n[4] AC-STM · missing-predecessor + conflicting-successor (gap), stage still furthest:");
  const gap = newOpp();
  await declare(gap, "UNDERWRITING_APPROVED"); await declare(gap, "LOI_ACCEPTED"); // skip BUYER_MATCHED
  const pg = await proj(gap);
  assert(pg.stage === "LOI_ACCEPTED", "furthest active is LOI_ACCEPTED despite the gap (stage independent of inconsistency)");
  assert(inc(pg, "MISSING_PREDECESSOR") && inc(pg, "CONFLICTING_SUCCESSOR"), "MISSING_PREDECESSOR + CONFLICTING_SUCCESSOR reported");
  assert(pg.indicators.some((i) => i.code === "HAS_INCONSISTENCY"), "inconsistency surfaced as warn indicator (never changes stage — PR-INV-8)");

  console.log("\n[5] AC-STM · retracted-predecessor-surviving-successor:");
  const rp = newOpp();
  const ua = await declare(rp, "UNDERWRITING_APPROVED"); await declare(rp, "BUYER_MATCHED");
  await recordSupersession(ORG, ua.id, { operation: "RETRACT", reason: "reopened", actorType: "HUMAN" });
  const prp = await proj(rp);
  assert(prp.stage === "BUYER_MATCHED" && inc(prp, "RETRACTED_PREDECESSOR_SURVIVING_SUCCESSOR"), "successor survives predecessor retraction → inconsistency, stage stays BUYER_MATCHED");

  console.log("\n[6] AC-OPP3 · mutually-exclusive-active (policy-declared pair):");
  const mx = newOpp();
  await declare(mx, "ASSIGNMENT_EXECUTED"); await declare(mx, "FINANCING", { state: "FUNDED" });
  assert(inc(await proj(mx), "MUTUALLY_EXCLUSIVE_ACTIVE"), "two mutually-exclusive active decisions → MUTUALLY_EXCLUSIVE_ACTIVE");

  console.log("\n[7] AC-OWN1 · completeness reflects supporting-artifact presence (stage stands regardless):");
  const comp = newOpp();
  await declare(comp, "UNDERWRITING_APPROVED");
  assert((await proj(comp)).completeness === "PARTIAL", "active decision w/o supporting artifact → PARTIAL");
  const someArt = await evaluateArtifact("DILIGENCE_COMPLETE", { graph: await graphOf(comp), ruleSetVersion: "rs-1", policyVersion: "p1" });
  const pc = await proj(comp, { UNDERWRITING_APPROVED: someArt });
  assert(pc.completeness === "COMPLETE" && pc.stage === "UNDERWRITTEN", "supplying the supporting artifact → COMPLETE; stage unchanged");

  console.log("\n[8] AC-OWN1 · decision survives, evaluation changes, projection unchanged (PR-INV-10):");
  const surv = newOpp();
  for (const ft of ["UNDERWRITING_APPROVED", "BUYER_MATCHED", "LOI_ACCEPTED", "CONTRACT_EXECUTED", "CLEAR_TO_CLOSE"]) await declare(surv, ft);
  const ctcArt = await evaluateArtifact("CLEAR_TO_CLOSE", { graph: await graphOf(surv), ruleSetVersion: "rs-1", policyVersion: "p1" });
  assert(!ctcArt.result.satisfied, "CLEAR_TO_CLOSE predicate is NOT currently satisfied (eligibility changed since declaration)");
  const psurv = await proj(surv, { CLEAR_TO_CLOSE: ctcArt });
  assert(psurv.stage === "CLEAR_TO_CLOSE", "stage reflects the DECLARED decision, not current eligibility (projection observes facts)");
  assert(psurv.indicators.some((i) => i.code === "NEEDS_REVIEW"), "NEEDS_REVIEW raised as attention WITHOUT changing stage (models stay separate)");

  console.log("\n[9] PR-INV-7 · supporting artifact embedded byte-identical (no reinterpretation):");
  assert(JSON.stringify(psurv.evaluationArtifacts[0]) === JSON.stringify(ctcArt), "evaluationArtifacts embeds the supplied artifact byte-identical");
  assert(JSON.stringify(psurv.frontier.find((f) => f.stage === "CLEAR_TO_CLOSE").supportingArtifact) === JSON.stringify(ctcArt), "frontier entry carries the byte-identical supporting artifact");

  console.log("\n[10] Projection is deterministic + disposable — same graph ⇒ same projectionId; recomputes on change:");
  const rp2 = newOpp(); await declare(rp2, "UNDERWRITING_APPROVED");
  const a = await proj(rp2); const b = await proj(rp2);
  assert(a.projectionId === b.projectionId && a.stage === b.stage, "projectionId + stage reproducible for the same graph");
  const uaFact = (await graphOf(rp2)).activeByType("UNDERWRITING_APPROVED");
  await recordSupersession(ORG, uaFact.id, { operation: "RETRACT", reason: "reopened", actorType: "HUMAN" });
  const c = await proj(rp2);
  assert(c.stage === "LEAD" && c.projectionId !== a.projectionId, "after retraction: stage LEAD + a different projectionId (derived state recomputes — Law 4)");
} finally {
  await prisma.pipelineFact.deleteMany({ where: { organizationId: ORG } }).catch(() => {});
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
