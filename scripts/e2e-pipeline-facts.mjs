// AC-GI1-* · E1 Core Fact Infrastructure acceptance suite (Phase 4, Epic E1).
// Verifies the append-only fact ledger against the frozen invariants (GI-1 + E1 exit criteria).
// Runs against the *_test DB (auto-discovered by e2e-all.mjs). E1 is not "done" until these pass
// (Constitution Law 11). Scope: the store only — no projection/authorization/policy here.
import { randomUUID } from "node:crypto";
import { assertTestDatabase } from "./e2e-guard.mjs";

import { prisma } from "../lib/prisma.ts";
import {
  recordFact,
  recordMigrationFact,
  recordSupersession,
  reconstructHistory,
  activeFacts,
} from "../lib/pipeline-facts/service.ts";
import { isKnownFactType } from "../lib/pipeline-facts/registry.ts";

const TAG = "e2e-pf";
const ORG = `${TAG}-${process.pid}`;
assertTestDatabase();
let ok = 0;
const fail = [];
const assert = (cond, msg) => { if (cond) { ok++; console.log(`  ✓ ${msg}`); } else { fail.push(msg); console.log(`  ✗ ${msg}`); } };
async function throws(fn, msg) { try { await fn(); assert(false, msg); } catch { assert(true, msg); } }
const newOpp = () => `opp-${randomUUID()}`;
const ser = (x) => JSON.stringify(x, (_, v) => (typeof v === "bigint" ? v.toString() : v)); // BigInt-safe (globalSequence)

try {
  console.log("\n[1] AC-GI1-P1 · append-only correction: successor supersedes, prior preserved, chain constant:");
  const opp1 = newOpp();
  const a = await recordFact({ organizationId: ORG, opportunityId: opp1, factType: "BUYER_MATCHED", operation: "DECLARE", actorType: "HUMAN", actorId: "u1", payload: { note: "v1" } });
  const aSnapshot = ser(a);
  const b = await recordSupersession(ORG, a.id, { operation: "CORRECT", reason: "typo in note", actorType: "HUMAN", actorId: "u1", payload: { note: "v2" } });
  assert(b.supersedesFactId === a.id, "successor links to the prior via supersedesFactId");
  assert(b.factChainId === a.factChainId, "factChainId (semantic identity) is constant across supersession");
  assert(b.id !== a.id, "record identity (id) differs between rows");
  const aReloaded = await prisma.pipelineFact.findUnique({ where: { id: a.id } });
  assert(ser(aReloaded) === aSnapshot, "the prior fact row is byte-for-byte UNCHANGED (immutable — GI-1)");

  console.log("\n[2] AC-GI1-N1 · no mutation path; ontology + GI-3 class↔operation enforced:");
  assert(typeof (await import("../lib/pipeline-facts/service.ts")).update === "undefined", "the service exports NO update() (immutability by construction)");
  await throws(() => recordFact({ organizationId: ORG, opportunityId: opp1, factType: "NOT_A_FACT", operation: "DECLARE", actorType: "HUMAN" }), "unknown factType is rejected (ontology registry)");
  await throws(() => recordFact({ organizationId: ORG, opportunityId: opp1, factType: "DEED_RECORDED", operation: "DECLARE", actorType: "HUMAN" }), "DECLARE on an EVIDENCE fact is rejected (GI-3: evidence never declared)");
  await throws(() => recordFact({ organizationId: ORG, opportunityId: opp1, factType: "BUYER_MATCHED", operation: "RECORD_EVIDENCE", actorType: "HUMAN" }), "RECORD_EVIDENCE on a DECISION fact is rejected (GI-3)");

  console.log("\n[3] AC-GI1-R1 · retraction creates a superseding record; prior intact; active-set derived:");
  const opp3 = newOpp();
  const c = await recordFact({ organizationId: ORG, opportunityId: opp3, factType: "CONTRACT_EXECUTED", operation: "DECLARE", actorType: "HUMAN", actorId: "u2", artifactVersion: "v3" });
  const r = await recordSupersession(ORG, c.id, { operation: "RETRACT", reason: "contract voided", actorType: "HUMAN", actorId: "u2" });
  assert(r.operation === "RETRACT" && r.supersedesFactId === c.id, "RETRACT is a new row linked to the prior decision");
  const act = await activeFacts(ORG, opp3);
  assert(!act.some((f) => f.id === c.id), "the retracted decision is no longer active (it is superseded)");
  assert(act.some((f) => f.id === r.id), "the retraction record itself is active (derived: unsuperseded)");
  await throws(() => recordSupersession(ORG, c.id, { operation: "RETRACT", reason: "", actorType: "HUMAN" }), "RETRACT without a reason is rejected");

  console.log("\n[4] AC-GI1-M1 · migration provenance is distinguishable from verified evidence:");
  const opp4 = newOpp();
  const mig = await recordMigrationFact({ organizationId: ORG, opportunityId: opp4, factType: "CONTRACT_EXECUTED", operation: "DECLARE", actorId: "migration:v1", reason: "legacy UNDER_CONTRACT backfill" });
  assert(mig.provenance === "MIGRATION_ORIGIN" && mig.actorType === "MIGRATION_PRINCIPAL", "migration fact is MIGRATION_ORIGIN by a MIGRATION_PRINCIPAL");
  const verified = await recordFact({ organizationId: ORG, opportunityId: newOpp(), factType: "CONTRACT_EXECUTED", operation: "DECLARE", actorType: "HUMAN" });
  assert(verified.provenance === "VERIFIED", "an ordinary fact is VERIFIED — never confused with migration-origin");

  console.log("\n[5] Audit completeness + collection facts (A-6) + typed payload:");
  const auditFact = await recordFact({ organizationId: ORG, opportunityId: newOpp(), factType: "FUNDS_DISBURSED", operation: "RECORD_EVIDENCE", actorType: "EXTERNAL_PRINCIPAL", actorId: "escrow-co", payload: { recipient: "seller", purpose: "SellerProceeds", amount: 100, obligation: "PurchaseContract:v7" } });
  assert(!!auditFact.actorType && !!auditFact.operation && !!auditFact.provenance && auditFact.globalSequence != null && !!auditFact.recordedAt, "every fact carries actor/operation/provenance/globalSequence/recordedAt");
  await throws(() => recordFact({ organizationId: ORG, opportunityId: newOpp(), factType: "FUNDS_DISBURSED", operation: "RECORD_EVIDENCE", actorType: "HUMAN", payload: { recipient: "x", amount: 1 } }), "typed payload validated: FUNDS_DISBURSED without purpose/obligation is rejected");
  await throws(() => recordFact({ organizationId: ORG, opportunityId: newOpp(), factType: "DILIGENCE_MATERIAL_RECEIVED", operation: "RECORD_EVIDENCE", actorType: "HUMAN" }), "collection fact without subjectKey is rejected (A-6)");
  const oppColl = newOpp();
  await recordFact({ organizationId: ORG, opportunityId: oppColl, factType: "DILIGENCE_MATERIAL_RECEIVED", operation: "RECORD_EVIDENCE", actorType: "HUMAN", subjectKey: "t12" });
  await recordFact({ organizationId: ORG, opportunityId: oppColl, factType: "DILIGENCE_MATERIAL_RECEIVED", operation: "RECORD_EVIDENCE", actorType: "HUMAN", subjectKey: "rent_roll" });
  assert((await activeFacts(ORG, oppColl)).length === 2, "per-item collection facts (t12, rent_roll) coexist independently");

  console.log("\n[6] globalSequence is the authoritative total order; history reconstructs deterministically:");
  const oppSeq = newOpp();
  const f1 = await recordFact({ organizationId: ORG, opportunityId: oppSeq, factType: "LOI_DRAFTED", operation: "DRAFT", actorType: "HUMAN" });
  const f2 = await recordFact({ organizationId: ORG, opportunityId: oppSeq, factType: "LOI_SENT", operation: "DRAFT", actorType: "HUMAN" });
  assert(f2.globalSequence > f1.globalSequence, "globalSequence is monotonically increasing (BIGSERIAL)");
  const hist1 = (await reconstructHistory(ORG, oppSeq)).map((f) => f.id);
  const hist2 = (await reconstructHistory(ORG, oppSeq)).map((f) => f.id);
  assert(JSON.stringify(hist1) === JSON.stringify(hist2) && hist1.length === 2, "reconstructHistory is deterministic + complete (ordered by globalSequence)");

  console.log("\n[7] Ontology sanity:");
  assert(isKnownFactType("TRANSACTION_CLOSED") && !isKnownFactType("MADE_UP"), "the ontology registry gates known vs unknown fact types");
} finally {
  console.log("\nCleaning up test facts (E1 store has no delete API — cleanup uses raw prisma test-infra)...");
  await prisma.pipelineFact.deleteMany({ where: { organizationId: ORG } }).catch((e) => console.log(`  cleanup warn: ${e.message}`));
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
