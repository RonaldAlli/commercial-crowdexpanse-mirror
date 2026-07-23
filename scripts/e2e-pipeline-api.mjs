// AC-API-* · E6 API Coordinator acceptance suite (Phase 4).
// Verifies the orchestration seam: COMMITTED / DENIED / STALE, transaction rollback (nothing appended),
// concurrent competing commits (at most one commits), transaction-context enforcement, transport idempotency,
// response sequence boundaries, and version stamps. Runs against the *_test DB. The Coordinator owns no business
// logic (API-INV-1) — it delegates + translates.
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
const curSeq = async (opp) => { const g = await buildFactGraph({ organizationId: ORG, opportunityId: opp, versionContext: VC }); const h = g.history; return h.length ? String(h[h.length - 1].globalSequence) : "0"; };
const req = (opp, over = {}) => ({
  requestId: randomUUID(), organizationId: ORG, opportunityId: opp, actor: HUMAN_OK,
  capability: "DECLARE_DILIGENCE_COMPLETE", operation: { factType: "DILIGENCE_COMPLETE", factClass: "DECISION", op: "DECLARE" },
  policy: getPolicy("ap1-declare-diligence-complete"), versionContext: VC,
  spine: SS1, projectionPolicy: { projectionVersion: "pp-1" }, ...over,
});
const factCount = (opp, reason) => prisma.pipelineFact.count({ where: { organizationId: ORG, opportunityId: opp, ...(reason ? { reason } : {}) } });

try {
  console.log("\n[1] AC-API · COMMITTED — fact appended; projection reflects it (sequence boundaries):");
  const o1 = newOpp();
  for (const k of ["t12", "rent_roll", "psa"]) await rf(o1, "DILIGENCE_MATERIAL_RECEIVED", "RECORD_EVIDENCE", { subjectKey: k });
  const r1 = await perform(req(o1));
  assert(r1.outcome === "COMMITTED" && r1.committedFact && r1.committedFact.provenance === "VERIFIED", "COMMITTED with an appended fact");
  assert(BigInt(r1.projectedThroughGlobalSequence) >= BigInt(r1.committedGlobalSequence), "projectedThroughGlobalSequence ≥ committedGlobalSequence (projection includes the fact)");
  assert(r1.contractVersions.api === "v1.0" && r1.contractVersions.ruleSetVersion === "rs-1" && r1.contractVersions.spineVersion === "ss-1", "response stamps contract versions");

  console.log("\n[2] AC-API · DENIED (business precondition) → 422, frozen subsystemCode, decision AS-IS, no append:");
  const o2 = newOpp();
  await rf(o2, "DILIGENCE_MATERIAL_RECEIVED", "RECORD_EVIDENCE", { subjectKey: "t12" }); // incomplete
  const r2 = await perform(req(o2));
  assert(r2.outcome === "DENIED" && r2.error.category === "business-precondition" && r2.error.httpStatus === 422 && r2.error.subsystemCode === "MISSING_REQUIRED_EVIDENCE", "DENIED → business-precondition/422/MISSING_REQUIRED_EVIDENCE");
  assert(r2.error.decision === r2.decision, "the AuthorizationDecision is embedded AS-IS in the error");
  assert((await factCount(o2, "API:req:" + r2.requestId)) === 0, "nothing appended on DENY");

  console.log("\n[3] AC-API · DENIED (authorization) → 403 INSUFFICIENT_CAPABILITY:");
  const o3 = newOpp();
  for (const k of ["t12", "rent_roll", "psa"]) await rf(o3, "DILIGENCE_MATERIAL_RECEIVED", "RECORD_EVIDENCE", { subjectKey: k });
  const r3 = await perform(req(o3, { actor: NO_CAP }));
  assert(r3.outcome === "DENIED" && r3.error.category === "authorization" && r3.error.httpStatus === 403 && r3.error.subsystemCode === "INSUFFICIENT_CAPABILITY", "missing capability → authorization/403/INSUFFICIENT_CAPABILITY");

  console.log("\n[4] AC-API · STALE — ledger advanced past expectedGlobalSequence → 409, nothing appended:");
  const o4 = newOpp();
  for (const k of ["t12", "rent_roll", "psa"]) await rf(o4, "DILIGENCE_MATERIAL_RECEIVED", "RECORD_EVIDENCE", { subjectKey: k });
  const s0 = await curSeq(o4);
  await perform(req(o4)); // advances the ledger
  const r4 = await perform(req(o4, { expectedVersion: { expectedGlobalSequence: s0 } }));
  assert(r4.outcome === "STALE" && r4.error.category === "concurrency" && r4.error.httpStatus === 409 && r4.error.subsystemCode === "STALE_FACT_GRAPH", "stale expected sequence → concurrency/409/STALE_FACT_GRAPH");
  assert((await factCount(o4, "API:req:" + r4.requestId)) === 0, "nothing appended on STALE");

  console.log("\n[5] AC-API · transaction rollback + tx-context — fault after append leaves NO fact (API-INV-2):");
  const o5 = newOpp();
  for (const k of ["t12", "rent_roll", "psa"]) await rf(o5, "DILIGENCE_MATERIAL_RECEIVED", "RECORD_EVIDENCE", { subjectKey: k });
  const rq5 = req(o5);
  let threw = false;
  try { await perform(rq5, { _faultAfterRecord: true }); } catch { threw = true; }
  assert(threw, "an injected fault after recordFact propagates (no success response)");
  assert((await factCount(o5, "API:req:" + rq5.requestId)) === 0, "the append was rolled back — proving recordFact ran on the tx client, not the global one");

  console.log("\n[6] AC-API · transport idempotency — same requestId appends no second fact:");
  const o6 = newOpp();
  for (const k of ["t12", "rent_roll", "psa"]) await rf(o6, "DILIGENCE_MATERIAL_RECEIVED", "RECORD_EVIDENCE", { subjectKey: k });
  const rq6 = req(o6);
  const a = await perform(rq6);
  const b = await perform(rq6); // identical requestId (retry)
  assert(a.outcome === "COMMITTED" && b.outcome === "COMMITTED", "both return COMMITTED");
  assert((await factCount(o6, "API:req:" + rq6.requestId)) === 1, "exactly ONE fact for the requestId (idempotent replay)");

  console.log("\n[7] AC-API · concurrent competing commits — at most one commits, the other is STALE:");
  const o7 = newOpp();
  for (const k of ["t12", "rent_roll", "psa"]) await rf(o7, "DILIGENCE_MATERIAL_RECEIVED", "RECORD_EVIDENCE", { subjectKey: k });
  const seq7 = await curSeq(o7);
  const [c1, c2] = await Promise.all([
    perform(req(o7, { expectedVersion: { expectedGlobalSequence: seq7 } })),
    perform(req(o7, { expectedVersion: { expectedGlobalSequence: seq7 } })),
  ]);
  const outcomes = [c1.outcome, c2.outcome].sort();
  assert(outcomes[0] === "COMMITTED" && outcomes[1] === "STALE", "exactly one COMMITTED, one STALE (advisory lock + sequence guard)");
} finally {
  await prisma.pipelineFact.deleteMany({ where: { organizationId: ORG } }).catch(() => {});
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
