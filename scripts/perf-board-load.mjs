// Reproduce defect #1: board load with production-like volume. Seeds N opportunities in one org and
// times the exact board query (loadBoardOpportunities). Test DB only. Run:
//   node --env-file=.env.test --import tsx scripts/perf-board-load.mjs
import { assertTestDatabase } from "./e2e-guard.mjs";
import { prisma } from "../lib/prisma.ts";

assertTestDatabase();
const TAG = "perf-board";
const N = 9641; // matches the reported production volume
const BOARD_SELECT = {
  id: true, title: true, stage: true, priority: true, contractValueUsd: true, assignmentFeeUsd: true,
  diligenceItems: { select: { key: true, status: true } },
  property: { select: { name: true, assetType: true } },
};

const org = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}` } });
console.log(`seeding ${N} properties + opportunities…`);
await prisma.property.createMany({ data: Array.from({ length: N }, (_, i) => ({ organizationId: org.id, name: `P${i}`, assetType: "MULTIFAMILY", addressLine1: `${i} Main St`, city: "Atlanta", state: "GA" })) });
const props = await prisma.property.findMany({ where: { organizationId: org.id }, select: { id: true } });
const stages = ["LEAD", "SELLER_CONTACTED", "INTERESTED_SELLER", "UNDERWRITING", "UNDER_CONTRACT", "CLOSING"];
await prisma.opportunity.createMany({ data: props.map((p, i) => ({ organizationId: org.id, propertyId: p.id, title: `Deal ${i}`, stage: stages[i % stages.length] })) });

const count = await prisma.opportunity.count({ where: { organizationId: org.id } });
const t = process.hrtime.bigint();
const rows = await prisma.opportunity.findMany({ where: { organizationId: org.id }, select: BOARD_SELECT, orderBy: { updatedAt: "desc" } });
const ms = Number(process.hrtime.bigint() - t) / 1e6;

console.log(`\nBOARD QUERY (no limit): ${rows.length} rows in ${ms.toFixed(0)} ms`);
console.log(`  → the page then renders ${rows.length} cards, EACH mounting an interactive <StageSelect> client component.`);
console.log(`  → server payload + client hydration is O(${count}); no take/skip/virtualization.`);

await prisma.organization.delete({ where: { id: org.id } });
await prisma.$disconnect();
