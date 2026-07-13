// Perf dataset seeder (PQ-3). Seeds a dedicated org in the *_test DB with a
// realistic volume so the measurement harness exposes real query costs. Uses the
// _test guard; deterministic (index-derived fields, explicit ids — no randomness)
// so runs are reproducible. Idempotent: drops and recreates the perf org.
import { OpportunityStage, TaskStatus } from "@prisma/client";
import { assertTestDatabase } from "./e2e-guard.mjs";
import { prisma } from "../lib/prisma.ts";

export const PERF_SLUG = "perf-org";
export const PERF_COUNTS = { sellers: 300, buyers: 500, properties: 2000, opportunities: 1000, tasks: 5000 };

const STAGES = Object.values(OpportunityStage);
const STATUSES = Object.values(TaskStatus);
const ASSET_TYPES = ["MULTIFAMILY", "SELF_STORAGE", "RETAIL", "OFFICE", "INDUSTRIAL", "MIXED_USE", "LAND"];
const STATES = ["GA", "FL", "TX", "NC", "SC", "TN", "AL"];
const CITIES = ["Atlanta", "Savannah", "Macon", "Augusta", "Columbus", "Athens", "Marietta"];

async function batch(rows, fn, size = 1000) {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}

export async function seedPerfOrg({ reseed = false } = {}) {
  assertTestDatabase();
  const existing = await prisma.organization.findUnique({ where: { slug: PERF_SLUG }, select: { id: true } });
  if (existing && !reseed) {
    const oppCount = await prisma.opportunity.count({ where: { organizationId: existing.id } });
    if (oppCount >= PERF_COUNTS.opportunities) return { orgId: existing.id, counts: PERF_COUNTS, reused: true };
  }
  if (existing) await prisma.organization.delete({ where: { id: existing.id } }); // cascade wipe

  const org = await prisma.organization.create({ data: { name: "Perf Org", slug: PERF_SLUG } });
  const orgId = org.id;

  const sellers = Array.from({ length: PERF_COUNTS.sellers }, (_, i) => ({
    id: `perf-seller-${i}`, organizationId: orgId, name: `Seller ${i}`, company: `Holdings ${i} LLC`,
    email: `seller${i}@perf.test`, city: CITIES[i % CITIES.length], state: STATES[i % STATES.length],
  }));
  const buyers = Array.from({ length: PERF_COUNTS.buyers }, (_, i) => ({
    id: `perf-buyer-${i}`, organizationId: orgId, name: `Buyer ${i}`, company: `Capital ${i} Partners`,
    email: `buyer${i}@perf.test`, targetStates: [STATES[i % STATES.length]],
    minimumPurchaseUsd: 250_000, maximumPurchaseUsd: 5_000_000,
  }));
  const properties = Array.from({ length: PERF_COUNTS.properties }, (_, i) => ({
    id: `perf-prop-${i}`, organizationId: orgId, name: `Property ${i}`,
    assetType: ASSET_TYPES[i % ASSET_TYPES.length], addressLine1: `${100 + i} Main St`,
    city: CITIES[i % CITIES.length], state: STATES[i % STATES.length],
    sellerId: `perf-seller-${i % PERF_COUNTS.sellers}`,
  }));
  const opportunities = Array.from({ length: PERF_COUNTS.opportunities }, (_, i) => ({
    id: `perf-opp-${i}`, organizationId: orgId, propertyId: `perf-prop-${i}`,
    sellerId: `perf-seller-${i % PERF_COUNTS.sellers}`, title: `Deal ${i} — ${CITIES[i % CITIES.length]}`,
    source: i % 3 === 0 ? "Expired Listing" : "Cold Outreach", summary: `Opportunity ${i} summary text.`,
    stage: STAGES[i % STAGES.length],
  }));
  const tasks = Array.from({ length: PERF_COUNTS.tasks }, (_, i) => ({
    id: `perf-task-${i}`, organizationId: orgId, opportunityId: `perf-opp-${i % PERF_COUNTS.opportunities}`,
    title: `Task ${i}`, status: STATUSES[i % STATUSES.length],
    dueDate: i % 4 === 0 ? null : new Date(2026, 0, 1 + (i % 300)),
  }));

  await batch(sellers, (r) => prisma.seller.createMany({ data: r }));
  await batch(buyers, (r) => prisma.buyer.createMany({ data: r }));
  await batch(properties, (r) => prisma.property.createMany({ data: r }));
  await batch(opportunities, (r) => prisma.opportunity.createMany({ data: r }));
  await batch(tasks, (r) => prisma.task.createMany({ data: r }));

  return { orgId, counts: PERF_COUNTS, reused: false };
}

// Direct invocation: seed and report.
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const { orgId, counts, reused } = await seedPerfOrg({ reseed: process.argv.includes("--reseed") });
    console.log(`Perf org ${reused ? "reused" : "seeded"} (${orgId}):`, JSON.stringify(counts));
  } finally {
    await prisma.$disconnect();
  }
}
