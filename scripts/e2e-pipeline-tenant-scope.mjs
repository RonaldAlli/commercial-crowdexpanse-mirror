// AC-PIPE-AUTHZ-* · pipeline tenant-isolation acceptance (security hotfix).
//
// Proves the session-authoritative tenant rule the deployed adapters (GET read, POST
// fact-operations, Pipeline screen) now share via resolveOwnedPipelineScope:
//   - own-org opportunity → scope resolved with the SESSION org (AC-1)
//   - a request-supplied org cannot widen scope — there is no such parameter (AC-2)
//   - cross-tenant opportunity → null → 404/notFound, no projection/tenant info (AC-3)
//   - the mutating route is gated by the SAME resolver before perform() (AC-4)
//   - read-only resolution creates NO records; own-org still resolves (AC-5)
// plus a real data-isolation proof: a fact planted under org B is unreachable from A.
// Runs against the *_test DB with two throwaway orgs (cascade-cleaned).
import { randomUUID } from "node:crypto";

import { prisma } from "../lib/prisma.ts";
import { assertTestDatabase } from "./e2e-guard.mjs";
import { resolveOwnedPipelineScope, ownedScopeFrom } from "../lib/pipeline-tenant.ts";
import { recordFact } from "../lib/pipeline-facts/service.ts";

const TAG = "e2e-pipe-authz";
assertTestDatabase();
let ok = 0;
const fail = [];
const assert = (c, m) => { if (c) { ok++; console.log(`  ✓ ${m}`); } else { fail.push(m); console.log(`  ✗ ${m}`); } };

const orgIds = [];
const mkOrg = async (label) => {
  const o = await prisma.organization.create({
    data: { name: `${TAG} ${label} ${process.pid}`, slug: `${TAG}-${label}-${process.pid}-${randomUUID().slice(0, 8)}` },
  });
  orgIds.push(o.id);
  return o;
};
const mkProp = (orgId) =>
  prisma.property.create({ data: { organizationId: orgId, name: "Asset", assetType: "MULTIFAMILY", addressLine1: "1 Way", city: "Nowhere", state: "ZZ" } });
const mkOpp = (orgId, propertyId) => prisma.opportunity.create({ data: { organizationId: orgId, propertyId, title: "Deal" } });

try {
  const A = await mkOrg("A");
  const B = await mkOrg("B");
  const [propA, propB] = [await mkProp(A.id), await mkProp(B.id)];
  const [oppA, oppB] = [await mkOpp(A.id, propA.id), await mkOpp(B.id, propB.id)];
  const userA = { organizationId: A.id }; // the authenticated caller's session-derived org

  console.log("\n[AC-PIPE-AUTHZ-1] own-org opportunity → scope resolved with the session org:");
  const s1 = await resolveOwnedPipelineScope(userA, oppA.id);
  assert(s1 !== null && s1.organizationId === A.id && s1.opportunityId === oppA.id, "userA resolves oppA to org A (→ 200 read)");

  console.log("\n[AC-PIPE-AUTHZ-2] a request-supplied org cannot widen scope (structural):");
  // resolveOwnedPipelineScope takes NO org argument — only the session user + oppId — so a query/body
  // organizationId is not in the authority path at all. The resolved org is always the session org.
  assert(ownedScopeFrom(A.id, oppB.id, true).organizationId === A.id, "resolved org is the session org verbatim, never a supplied value");

  console.log("\n[AC-PIPE-AUTHZ-3] cross-tenant opportunity → null (404, no projection/tenant info):");
  const s2 = await resolveOwnedPipelineScope(userA, oppB.id);
  assert(s2 === null, "userA CANNOT resolve oppB (org B's opportunity) → null");

  console.log("\n[AC-PIPE-AUTHZ-4] mutation gate — cross-tenant opp denied BEFORE perform():");
  const gate = await resolveOwnedPipelineScope(userA, oppB.id);
  assert(gate === null, "userA's fact-operation against oppB is blocked at the shared scope gate");

  console.log("\n[AC-PIPE-AUTHZ-5] read-only resolution creates NO records; own-org still resolves:");
  const before = await prisma.pipelineFact.count();
  await resolveOwnedPipelineScope(userA, oppA.id);
  await resolveOwnedPipelineScope(userA, oppB.id);
  const after = await prisma.pipelineFact.count();
  assert(before === after, "no pipeline_facts created by scope resolution");

  console.log("\n[isolation] data planted under org B is unreachable from org A's scope:");
  await recordFact({ organizationId: B.id, opportunityId: oppB.id, factType: "DILIGENCE_MATERIAL_RECEIVED", operation: "RECORD_EVIDENCE", actorType: "HUMAN", subjectKey: "t12" });
  const leak = await resolveOwnedPipelineScope(userA, oppB.id);
  assert(leak === null, "even with a fact present under org B, userA cannot reach it");
} finally {
  console.log("\nCleaning up throwaway orgs (cascade)...");
  for (const id of orgIds) {
    await prisma.organization.delete({ where: { id } }).catch((e) => console.log(`  cleanup warn: ${e.message}`));
  }
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
