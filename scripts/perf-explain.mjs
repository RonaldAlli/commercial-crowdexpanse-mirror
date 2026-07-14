// Standardized EXPLAIN helper (PQ-4) — planner-level evidence for optimizations.
// Runs `EXPLAIN (ANALYZE, VERBOSE, BUFFERS)` on labelled raw SQL that MIRRORS the
// shapes Prisma issues for a given read path, against the seeded perf org in the
// *_test DB. It is a measurement tool only — it never mutates data or app queries.
//
// Usage:  npm run perf:explain            # explains the Opportunities board path
//         node --import tsx scripts/perf-explain.mjs
//
// The board's Prisma query fans out into separate SQL statements (one driving
// Opportunity query, then relation fetches via `WHERE id IN (...)`). We EXPLAIN
// each shape both BEFORE (legacy `include` — all Opportunity scalars + property
// {name,city,state,assetType} + seller{name}) and AFTER (narrowed `select` — the
// six columns the board card renders + the propertyId FK + property{name,assetType},
// with the seller relation dropped entirely), so the payload reduction is visible.
import { assertTestDatabase } from "./e2e-guard.mjs";
import { prisma } from "../lib/prisma.ts";
import { seedPerfOrg, PERF_SLUG } from "./seed-perf.mjs";

async function explain(label, sql, params = []) {
  const rows = await prisma.$queryRawUnsafe(`EXPLAIN (ANALYZE, VERBOSE, BUFFERS) ${sql}`, ...params);
  console.log(`\n── ${label} ${"─".repeat(Math.max(0, 72 - label.length))}`);
  console.log(sql.replace(/\s+/g, " ").trim());
  console.log("   ┈┈┈");
  for (const r of rows) console.log(`   ${r["QUERY PLAN"]}`);
}

async function main() {
  assertTestDatabase({ log: true });
  console.log("\nSeeding / reusing perf dataset…");
  const { orgId, reused } = await seedPerfOrg();
  console.log(`  ${reused ? "reused existing" : "seeded"} perf org (${PERF_SLUG}): ${orgId}`);

  // The set of property ids the board would hydrate — used to mirror the relation
  // fetch Prisma issues as `WHERE id IN (...)`.
  const propIds = `SELECT "propertyId" FROM opportunities WHERE "organizationId" = $1`;

  console.log("\n════════════════════════════ BEFORE (legacy include) ════════════════════════════");
  await explain(
    "Board driving query — all Opportunity scalars",
    `SELECT id, "organizationId", "propertyId", "sellerId", title, stage, source, priority,
            "targetCloseDate", "contractValueUsd", "assignmentFeeUsd", summary, "createdAt", "updatedAt"
     FROM opportunities WHERE "organizationId" = $1 ORDER BY "updatedAt" DESC`,
    [orgId],
  );
  await explain(
    "Property relation fetch — name, city, state, assetType",
    `SELECT id, name, city, state, "assetType" FROM properties WHERE id IN (${propIds})`,
    [orgId],
  );
  await explain(
    "Seller relation fetch — name  (ELIMINATED after)",
    `SELECT id, name FROM sellers WHERE id IN (SELECT "sellerId" FROM opportunities WHERE "organizationId" = $1 AND "sellerId" IS NOT NULL)`,
    [orgId],
  );

  console.log("\n════════════════════════════ AFTER (narrowed select) ════════════════════════════");
  await explain(
    "Board driving query — six card columns + propertyId FK",
    `SELECT id, title, stage, priority, "contractValueUsd", "assignmentFeeUsd", "propertyId"
     FROM opportunities WHERE "organizationId" = $1 ORDER BY "updatedAt" DESC`,
    [orgId],
  );
  await explain(
    "Property relation fetch — name, assetType",
    `SELECT id, name, "assetType" FROM properties WHERE id IN (${propIds})`,
    [orgId],
  );
  console.log("\n(Seller relation fetch is no longer issued — the board renders no seller.)");
  console.log("\n═══════════════════════════════════════════════════════════════════════════════════");
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
