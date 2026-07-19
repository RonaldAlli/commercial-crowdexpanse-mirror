// Slice 1 — Stage Policy Evaluation integration test (DB-backed, throwaway orgs). Exercises the
// reusable seam applyStageTransition/evaluateStageTransition: diligence-named stages require their
// diligence truth or an ActivityLog attestation; UNDER_CONTRACT requires an executed contract or
// attestation (the Founder's imported-deal override-path proof). Persistence + attestation verified.
import { assertTestDatabase } from "./e2e-guard.mjs";
import { OpportunityStage, OpportunityDiligenceStatus } from "@prisma/client";

import { prisma } from "../lib/prisma.ts";
import { createPropertyRecord } from "../lib/properties.ts";
import { ensureOpportunityDiligence } from "../lib/opportunity-diligence-service.ts";
import { applyStageTransition, evaluateStageTransition } from "../lib/stage-policy-service.ts";

const TAG = "e2e-stage-policy";
assertTestDatabase();
let ok = 0; const fail = [];
const assert = (c, m) => { if (c) { ok++; console.log(`  ✓ ${m}`); } else { fail.push(m); console.log(`  ✗ ${m}`); } };

const prop = (n) => ({ name: n, assetType: "MULTIFAMILY", status: null, addressLine1: "1 Main St", city: "Atlanta", state: "GA", postalCode: null, county: null, sellerId: null, unitCount: null, acreage: null, occupancyRate: null, noiAnnualUsd: null, askingPriceUsd: null, estimatedValueUsd: null, capRate: null });
const stageOf = (id) => prisma.opportunity.findUnique({ where: { id }, select: { stage: true } }).then((o) => o.stage);
const attestCount = (id) => prisma.activityLog.count({ where: { opportunityId: id, eventType: "opportunity.stage_attested" } });
const mkOpp = async (orgId, name, stage = OpportunityStage.LEAD) => {
  const p = await createPropertyRecord(orgId, prop(name), {});
  return prisma.opportunity.create({ data: { organizationId: orgId, propertyId: p.id, title: name, stage }, select: { id: true, stage: true, propertyId: true, sellerId: true } });
};

const orgIds = [];
try {
  const org = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}` } });
  orgIds.push(org.id);
  const actor = await prisma.user.create({ data: { organizationId: org.id, name: "A", email: `${TAG}-${process.pid}@x.test`, hashedPassword: "x", role: "ADMIN" } });
  const apply = (opp, target, reason) => applyStageTransition({ organizationId: org.id, actorId: actor.id, opportunity: opp, targetStage: target, attestationReason: reason });

  console.log("\n[1] T12_RECEIVED requires the t12 diligence item — else attestation:");
  const o1 = await mkOpp(org.id, "Deal1");
  await ensureOpportunityDiligence(org.id, o1.id); // items default NOT_REQUESTED
  const r1 = await apply(o1, OpportunityStage.T12_RECEIVED, null);
  assert(r1.ok === false && r1.decision === "REQUIRES_ATTESTATION", "no t12 + no reason → rejected (REQUIRES_ATTESTATION)");
  assert((await stageOf(o1.id)) === OpportunityStage.LEAD, "stage unchanged when rejected");
  const r1b = await apply({ ...o1, stage: await stageOf(o1.id) }, OpportunityStage.T12_RECEIVED, "Imported deal — T-12 already reviewed offline");
  assert(r1b.ok === true && r1b.attested === true, "no t12 + reason → accepted with attestation");
  assert((await stageOf(o1.id)) === OpportunityStage.T12_RECEIVED, "stage advanced to T12_RECEIVED");
  assert((await attestCount(o1.id)) === 1, "an opportunity.stage_attested ActivityLog was written");

  console.log("\n[2] T12_RECEIVED with the diligence truth present → clean allow, no attestation:");
  const o2 = await mkOpp(org.id, "Deal2");
  await ensureOpportunityDiligence(org.id, o2.id);
  await prisma.opportunityDiligenceItem.updateMany({ where: { opportunityId: o2.id, key: "t12" }, data: { status: OpportunityDiligenceStatus.RECEIVED } });
  const r2 = await apply(o2, OpportunityStage.T12_RECEIVED, null);
  assert(r2.ok === true && r2.attested === false, "t12 RECEIVED → allowed, not attested");
  assert((await attestCount(o2.id)) === 0, "no attestation log when truth exists");

  console.log("\n[3] Unruled stage (UNDERWRITING) is unconstrained — allowed with no truth/attestation:");
  const o3 = await mkOpp(org.id, "Deal3");
  const r3 = await apply(o3, OpportunityStage.UNDERWRITING, null);
  assert(r3.ok === true && r3.decision === "ALLOW" && r3.attested === false, "UNDERWRITING (no rule) → ALLOW unchanged");

  console.log("\n[4] IMPORTED DEAL → UNDER_CONTRACT with NO contract → attestation required → ActivityLog → accepted:");
  const imp = await mkOpp(org.id, "ImportedDeal"); // enters mid-lifecycle, no executed contract
  const e = await evaluateStageTransition(org.id, imp.id, OpportunityStage.UNDER_CONTRACT);
  assert(e.decision === "REQUIRES_ATTESTATION" && /CONTRACT/.test(e.requiredArtifacts.join(" ")), "evaluate: UNDER_CONTRACT w/o contract → REQUIRES_ATTESTATION");
  const rc0 = await apply(imp, OpportunityStage.UNDER_CONTRACT, null);
  assert(rc0.ok === false, "no contract + no reason → rejected");
  const rc1 = await apply({ ...imp, stage: await stageOf(imp.id) }, OpportunityStage.UNDER_CONTRACT, "Imported deal already under contract; PDF held by attorney");
  assert(rc1.ok === true && rc1.attested === true, "no contract + reason → accepted with attestation");
  assert((await stageOf(imp.id)) === OpportunityStage.UNDER_CONTRACT, "stage advanced to UNDER_CONTRACT");
  assert((await attestCount(imp.id)) === 1, "attestation ActivityLog created for the imported UNDER_CONTRACT");

  console.log("\n[5] UNDER_CONTRACT with an executed CONTRACT document → clean allow:");
  const o5 = await mkOpp(org.id, "Deal5");
  await prisma.document.create({ data: { organizationId: org.id, opportunityId: o5.id, title: "Executed PSA", documentType: "CONTRACT", storageKey: `${TAG}-${process.pid}-psa` } });
  const r5 = await apply(o5, OpportunityStage.UNDER_CONTRACT, null);
  assert(r5.ok === true && r5.attested === false, "contract document present → allowed, not attested");
} finally {
  console.log("\nCleaning up throwaway orgs...");
  for (const id of orgIds) await prisma.organization.delete({ where: { id } }).catch((e) => console.log(`  warn: ${e.message}`));
  await prisma.$disconnect();
}
console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
