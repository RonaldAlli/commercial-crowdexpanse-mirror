// Performance measurement harness (PQ-3) — STRICTLY OBSERVATIONAL.
// Seeds (or reuses) the perf org in the *_test DB, then times each hot read path
// against real volume and prints a p50/p95 baseline table WITH the dataset size.
// It replicates the exact query SHAPES the app uses (board findMany+includes,
// searchAll, list count+page) — it does NOT modify any app/lib query.
import { assertTestDatabase } from "./e2e-guard.mjs";
import { prisma } from "../lib/prisma.ts";
import { percentiles } from "../lib/telemetry.ts";
import { searchAll } from "../lib/search.ts";
import { seedPerfOrg, PERF_COUNTS } from "./seed-perf.mjs";

const ITERATIONS = 25;
const WARMUP = 3;

// Board: every org opportunity, newest first. Two shapes are measured so the
// PQ-4 payload narrowing is an apples-to-apples comparison in one process:
//  - OPP_INCLUDE  = the legacy include (all Opportunity scalars + property
//    {name,city,state,assetType} + seller{name}); still the LIST view's shape.
//  - BOARD_SELECT = the narrowed board select the app now uses (six card columns
//    + property{name,assetType}; propertyId FK added by Prisma; no seller).
const OPP_INCLUDE = {
  property: { select: { name: true, city: true, state: true, assetType: true } },
  seller: { select: { name: true } },
};
const BOARD_SELECT = {
  id: true, title: true, stage: true, priority: true,
  contractValueUsd: true, assignmentFeeUsd: true,
  property: { select: { name: true, assetType: true } },
};

async function measure(fn) {
  const samples = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const start = performance.now();
    await fn();
    const ms = performance.now() - start;
    if (i >= WARMUP) samples.push(ms);
  }
  return percentiles(samples);
}

function listQuery(model, orgId) {
  const where = { organizationId: orgId };
  return () => Promise.all([
    prisma[model].count({ where }),
    prisma[model].findMany({ where, orderBy: { updatedAt: "desc" }, skip: 0, take: 20 }),
  ]);
}

async function main() {
  assertTestDatabase({ log: true });
  console.log("\nSeeding / reusing perf dataset…");
  const { orgId, counts, reused } = await seedPerfOrg();
  console.log(`  ${reused ? "reused existing" : "seeded"} perf org: ${JSON.stringify(counts)}\n`);

  const paths = [
    { name: "Board (narrowed select — PQ-4)", rows: `${counts.opportunities} opps`,
      fn: () => prisma.opportunity.findMany({ where: { organizationId: orgId }, select: BOARD_SELECT, orderBy: { updatedAt: "desc" } }) },
    { name: "Board (legacy include — pre-PQ-4)", rows: `${counts.opportunities} opps`,
      fn: () => prisma.opportunity.findMany({ where: { organizationId: orgId }, include: OPP_INCLUDE, orderBy: { updatedAt: "desc" } }) },
    { name: 'Global Search ("Atlanta")', rows: `${counts.properties} props / ${counts.sellers} sellers`,
      fn: () => searchAll(orgId, "Atlanta") },
    { name: "Seller list (count + page 1)", rows: `${counts.sellers} sellers`, fn: listQuery("seller", orgId) },
    { name: "Buyer list (count + page 1)", rows: `${counts.buyers} buyers`, fn: listQuery("buyer", orgId) },
    { name: "Property list (count + page 1)", rows: `${counts.properties} props`, fn: listQuery("property", orgId) },
    { name: "Opportunity list (count + page 1)", rows: `${counts.opportunities} opps`, fn: listQuery("opportunity", orgId) },
    { name: "Task list (count + page 1)", rows: `${counts.tasks} tasks`, fn: listQuery("task", orgId) },
  ];

  const results = [];
  for (const p of paths) results.push({ ...p, stats: await measure(p.fn) });

  const nameW = Math.max(...results.map((r) => r.name.length));
  const rowW = Math.max(...results.map((r) => r.rows.length));
  console.log("══════════════════════════════════════════════════════════════════════════════");
  console.log(`Performance Baseline (PQ-3) — ${ITERATIONS - WARMUP} samples/path (${WARMUP} warmup discarded)`);
  console.log(`Dataset: ${counts.opportunities} opps · ${counts.properties} props · ${counts.tasks} tasks · ${counts.buyers} buyers · ${counts.sellers} sellers`);
  console.log("══════════════════════════════════════════════════════════════════════════════");
  console.log(`${"Path".padEnd(nameW)}  ${"Dataset".padEnd(rowW)}   p50     p95     p99     mean`);
  console.log("─".repeat(nameW + rowW + 40));
  for (const r of results) {
    const s = r.stats;
    console.log(
      `${r.name.padEnd(nameW)}  ${r.rows.padEnd(rowW)}  ${`${s.p50}`.padStart(6)}  ${`${s.p95}`.padStart(6)}  ${`${s.p99}`.padStart(6)}  ${`${s.mean}`.padStart(6)}  (ms)`,
    );
  }
  console.log("══════════════════════════════════════════════════════════════════════════════");
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
