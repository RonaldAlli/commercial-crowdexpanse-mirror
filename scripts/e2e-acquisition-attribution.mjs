// AC-ATTR-* · acquisition attribution capture-and-retain (Seller Source Optimization).
//
// Data-level proof of the three-layer model + immutability (the seller/promote path — the human funnel):
//   AC-ATTR-1 lead captures channel (+ campaign, eventKey)
//   AC-ATTR-2 opportunity RETAINS attribution copied from the lead at creation (the same copy-by-value
//             opportunityAttributionFromSeller() that createOpportunity performs)
//   AC-ATTR-5 attribution is IMMUTABLE when the seller changes — and survives seller unlink/delete
//   AC-ATTR-3 revenue BY CHANNEL is derivable (group opportunities by channel, sum assignment fee)
// Runs against the *_test DB with a throwaway org (cascade-cleaned).
import { randomUUID } from "node:crypto";

import { prisma } from "../lib/prisma.ts";
import { assertTestDatabase } from "./e2e-guard.mjs";
import { opportunityAttributionFromSeller } from "../lib/acquisition-options.ts";

const TAG = "e2e-attr";
assertTestDatabase();
let ok = 0;
const fail = [];
const assert = (c, m) => { if (c) { ok++; console.log(`  ✓ ${m}`); } else { fail.push(m); console.log(`  ✗ ${m}`); } };

const orgIds = [];
const mkOrg = async () => {
  const o = await prisma.organization.create({ data: { name: `${TAG} ${process.pid}`, slug: `${TAG}-${process.pid}-${randomUUID().slice(0, 8)}` } });
  orgIds.push(o.id);
  return o;
};
const mkProp = (orgId) => prisma.property.create({ data: { organizationId: orgId, name: "Asset", assetType: "MULTIFAMILY", addressLine1: "1 Way", city: "Nowhere", state: "ZZ" } });

try {
  const org = await mkOrg();
  const prop = await mkProp(org.id);

  console.log("\n[AC-ATTR-1] a lead (Seller) captures channel + campaign + eventKey:");
  const seller = await prisma.seller.create({
    data: { organizationId: org.id, name: "Lead", acquisitionChannel: "DEALFLOW_PROBATE", acquisitionCampaign: "Fulton Probate July 2026", acquisitionEventKey: "job_abc" },
  });
  assert(seller.acquisitionChannel === "DEALFLOW_PROBATE" && seller.acquisitionCampaign === "Fulton Probate July 2026" && seller.acquisitionEventKey === "job_abc", "seller stores all three attribution layers");

  console.log("\n[AC-ATTR-2] opportunity RETAINS attribution copied from the lead at creation:");
  const fetched = await prisma.seller.findFirst({ where: { id: seller.id, organizationId: org.id }, select: { acquisitionChannel: true, acquisitionCampaign: true, acquisitionEventKey: true } });
  const opp = await prisma.opportunity.create({ data: { organizationId: org.id, propertyId: prop.id, sellerId: seller.id, title: "Deal", ...opportunityAttributionFromSeller(fetched) } });
  assert(opp.acquisitionChannel === "DEALFLOW_PROBATE" && opp.acquisitionCampaign === "Fulton Probate July 2026" && opp.acquisitionEventKey === "job_abc", "opportunity retains all three layers");

  console.log("\n[AC-ATTR-5] attribution is IMMUTABLE when the seller is re-channeled:");
  await prisma.seller.update({ where: { id: seller.id }, data: { acquisitionChannel: "CREXI", acquisitionCampaign: "different" } });
  const afterEdit = await prisma.opportunity.findUnique({ where: { id: opp.id } });
  assert(afterEdit.acquisitionChannel === "DEALFLOW_PROBATE" && afterEdit.acquisitionCampaign === "Fulton Probate July 2026", "re-channeling the seller does NOT change the opportunity's stamped attribution");

  console.log("\n[AC-ATTR-5b] attribution SURVIVES seller unlink/delete (sellerId → SetNull):");
  await prisma.seller.delete({ where: { id: seller.id } });
  const afterDelete = await prisma.opportunity.findUnique({ where: { id: opp.id } });
  assert(afterDelete.sellerId === null && afterDelete.acquisitionChannel === "DEALFLOW_PROBATE", "opportunity keeps attribution after the seller is deleted");

  console.log("\n[AC-ATTR-3] revenue BY CHANNEL is derivable (group by channel, sum assignment fee):");
  await prisma.opportunity.update({ where: { id: opp.id }, data: { stage: "PAID", assignmentFeeUsd: 25000 } });
  const byChannel = await prisma.opportunity.groupBy({ by: ["acquisitionChannel"], where: { organizationId: org.id, stage: "PAID" }, _sum: { assignmentFeeUsd: true }, _count: true });
  const probate = byChannel.find((r) => r.acquisitionChannel === "DEALFLOW_PROBATE");
  assert(probate && probate._sum.assignmentFeeUsd === 25000 && probate._count === 1, "revenue-by-channel returns $25,000 for DEALFLOW_PROBATE");

  console.log("\n[UNKNOWN] a directly-created opportunity (no lead) → all-null attribution, never throws:");
  const orphan = await prisma.opportunity.create({ data: { organizationId: org.id, propertyId: prop.id, title: "Direct", ...opportunityAttributionFromSeller(null) } });
  assert(orphan.acquisitionChannel === null, "no-lead opportunity has null channel (UNKNOWN)");
} finally {
  console.log("\nCleaning up throwaway orgs (cascade)...");
  for (const id of orgIds) {
    await prisma.organization.delete({ where: { id } }).catch((e) => console.log(`  cleanup warn: ${e.message}`));
  }
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
