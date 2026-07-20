// Performance baseline (test DB) — stage-change latency BEFORE vs AFTER the Stage Policy Evaluation
// layer. Not auto-discovered by e2e-all (no `e2e-` prefix). Run:
//   node --env-file=.env.test --import tsx scripts/perf-stage-transition.mjs
import { assertTestDatabase } from "./e2e-guard.mjs";
import { OpportunityStage } from "@prisma/client";
import { prisma } from "../lib/prisma.ts";
import { createPropertyRecord } from "../lib/properties.ts";
import { ensureOpportunityDiligence } from "../lib/opportunity-diligence-service.ts";
import { applyStageTransition } from "../lib/stage-policy-service.ts";

assertTestDatabase();
const TAG = "perf-stage";
const N = 100;
const msAvg = (t, n) => (Number(t) / 1e6 / n).toFixed(2);
const ns = () => process.hrtime.bigint();

const org = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}` } });
const actor = await prisma.user.create({ data: { organizationId: org.id, name: "A", email: `${TAG}-${process.pid}@x.test`, hashedPassword: "x", role: "ADMIN" } });
const p = await createPropertyRecord(org.id, { name: "Perf", assetType: "MULTIFAMILY", status: null, addressLine1: "1 Main St", city: "Atlanta", state: "GA", postalCode: null, county: null, sellerId: null, unitCount: null, acreage: null, occupancyRate: null, noiAnnualUsd: null, askingPriceUsd: null, estimatedValueUsd: null, capRate: null }, {});
const opp = await prisma.opportunity.create({ data: { organizationId: org.id, propertyId: p.id, title: "Perf", stage: OpportunityStage.LEAD }, select: { id: true, stage: true, propertyId: true, sellerId: true } });
await ensureOpportunityDiligence(org.id, opp.id);
const stages = [OpportunityStage.LEAD, OpportunityStage.UNDERWRITING]; // both unruled → ALLOW (common path)

for (let i = 0; i < 5; i++) await prisma.opportunity.update({ where: { id: opp.id }, data: { stage: stages[i % 2] } }); // warm-up

let t = ns();
for (let i = 0; i < N; i++) {
  await prisma.opportunity.update({ where: { id: opp.id }, data: { stage: stages[i % 2] } });
  await prisma.activityLog.create({ data: { organizationId: org.id, opportunityId: opp.id, propertyId: opp.propertyId, actorId: actor.id, eventType: "opportunity.stage_changed", eventLabel: "x" } });
}
const before = ns() - t;

t = ns();
for (let i = 0; i < N; i++) {
  await applyStageTransition({ organizationId: org.id, actorId: actor.id, opportunity: { ...opp, stage: stages[(i + 1) % 2] }, targetStage: stages[i % 2] });
}
const after = ns() - t;

console.log(`N=${N} iterations (test DB, common ALLOW path)`);
console.log(`  BEFORE (raw update + log, no policy):     ${msAvg(before, N)} ms/op`);
console.log(`  AFTER  (applyStageTransition w/ policy):  ${msAvg(after, N)} ms/op`);
console.log(`  ADDED  (facts query + eval + transaction): ${(Number(after - before) / 1e6 / N).toFixed(2)} ms/op`);

await prisma.organization.delete({ where: { id: org.id } });
await prisma.$disconnect();
