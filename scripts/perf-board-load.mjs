// PB-1 measurement: board load BEFORE (unbounded) vs AFTER (bounded scan + grouped counts). Seeds N
// opportunities in one org (test DB). Run: node --env-file=.env.test --import tsx scripts/perf-board-load.mjs
import { assertTestDatabase } from "./e2e-guard.mjs";
import { prisma } from "../lib/prisma.ts";

assertTestDatabase();
const TAG = "perf-board";
const N = 9641;
const BOARD_SCAN = 500;
const BOARD_PER_COLUMN = 25;
const STAGE_ORDER = ["LEAD", "SELLER_CONTACTED", "INTERESTED_SELLER", "FINANCIALS_REQUESTED", "T12_RECEIVED", "RENT_ROLL_RECEIVED", "UNDERWRITING", "OFFER_READY", "LOI_SENT", "UNDER_CONTRACT", "BUYER_MATCHED", "CLOSING", "PAID"];
const BOARD_SELECT = { id: true, title: true, stage: true, priority: true, contractValueUsd: true, assignmentFeeUsd: true, diligenceItems: { select: { key: true, status: true } }, property: { select: { name: true, assetType: true } } };
const ms = (t) => (Number(process.hrtime.bigint() - t) / 1e6).toFixed(0);

const org = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}` } });
console.log(`seeding ${N} properties + opportunities…`);
await prisma.property.createMany({ data: Array.from({ length: N }, (_, i) => ({ organizationId: org.id, name: `P${i}`, assetType: "MULTIFAMILY", addressLine1: `${i} Main St`, city: "Atlanta", state: "GA" })) });
const props = await prisma.property.findMany({ where: { organizationId: org.id }, select: { id: true } });
await prisma.opportunity.createMany({ data: props.map((p, i) => ({ organizationId: org.id, propertyId: p.id, title: `Deal ${i}`, stage: STAGE_ORDER[i % STAGE_ORDER.length] })) });

// BEFORE — 1 unbounded query, renders every row as a card
let t = process.hrtime.bigint();
const all = await prisma.opportunity.findMany({ where: { organizationId: org.id }, select: BOARD_SELECT, orderBy: { updatedAt: "desc" } });
const beforeMs = ms(t);

// AFTER — 2 cheap queries (bounded scan + grouped counts), capped per column in memory
t = process.hrtime.bigint();
const [scan, grouped] = await Promise.all([
  prisma.opportunity.findMany({ where: { organizationId: org.id }, select: BOARD_SELECT, orderBy: { updatedAt: "desc" }, take: BOARD_SCAN }),
  prisma.opportunity.groupBy({ by: ["stage"], where: { organizationId: org.id }, _count: { _all: true } }),
]);
const afterMs = ms(t);
const byStage = new Map(STAGE_ORDER.map((s) => [s, 0]));
for (const o of scan) byStage.set(o.stage, (byStage.get(o.stage) ?? 0) + 1);
const rendered = STAGE_ORDER.reduce((sum, s) => sum + Math.min(byStage.get(s) ?? 0, BOARD_PER_COLUMN), 0);

console.log(`\n${'BEFORE (unbounded)'.padEnd(26)} queries=1  time=${beforeMs}ms  rows=${all.length}  rendered cards=${all.length}  client <StageSelect>=${all.length}`);
console.log(`${'AFTER  (bounded PB-1)'.padEnd(26)} queries=2  time=${afterMs}ms  scan=${scan.length}  rendered cards≤${rendered}  (cap ${BOARD_PER_COLUMN}/col, true counts via groupBy)`);
console.log(`  payload/hydration is now O(${rendered}) instead of O(${all.length}); remainder reachable via "View all → List".`);

await prisma.organization.delete({ where: { id: org.id } });
await prisma.$disconnect();
