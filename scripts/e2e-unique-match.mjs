// Focused E2E for the buyer-match unique constraint (schema slice).
// Runs against the real DB using throwaway orgs (cascade-cleaned at the end).
// Proves: (1) the generateMatches write path is idempotent — double-run yields
// no duplicate BuyerMatch rows; (2) a direct duplicate insert on the same
// (opportunityId, buyerId) pair throws a P2002 unique-constraint violation;
// (3) org scoping is preserved (a second org's opp+buyer is unaffected).
import { PrismaClient, MatchStatus } from "@prisma/client";
import { assertTestDatabase } from "./e2e-guard.mjs";
import { scoreBuyerForOpportunity } from "../lib/matching.ts";

const prisma = new PrismaClient();

const TAG = "e2e-unique-match";
let ok = 0;
assertTestDatabase(); // abort unless DATABASE_URL targets a *_test database
const fail = [];
function assert(cond, msg) {
  if (cond) { ok++; console.log(`  ✓ ${msg}`); }
  else { fail.push(msg); console.log(`  ✗ ${msg}`); }
}

// Mirror of the generateMatches write path (server action can't run headless:
// it depends on requireUser()). Same scorer, same threshold, same upsert.
const MATCH_THRESHOLD = 25;
async function runGenerate(orgId, opportunityId, oppCriteria) {
  const buyers = await prisma.buyer.findMany({
    where: { organizationId: orgId },
    select: { id: true, targetAssetTypes: true, targetStates: true, minimumPurchaseUsd: true, maximumPurchaseUsd: true },
  });
  const existingBuyerIds = new Set(
    (await prisma.buyerMatch.findMany({ where: { opportunityId, organizationId: orgId }, select: { buyerId: true } })).map((m) => m.buyerId),
  );
  let created = 0, updated = 0;
  for (const buyer of buyers) {
    const result = scoreBuyerForOpportunity(buyer, oppCriteria);
    if (result.score < MATCH_THRESHOLD) continue;
    await prisma.buyerMatch.upsert({
      where: { opportunityId_buyerId: { opportunityId, buyerId: buyer.id } },
      update: { score: result.score, thesis: "e2e" },
      create: { organizationId: orgId, opportunityId, buyerId: buyer.id, status: MatchStatus.NEW, score: result.score, thesis: "e2e" },
    });
    if (existingBuyerIds.has(buyer.id)) updated++; else created++;
  }
  return { created, updated, considered: buyers.length };
}

async function seedOrg(slug) {
  const org = await prisma.organization.create({ data: { name: TAG, slug } });
  const property = await prisma.property.create({
    data: { organizationId: org.id, name: "Sunset Storage", assetType: "SELF_STORAGE", addressLine1: "1 Main", city: "Austin", state: "TX", estimatedValueUsd: 2_000_000 },
  });
  const opportunity = await prisma.opportunity.create({
    data: { organizationId: org.id, propertyId: property.id, title: "Sunset Storage Deal", contractValueUsd: 2_000_000 },
  });
  // Two buyers that clear the threshold (asset + state + price fit).
  const buyerA = await prisma.buyer.create({
    data: { organizationId: org.id, name: "Alpha Capital", targetAssetTypes: ["SELF_STORAGE"], targetStates: ["TX"], minimumPurchaseUsd: 1_000_000, maximumPurchaseUsd: 3_000_000 },
  });
  const buyerB = await prisma.buyer.create({
    data: { organizationId: org.id, name: "Beta Holdings", targetAssetTypes: ["SELF_STORAGE"], targetStates: ["TX"], minimumPurchaseUsd: 500_000, maximumPurchaseUsd: 5_000_000 },
  });
  const oppCriteria = { assetType: "SELF_STORAGE", state: "TX", valueUsd: 2_000_000 };
  return { org, opportunity, buyerA, buyerB, oppCriteria };
}

const orgIds = [];
try {
  console.log("Seeding throwaway org #1...");
  const a = await seedOrg(`${TAG}-${process.pid}-a`);
  orgIds.push(a.org.id);
  console.log("Seeding throwaway org #2 (org-scoping control)...");
  const b = await seedOrg(`${TAG}-${process.pid}-b`);
  orgIds.push(b.org.id);

  console.log("\n[1] First generateMatches run:");
  const r1 = await runGenerate(a.org.id, a.opportunity.id, a.oppCriteria);
  console.log(`    -> ${JSON.stringify(r1)}`);
  const after1 = await prisma.buyerMatch.count({ where: { opportunityId: a.opportunity.id } });
  assert(r1.created === 2 && r1.updated === 0, "first run creates 2, updates 0");
  assert(after1 === 2, "2 BuyerMatch rows after first run");

  console.log("\n[2] Second generateMatches run (idempotency):");
  const r2 = await runGenerate(a.org.id, a.opportunity.id, a.oppCriteria);
  console.log(`    -> ${JSON.stringify(r2)}`);
  const after2 = await prisma.buyerMatch.count({ where: { opportunityId: a.opportunity.id } });
  assert(r2.created === 0 && r2.updated === 2, "second run creates 0, updates 2 (no dupes)");
  assert(after2 === 2, "still exactly 2 BuyerMatch rows after re-run");

  console.log("\n[3] No duplicate pair exists in DB:");
  const grouped = await prisma.buyerMatch.groupBy({
    by: ["opportunityId", "buyerId"],
    where: { opportunityId: a.opportunity.id },
    _count: { _all: true },
  });
  const maxDupes = Math.max(...grouped.map((g) => g._count._all));
  assert(maxDupes === 1, "every (opportunityId, buyerId) pair appears exactly once");

  console.log("\n[4] Direct duplicate insert must throw unique violation:");
  let threw = null;
  try {
    await prisma.buyerMatch.create({
      data: { organizationId: a.org.id, opportunityId: a.opportunity.id, buyerId: a.buyerA.id, status: MatchStatus.NEW, score: 99, thesis: "dupe" },
    });
  } catch (e) {
    threw = e;
  }
  assert(threw !== null && threw.code === "P2002", `raw duplicate create throws P2002 (got ${threw ? threw.code : "no error"})`);
  const after4 = await prisma.buyerMatch.count({ where: { opportunityId: a.opportunity.id } });
  assert(after4 === 2, "duplicate insert did not add a row");

  console.log("\n[5] Org scoping preserved (org #2 untouched by org #1 runs):");
  const orgBMatches = await prisma.buyerMatch.count({ where: { opportunityId: b.opportunity.id } });
  assert(orgBMatches === 0, "org #2 opportunity has no matches (no cross-org writes)");
  const r3 = await runGenerate(b.org.id, b.opportunity.id, b.oppCriteria);
  const orgBAfter = await prisma.buyerMatch.count({ where: { opportunityId: b.opportunity.id } });
  assert(r3.created === 2 && orgBAfter === 2, "org #2 generates its own 2 matches independently");
} finally {
  console.log("\nCleaning up throwaway orgs (cascade)...");
  for (const id of orgIds) {
    await prisma.organization.delete({ where: { id } }).catch((e) => console.log(`  cleanup warn: ${e.message}`));
  }
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
