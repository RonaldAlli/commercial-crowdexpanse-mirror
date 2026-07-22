// AC-FG-* · E2 Slice A — Fact Graph Builder acceptance suite (Phase 4).
// Verifies the single authoritative ledger interpretation against FG-INV-1..11 and Constitution Law 12.
// Runs against the *_test DB (auto-discovered by e2e-all.mjs). Slice A is not "done" until these pass
// (Law 11). Scope: interpretation only — no predicate eval / projection / authorization here.
import { randomUUID } from "node:crypto";
import { assertTestDatabase } from "./e2e-guard.mjs";

import { prisma } from "../lib/prisma.ts";
import { recordFact, recordSupersession, recordMigrationFact, activeFacts, reconstructHistory } from "../lib/pipeline-facts/service.ts";
import { buildFactGraph, FactGraph, STRUCTURAL_CONTEXT } from "../lib/pipeline-facts/fact-graph.ts";

const TAG = "e2e-fg";
const ORG = `${TAG}-${process.pid}`;
assertTestDatabase();
let ok = 0;
const fail = [];
const assert = (cond, msg) => { if (cond) { ok++; console.log(`  ✓ ${msg}`); } else { fail.push(msg); console.log(`  ✗ ${msg}`); } };
const newOpp = () => `opp-${randomUUID()}`;
const CTX = { policyVersion: "p1", ruleSetVersion: "r1" };
const build = (opp, ctx = CTX) => buildFactGraph({ organizationId: ORG, opportunityId: opp, versionContext: ctx });

try {
  console.log("\n[1] AC-FG-P1 · FG-INV-1/9 — one reconstruction, ledger-only, authoritative order:");
  const opp1 = newOpp();
  const s1 = await recordFact({ organizationId: ORG, opportunityId: opp1, factType: "LOI_DRAFTED", operation: "DRAFT", actorType: "HUMAN" });
  const s2 = await recordFact({ organizationId: ORG, opportunityId: opp1, factType: "LOI_SENT", operation: "DRAFT", actorType: "HUMAN" });
  const g1 = await build(opp1);
  assert(g1 instanceof FactGraph, "buildFactGraph returns a first-class FactGraph object");
  const gHist = g1.history.map((f) => f.id);
  const rHist = (await reconstructHistory(ORG, opp1)).map((f) => f.id);
  assert(JSON.stringify(gHist) === JSON.stringify(rHist), "graph.history equals reconstructHistory order (globalSequence asc)");
  assert(gHist[0] === s1.id && gHist[1] === s2.id, "history preserves ledger order");

  console.log("\n[2] AC-FG-P2 · FG-INV-2 — one supersession resolution (byChain active/asserted):");
  const opp2 = newOpp();
  const a = await recordFact({ organizationId: ORG, opportunityId: opp2, factType: "BUYER_MATCHED", operation: "DECLARE", actorType: "HUMAN", payload: { note: "v1" } });
  const b = await recordSupersession(ORG, a.id, { operation: "CORRECT", reason: "fix note", actorType: "HUMAN", payload: { note: "v2" } });
  const g2 = await build(opp2);
  const chain = g2.byChain(a.factChainId);
  assert(chain.all.length === 2, "byChain returns the full lineage (both rows)");
  assert(chain.active?.id === b.id, "the active tip is the corrected row");
  assert(chain.asserted?.id === b.id, "the asserted fact is the corrected row (CORRECT still asserts)");
  assert(g2.isActive(b.id) && !g2.isActive(a.id), "isActive: tip active, prior superseded");

  console.log("\n[3] AC-FG-P3/N2 · FG-INV-3 — active-fact calc + corrected active member via activeByType:");
  assert(g2.activeFacts.length === 1 && g2.activeFacts[0].id === b.id, "activeFacts is the unsuperseded set (the corrected row)");
  const active = g2.activeByType("BUYER_MATCHED");
  assert(active?.id === b.id && active?.payload?.note === "v2", "activeByType exposes the CORRECTED active member (payload v2)");

  console.log("\n[4] AC-FG-P4 · FG-INV-4 — one collection aggregation across subjectKeys (+ withdrawal removes):");
  const opp4 = newOpp();
  await recordFact({ organizationId: ORG, opportunityId: opp4, factType: "DILIGENCE_MATERIAL_RECEIVED", operation: "RECORD_EVIDENCE", actorType: "HUMAN", subjectKey: "t12" });
  const rr = await recordFact({ organizationId: ORG, opportunityId: opp4, factType: "DILIGENCE_MATERIAL_RECEIVED", operation: "RECORD_EVIDENCE", actorType: "HUMAN", subjectKey: "rent_roll" });
  let g4 = await build(opp4);
  let coll = g4.collection("DILIGENCE_MATERIAL_RECEIVED");
  assert(coll.keys.has("t12") && coll.keys.has("rent_roll") && coll.keys.size === 2, "collection aggregates both subjectKeys");
  await recordSupersession(ORG, rr.id, { operation: "INVALIDATE", reason: "rent roll withdrawn", actorType: "HUMAN" });
  g4 = await build(opp4);
  coll = g4.collection("DILIGENCE_MATERIAL_RECEIVED");
  assert(coll.keys.has("t12") && !coll.keys.has("rent_roll") && coll.keys.size === 1, "an INVALIDATE tip removes that subjectKey (absent-for-decision)");

  console.log("\n[5] AC-FG-P5 · FG-INV-5 — version resolution (accepted artifactVersion) + context stamped:");
  const opp5 = newOpp();
  await recordFact({ organizationId: ORG, opportunityId: opp5, factType: "LOI_ACCEPTED", operation: "DECLARE", actorType: "HUMAN", artifactVersion: "v2" });
  const g5 = await build(opp5, { policyVersion: "pX", ruleSetVersion: "rX", artifactVersion: "v2" });
  assert(g5.activeByType("LOI_ACCEPTED")?.artifactVersion === "v2", "activeByType resolves the accepted artifactVersion (v2)");
  assert(g5.versionContext.policyVersion === "pX" && g5.versionContext.ruleSetVersion === "rX", "the graph is stamped with its versionContext");

  console.log("\n[6] AC-FG-N1 · retracted decision is absent-for-decision but present in history:");
  const opp6 = newOpp();
  const d = await recordFact({ organizationId: ORG, opportunityId: opp6, factType: "CONTRACT_EXECUTED", operation: "DECLARE", actorType: "HUMAN" });
  const ret = await recordSupersession(ORG, d.id, { operation: "RETRACT", reason: "voided", actorType: "HUMAN" });
  const g6 = await build(opp6);
  assert(g6.activeByType("CONTRACT_EXECUTED") === undefined, "a RETRACTed decision is absent-for-decision (activeByType undefined)");
  assert(g6.history.some((f) => f.id === d.id) && g6.history.some((f) => f.id === ret.id), "both the decision and its retraction remain in history (history-preserving, FG-INV-10)");
  assert(g6.activeFacts.some((f) => f.id === ret.id), "the RETRACT tip is the structural active row (E1 behavior preserved)");

  console.log("\n[7] AC-FG-R1 · regression — a later unrelated fact does not change an earlier chain's resolution:");
  const opp7 = newOpp();
  const e1 = await recordFact({ organizationId: ORG, opportunityId: opp7, factType: "BUYER_MATCHED", operation: "DECLARE", actorType: "HUMAN" });
  const before = (await build(opp7)).byChain(e1.factChainId);
  await recordFact({ organizationId: ORG, opportunityId: opp7, factType: "LOI_DRAFTED", operation: "DRAFT", actorType: "HUMAN" });
  const after = (await build(opp7)).byChain(e1.factChainId);
  assert(before.active?.id === after.active?.id && after.active?.id === e1.id, "the earlier chain's active member is unchanged by an unrelated later fact");

  console.log("\n[8] AC-FG-M1 · migration-origin interpreted identically but provenance reported:");
  const opp8 = newOpp();
  const mig = await recordMigrationFact({ organizationId: ORG, opportunityId: opp8, factType: "CONTRACT_EXECUTED", operation: "DECLARE", actorId: "migration:v1", reason: "backfill" });
  const g8 = await build(opp8);
  const am = g8.activeByType("CONTRACT_EXECUTED");
  assert(am?.id === mig.id, "a MIGRATION_ORIGIN fact is interpreted identically (asserted active)");
  assert(g8.provenance(am) === "MIGRATION_ORIGIN", "provenance() reports MIGRATION_ORIGIN");

  console.log("\n[9] AC-FG-INV6/8 · immutable graph; consumers cannot mutate graph state:");
  const g9 = await build(opp1);
  assert(Object.isFrozen(g9) && Object.isFrozen(g9.activeFacts) && Object.isFrozen(g9.history), "graph, activeFacts, history are frozen");
  let threw = false;
  try { g9.activeFacts.push(g9.history[0]); } catch { threw = true; }
  assert(threw, "mutating graph.activeFacts throws (frozen — FG-INV-8)");
  let asserted = true;
  try { g9.assertInvariant(); } catch { asserted = false; }
  assert(asserted, "assertInvariant() passes on a well-formed graph");

  console.log("\n[10] AC-FG-INV7 · reproducible — same request over same history yields an identical graph:");
  const gA = await build(opp2);
  const gB = await build(opp2);
  assert(JSON.stringify(gA.history.map((f) => f.id)) === JSON.stringify(gB.history.map((f) => f.id)), "two builds produce identical history");
  assert(gA.activeByType("BUYER_MATCHED")?.id === gB.activeByType("BUYER_MATCHED")?.id, "two builds resolve the identical active fact");

  console.log("\n[11] AC-FG-Law12 · one active-fact calculation — activeFacts() façade delegates to the Builder:");
  const facade = (await activeFacts(ORG, opp2)).map((f) => f.id).sort();
  const viaGraph = [...(await build(opp2, STRUCTURAL_CONTEXT)).activeFacts].map((f) => f.id).sort();
  assert(JSON.stringify(facade) === JSON.stringify(viaGraph), "activeFacts() equals graph.activeFacts (single implementation, Law 12)");
} finally {
  console.log("\nCleaning up test facts (raw prisma test-infra; the store/graph expose no delete)...");
  await prisma.pipelineFact.deleteMany({ where: { organizationId: ORG } }).catch((e) => console.log(`  cleanup warn: ${e.message}`));
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
