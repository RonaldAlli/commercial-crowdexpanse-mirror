// Business Query Primitives (Phase 1) — e2e over a deterministic dataset. Proves the five primitives
// compute realized revenue / closed-won conversion / buyer coverage / campaign + event revenue with the
// frozen semantics: executed-only revenue, distinct opportunity counts, zero-denominator→null, explicit
// UNKNOWN bucket, deterministic ordering. Runs against the *_test DB (throwaway org, cascade-cleaned).
import { randomUUID } from "node:crypto";

import { prisma } from "../lib/prisma.ts";
import { assertTestDatabase } from "./e2e-guard.mjs";
import {
  revenueByChannel,
  closedWonConversionByChannel,
  buyerCoverageByChannel,
  assignmentRevenueByCampaign,
  revenueByAcquisitionEvent,
} from "../lib/business-intelligence/index.ts";

const TAG = "e2e-bi";
assertTestDatabase();
let ok = 0;
const fail = [];
const assert = (c, m) => { if (c) { ok++; console.log(`  ✓ ${m}`); } else { fail.push(m); console.log(`  ✗ ${m}`); } };
const orgIds = [];

const mkOpp = (orgId, propertyId, attr) =>
  prisma.opportunity.create({ data: { organizationId: orgId, propertyId, title: "Deal", ...attr } });
const executed = (orgId, opportunityId, fee) =>
  prisma.assignmentRecord.create({ data: { organizationId: orgId, opportunityId, status: "EXECUTED", executedFeeUsdSnapshot: fee } });

try {
  const org = await prisma.organization.create({ data: { name: `${TAG} ${process.pid}`, slug: `${TAG}-${process.pid}-${randomUUID().slice(0, 8)}` } });
  orgIds.push(org.id);
  const prop = await prisma.property.create({ data: { organizationId: org.id, name: "Asset", assetType: "MULTIFAMILY", addressLine1: "1 Way", city: "X", state: "GA" } });
  const buyer = await prisma.buyer.create({ data: { organizationId: org.id, name: "Buyer" } });

  // Dataset:
  // opp1 OWNER_DIRECT / C1 / E1  — EXECUTED $30,000, has a match
  // opp2 OWNER_DIRECT / C1 / E1  — no assignment (not converted), no match
  // opp3 CREXI / null / null      — EXECUTED $10,000, no match
  // opp4 null (UNKNOWN)           — EXECUTED $5,000, has a match
  const opp1 = await mkOpp(org.id, prop.id, { acquisitionChannel: "OWNER_DIRECT", acquisitionCampaign: "C1", acquisitionEventKey: "E1" });
  const opp2 = await mkOpp(org.id, prop.id, { acquisitionChannel: "OWNER_DIRECT", acquisitionCampaign: "C1", acquisitionEventKey: "E1" });
  const opp3 = await mkOpp(org.id, prop.id, { acquisitionChannel: "CREXI" });
  const opp4 = await mkOpp(org.id, prop.id, {});
  await executed(org.id, opp1.id, 30000);
  await executed(org.id, opp3.id, 10000);
  await executed(org.id, opp4.id, 5000);
  await prisma.buyerMatch.create({ data: { organizationId: org.id, opportunityId: opp1.id, buyerId: buyer.id } });
  await prisma.buyerMatch.create({ data: { organizationId: org.id, opportunityId: opp4.id, buyerId: buyer.id } });

  console.log("\n[revenueByChannel] executed-only, ordered by revenue desc, UNKNOWN bucket present:");
  const rev = await revenueByChannel(org.id);
  assert(JSON.stringify(rev) === JSON.stringify([
    { channel: "OWNER_DIRECT", executedRevenueUsd: 30000, dealCount: 1 },
    { channel: "CREXI", executedRevenueUsd: 10000, dealCount: 1 },
    { channel: "UNKNOWN", executedRevenueUsd: 5000, dealCount: 1 },
  ]), "revenueByChannel = OWNER_DIRECT 30k, CREXI 10k, UNKNOWN 5k (desc)");

  console.log("\n[closedWonConversionByChannel] distinct opps; rate desc, key tie-break; nulls n/a here:");
  const conv = await closedWonConversionByChannel(org.id);
  assert(JSON.stringify(conv) === JSON.stringify([
    { channel: "CREXI", opportunityCount: 1, convertedOpportunityCount: 1, conversionRate: 1 },
    { channel: "UNKNOWN", opportunityCount: 1, convertedOpportunityCount: 1, conversionRate: 1 },
    { channel: "OWNER_DIRECT", opportunityCount: 2, convertedOpportunityCount: 1, conversionRate: 0.5 },
  ]), "conversion: CREXI 1.0, UNKNOWN 1.0 (tie→key asc), OWNER_DIRECT 0.5");

  console.log("\n[buyerCoverageByChannel] coverage rate desc:");
  const cov = await buyerCoverageByChannel(org.id);
  assert(JSON.stringify(cov) === JSON.stringify([
    { channel: "UNKNOWN", opportunityCount: 1, opportunitiesWithMatch: 1, coverageRate: 1 },
    { channel: "OWNER_DIRECT", opportunityCount: 2, opportunitiesWithMatch: 1, coverageRate: 0.5 },
    { channel: "CREXI", opportunityCount: 1, opportunitiesWithMatch: 0, coverageRate: 0 },
  ]), "coverage: UNKNOWN 1.0, OWNER_DIRECT 0.5, CREXI 0.0");

  console.log("\n[assignmentRevenueByCampaign] null campaign → UNKNOWN, aggregated:");
  const byCamp = await assignmentRevenueByCampaign(org.id);
  assert(JSON.stringify(byCamp) === JSON.stringify([
    { campaign: "C1", executedRevenueUsd: 30000, dealCount: 1 },
    { campaign: "UNKNOWN", executedRevenueUsd: 15000, dealCount: 2 },
  ]), "campaign: C1 30k (1), UNKNOWN 15k (2 = opp3 + opp4)");

  console.log("\n[revenueByAcquisitionEvent] null eventKey → UNKNOWN, aggregated:");
  const byEvent = await revenueByAcquisitionEvent(org.id);
  assert(JSON.stringify(byEvent) === JSON.stringify([
    { eventKey: "E1", executedRevenueUsd: 30000, dealCount: 1 },
    { eventKey: "UNKNOWN", executedRevenueUsd: 15000, dealCount: 2 },
  ]), "event: E1 30k (1), UNKNOWN 15k (2)");

  console.log("\n[zero-denominator] an org with no opportunities → empty result (no rows, never a 0-rate row):");
  const empty = await prisma.organization.create({ data: { name: `${TAG}-empty ${process.pid}`, slug: `${TAG}-empty-${process.pid}-${randomUUID().slice(0, 8)}` } });
  orgIds.push(empty.id);
  assert((await closedWonConversionByChannel(empty.id)).length === 0 && (await revenueByChannel(empty.id)).length === 0, "no population → no rows");
} finally {
  console.log("\nCleaning up throwaway orgs (cascade)...");
  for (const id of orgIds) await prisma.organization.delete({ where: { id } }).catch((e) => console.log(`  cleanup warn: ${e.message}`));
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
