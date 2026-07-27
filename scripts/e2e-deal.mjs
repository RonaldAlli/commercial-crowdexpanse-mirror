// BE-2 Step 1 — Deal aggregate acceptance (ADDITIVE, INERT). Proves org-scoped, idempotent,
// control-fact-anchored Deal derivation with no regression to the Opportunity path. A Deal is born
// only from the canonical "Deal Controlled" event (CONTRACT_EXECUTED decision fact). Runs against the
// *_test DB with throwaway orgs (cascade-cleaned). Wired to NO live path.
import { randomUUID } from "node:crypto";

import { prisma } from "../lib/prisma.ts";
import { assertTestDatabase } from "./e2e-guard.mjs";
import { recordFact, recordSupersession } from "../lib/pipeline-facts/service.ts";
import { ensureDeal, getDeal, activeControlFact } from "../lib/deal-service.ts";

const TAG = "e2e-deal";
assertTestDatabase();
let ok = 0;
const fail = [];
const assert = (c, m) => { if (c) { ok++; console.log(`  ✓ ${m}`); } else { fail.push(m); console.log(`  ✗ ${m}`); } };
const threw = async (fn) => { try { await fn(); return false; } catch { return true; } };

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
let userSeq = 0;
const mkUser = (orgId) =>
  prisma.user.create({ data: { organizationId: orgId, name: "Operator", email: `${TAG}-${process.pid}-${userSeq++}@test.local`, hashedPassword: "x" } });
const control = (orgId, oppId) =>
  recordFact({ organizationId: orgId, opportunityId: oppId, factType: "CONTRACT_EXECUTED", operation: "DECLARE", actorType: "HUMAN" });

try {
  const A = await mkOrg("A");
  const B = await mkOrg("B");
  const propA = await mkProp(A.id);
  const oppControlled = await mkOpp(A.id, propA.id);
  const oppUncontrolled = await mkOpp(A.id, propA.id);
  const propB = await mkProp(B.id);
  const oppB = await mkOpp(B.id, propB.id);
  const userA = await mkUser(A.id);

  console.log("\n[no control fact → refuse]");
  assert((await activeControlFact(A.id, oppUncontrolled.id)) === null, "no active control fact for an uncontrolled opportunity");
  assert((await getDeal(A.id, oppUncontrolled.id)) === null, "no Deal exists for an uncontrolled opportunity (compat: null)");
  assert(await threw(() => ensureDeal(A.id, oppUncontrolled.id, userA.id)), "ensureDeal REFUSES without a control fact");
  assert((await prisma.deal.count({ where: { organizationId: A.id } })) === 0, "no Deal row created by the refused attempt");

  console.log("\n[control fact → derive Deal]");
  const cf = await control(A.id, oppControlled.id);
  assert((await activeControlFact(A.id, oppControlled.id))?.id === cf.id, "control fact is active for the opportunity");
  const deal = await ensureDeal(A.id, oppControlled.id, userA.id);
  assert(deal && deal.opportunityId === oppControlled.id, "Deal derived from the control fact");
  assert(deal.controlFactId === cf.id, "Deal records the control fact id (provenance)");
  assert(deal.businessArchitectureVersion === "1.0", "Deal records the business architecture baseline (1.0)");
  assert(deal.controlledAt instanceof Date, "Deal has a control-effective timestamp");
  const audit = await prisma.activityLog.findFirst({ where: { organizationId: A.id, opportunityId: oppControlled.id, eventType: "deal.controlled" } });
  assert(audit && audit.actorId === userA.id, "an audit ActivityLog 'deal.controlled' was written with the acting user");

  console.log("\n[idempotent]");
  const again = await ensureDeal(A.id, oppControlled.id, userA.id);
  assert(again.id === deal.id, "second ensureDeal returns the SAME Deal (idempotent)");
  assert((await prisma.deal.count({ where: { organizationId: A.id } })) === 1, "still exactly one Deal in org A");

  console.log("\n[concurrent creation → one Deal, P2002-safe]");
  const opp2 = await mkOpp(A.id, propA.id);
  await control(A.id, opp2.id);
  const results = await Promise.all([ensureDeal(A.id, opp2.id), ensureDeal(A.id, opp2.id), ensureDeal(A.id, opp2.id)]);
  assert(new Set(results.map((d) => d.id)).size === 1, "concurrent ensureDeal converge on ONE Deal (race-safe)");
  assert((await prisma.deal.count({ where: { opportunityId: opp2.id } })) === 1, "exactly one Deal row for the opportunity");

  console.log("\n[opportunity→Deal uniqueness at the DB]");
  const dupThrew = await threw(() =>
    prisma.deal.create({ data: { organizationId: A.id, opportunityId: oppControlled.id, controlFactId: cf.id, controlledAt: new Date() } }),
  );
  assert(dupThrew, "a duplicate Deal for the same Opportunity is rejected (opportunityId @unique)");

  console.log("\n[organization isolation]");
  await control(B.id, oppB.id); // org B's opportunity IS controlled...
  assert(await threw(() => ensureDeal(A.id, oppB.id, userA.id)), "org A CANNOT derive a Deal for org B's opportunity (Opportunity not found)");
  assert((await getDeal(A.id, oppB.id)) === null, "org A cannot read org B's Deal");
  assert((await activeControlFact(A.id, oppB.id)) === null, "org A cannot see org B's control fact");
  assert((await prisma.deal.count({ where: { organizationId: B.id } })) === 0, "no Deal leaked into org B from A's attempt");

  console.log("\n[retracted control → refuses new Deal]");
  const opp3 = await mkOpp(A.id, propA.id);
  const cf3 = await control(A.id, opp3.id);
  await recordSupersession(A.id, cf3.id, { operation: "RETRACT", reason: "test retract", actorType: "HUMAN" });
  assert((await activeControlFact(A.id, opp3.id)) === null, "a RETRACTED control fact is no longer active");
  assert(await threw(() => ensureDeal(A.id, opp3.id)), "ensureDeal refuses when control was retracted");

  console.log("\n[no regression: Opportunity path intact]");
  const readOpp = await prisma.opportunity.findFirst({ where: { id: oppControlled.id, organizationId: A.id }, include: { deal: true } });
  assert(readOpp && readOpp.stage === "LEAD", "Opportunity unchanged (stage still default LEAD — Deal derivation never mutates it)");
  assert(readOpp.deal && readOpp.deal.id === deal.id, "Opportunity.deal back-relation resolves to the derived Deal");
} finally {
  console.log("\nCleaning up throwaway orgs (cascade)...");
  for (const id of orgIds) {
    await prisma.organization.delete({ where: { id } }).catch((e) => console.log(`  cleanup warn: ${e.message}`));
  }
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
