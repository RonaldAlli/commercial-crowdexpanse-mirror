// AC-API-* · E6 API Coordinator acceptance suite (Phase 4).
// Verifies the orchestration seam: COMMITTED / DENIED / STALE, transaction rollback (nothing appended),
// concurrent competing commits (at most one commits), transaction-context enforcement, transport idempotency via a
// DEDICATED record that replays the ORIGINAL response, and response sequence boundaries. Runs against the *_test DB.
import { randomUUID } from "node:crypto";
import { assertTestDatabase } from "./e2e-guard.mjs";

import { prisma } from "../lib/prisma.ts";
import { recordFact } from "../lib/pipeline-facts/service.ts";
import { buildFactGraph } from "../lib/pipeline-facts/fact-graph.ts";
import { perform } from "../lib/pipeline-api/coordinator.ts";
import { getPolicy } from "../lib/pipeline-authorization/policy.ts";
import { SS1 } from "../lib/pipeline-projection/spine.ts";

const TAG = "e2e-api";
const ORG = `${TAG}-${process.pid}`;
const VC = { policyVersion: "p1", ruleSetVersion: "rs-1" };
assertTestDatabase();
let ok = 0;
const fail = [];
const assert = (c, m) => { if (c) { ok++; console.log(`  ✓ ${m}`); } else { fail.push(m); console.log(`  ✗ ${m}`); } };
const newOpp = () => `opp-${randomUUID()}`;
const rf = (opp, factType, operation, extra = {}) => recordFact({ organizationId: ORG, opportunityId: opp, factType, operation, actorType: "HUMAN", ...extra });
const HUMAN_OK = { actorId: "u1", actorClass: "HUMAN", capabilities: ["DECLARE_DILIGENCE_COMPLETE"], identityVersion: "v1" };
const NO_CAP = { actorId: "u2", actorClass: "HUMAN", capabilities: [], identityVersion: "v1" };
const curSeq = async (opp) => { const h = (await buildFactGraph({ organizationId: ORG, opportunityId: opp, versionContext: VC })).history; return h.length ? String(h[h.length - 1].globalSequence) : "0"; };
const req = (opp, over = {}) => ({
  requestId: randomUUID(), organizationId: ORG, opportunityId: opp, actor: HUMAN_OK,
  capability: "DECLARE_DILIGENCE_COMPLETE", operation: { factType: "DILIGENCE_COMPLETE", factClass: "DECISION", op: "DECLARE" },
  policy: getPolicy("ap1-declare-diligence-complete"), versionContext: VC, spine: SS1, projectionPolicy: { projectionVersion: "pp-1" }, ...over,
});
const nDecisions = (opp) => prisma.pipelineFact.count({ where: { organizationId: ORG, opportunityId: opp, factType: "DILIGENCE_COMPLETE" } });
const complete = async (opp) => { for (const k of ["t12", "rent_roll", "psa"]) await rf(opp, "DILIGENCE_MATERIAL_RECEIVED", "RECORD_EVIDENCE", { subjectKey: k }); };

try {
  console.log("\n[1] AC-API · COMMITTED — fact appended; projection reflects it (sequence boundaries + version stamps):");
  const o1 = newOpp(); await complete(o1);
  const r1 = await perform(req(o1));
  assert(r1.outcome === "COMMITTED" && r1.committedFact && r1.committedFact.provenance === "VERIFIED", "COMMITTED with an appended fact");
  assert(BigInt(r1.projectedThroughGlobalSequence) >= BigInt(r1.committedGlobalSequence), "projectedThroughGlobalSequence ≥ committedGlobalSequence (projection includes the fact)");
  assert(r1.contractVersions.api === "v1.0" && r1.contractVersions.ruleSetVersion === "rs-1" && r1.contractVersions.spineVersion === "ss-1", "response stamps contract versions");

  console.log("\n[2] AC-API · DENIED (business precondition) → 422, frozen code, decision AS-IS, no append:");
  const o2 = newOpp(); await rf(o2, "DILIGENCE_MATERIAL_RECEIVED", "RECORD_EVIDENCE", { subjectKey: "t12" });
  const r2 = await perform(req(o2));
  assert(r2.outcome === "DENIED" && r2.error.category === "business-precondition" && r2.error.httpStatus === 422 && r2.error.subsystemCode === "MISSING_REQUIRED_EVIDENCE", "DENIED → business-precondition/422/MISSING_REQUIRED_EVIDENCE");
  assert(r2.error.decision === r2.decision && (await nDecisions(o2)) === 0, "decision embedded AS-IS; nothing appended");

  console.log("\n[3] AC-API · DENIED (authorization) → 403 INSUFFICIENT_CAPABILITY:");
  const o3 = newOpp(); await complete(o3);
  const r3 = await perform(req(o3, { actor: NO_CAP }));
  assert(r3.outcome === "DENIED" && r3.error.category === "authorization" && r3.error.httpStatus === 403 && r3.error.subsystemCode === "INSUFFICIENT_CAPABILITY", "missing capability → authorization/403/INSUFFICIENT_CAPABILITY");

  console.log("\n[4] AC-API · STALE — ledger advanced past expectedGlobalSequence → 409, no append:");
  const o4 = newOpp(); await complete(o4);
  const s0 = await curSeq(o4);
  await perform(req(o4)); // advances the ledger
  const r4 = await perform(req(o4, { expectedVersion: { expectedGlobalSequence: s0 } }));
  assert(r4.outcome === "STALE" && r4.error.category === "concurrency" && r4.error.httpStatus === 409 && r4.error.subsystemCode === "STALE_FACT_GRAPH", "stale sequence → concurrency/409/STALE_FACT_GRAPH");
  assert((await nDecisions(o4)) === 1, "only the first commit's fact exists (STALE appended nothing)");

  console.log("\n[5] AC-API · transaction rollback + tx-context (API-INV-2) — fault after append leaves NO fact:");
  const o5 = newOpp(); await complete(o5);
  let threw = false;
  try { await perform(req(o5), { _faultAfterRecord: true }); } catch { threw = true; }
  assert(threw && (await nDecisions(o5)) === 0, "injected fault rolls back the append — proving recordFact ran on the tx client, not the global one");

  console.log("\n[6] AC-API · transport idempotency — a retry replays the ORIGINAL stored response (not a rebuilt view):");
  const o6 = newOpp(); await complete(o6);
  const rq6 = req(o6);
  const a = await perform(rq6);
  await perform(req(o6)); // INTERVENING commit — advances the ledger & would change a rebuilt projection
  const b = await perform(rq6); // retry the ORIGINAL requestId
  assert(a.outcome === "COMMITTED" && b.outcome === "COMMITTED", "both COMMITTED");
  assert(b.projectedThroughGlobalSequence === a.projectedThroughGlobalSequence && b.committedGlobalSequence === a.committedGlobalSequence, "retry returns the ORIGINAL response (same sequence boundaries) despite the intervening commit — stored, not rebuilt");
  assert((await nDecisions(o6)) === 2, "the retry appended nothing (only the original + the intervening commit)");
  const conflict = await perform({ ...rq6, state: "different-payload" });
  assert(conflict.outcome === "DENIED" && conflict.error.subsystemCode === "IDEMPOTENCY_KEY_REUSE", "same requestId + different payload → rejected (IDEMPOTENCY_KEY_REUSE)");
  assert((await nDecisions(o6)) === 2, "the rejected reuse appended nothing");

  console.log("\n[7] AC-API · concurrent competing commits — exactly one COMMITTED, one STALE:");
  const o7 = newOpp(); await complete(o7);
  const seq7 = await curSeq(o7);
  const [c1, c2] = await Promise.all([
    perform(req(o7, { expectedVersion: { expectedGlobalSequence: seq7 } })),
    perform(req(o7, { expectedVersion: { expectedGlobalSequence: seq7 } })),
  ]);
  const outcomes = [c1.outcome, c2.outcome].sort();
  assert(outcomes[0] === "COMMITTED" && outcomes[1] === "STALE", "one COMMITTED, one STALE (advisory lock + sequence guard)");
} finally {
  await prisma.apiIdempotencyRecord.deleteMany({ where: { organizationId: ORG } }).catch(() => {});
  await prisma.pipelineFact.deleteMany({ where: { organizationId: ORG } }).catch(() => {});
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
