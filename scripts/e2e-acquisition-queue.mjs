// Seller Acquisition Workspace — queue + daily metrics e2e. Proves the "who to work next" ordering
// (due/overdue follow-ups first, then unscheduled leads oldest-first; DEAD / DO_NOT_CONTACT excluded)
// and the daily activity counts, over a seeded org. Runs against the *_test DB (throwaway, cascade-cleaned).
import { randomUUID } from "node:crypto";

import { prisma } from "../lib/prisma.ts";
import { assertTestDatabase } from "./e2e-guard.mjs";
import { getAcquisitionQueue, getDailyAcquisitionMetrics } from "../lib/acquisition-queue.ts";

const TAG = "e2e-acq-queue";
assertTestDatabase();
let ok = 0;
const fail = [];
const assert = (c, m) => { if (c) { ok++; console.log(`  ✓ ${m}`); } else { fail.push(m); console.log(`  ✗ ${m}`); } };
const orgIds = [];

try {
  const org = await prisma.organization.create({ data: { name: `${TAG} ${process.pid}`, slug: `${TAG}-${process.pid}-${randomUUID().slice(0, 8)}` } });
  orgIds.push(org.id);
  const now = new Date();
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
  const yesterday = new Date(now.getTime() - 24 * 3600 * 1000);
  const tomorrow = new Date(now.getTime() + 24 * 3600 * 1000);

  const mk = (name, data) => prisma.seller.create({ data: { organizationId: org.id, name, ...data } });
  // Creation order sets createdAt (oldest first): A then E among the "fresh" bucket.
  const A = await mk("A-new-nofollowup", { outreachStatus: "NEW" });
  const E = await mk("E-attempting-future", { outreachStatus: "ATTEMPTING", nextFollowUpAt: tomorrow });
  const B = await mk("B-contacted-due", { outreachStatus: "CONTACTED", nextFollowUpAt: yesterday });
  await mk("C-dead", { outreachStatus: "DEAD" });
  await mk("D-dnc", { outreachStatus: "DO_NOT_CONTACT" });

  console.log("\n[queue] due follow-ups first, then unscheduled oldest-first; DEAD/DNC excluded:");
  const queue = await getAcquisitionQueue(org.id, now, 50);
  const ids = queue.map((q) => q.id);
  assert(JSON.stringify(ids) === JSON.stringify([B.id, A.id, E.id]),
    `order = [B(due), A(null,oldest), E(future)] — got ${queue.map((q) => q.name).join(", ")}`);
  assert(queue.every((q) => q.outreachStatus !== "DEAD" && q.outreachStatus !== "DO_NOT_CONTACT"), "DEAD and DO_NOT_CONTACT excluded");

  console.log("\n[metrics] daily activity from authoritative rows:");
  await prisma.contactTouch.create({ data: { organizationId: org.id, sellerId: A.id, type: "CALL", summary: "left vm" } });
  await prisma.contactTouch.create({ data: { organizationId: org.id, sellerId: B.id, type: "NOTE", summary: "note" } });
  await prisma.activityLog.create({ data: { organizationId: org.id, sellerId: B.id, eventType: "seller.outreach_status_changed", eventLabel: "Outreach status: Contacted → Qualified" } });
  const m = await getDailyAcquisitionMetrics(org.id, startOfDay);
  assert(m.callsToday === 1, `callsToday = 1 (got ${m.callsToday})`);
  assert(m.touchesToday === 2, `touchesToday = 2 (call + note) (got ${m.touchesToday})`);
  assert(m.statusUpdatesToday === 1, `statusUpdatesToday = 1 (got ${m.statusUpdatesToday})`);
  assert(m.queueSize === 3, `queueSize = 3 workable (A,B,E; excludes DEAD/DNC) (got ${m.queueSize})`);
} finally {
  console.log("\nCleaning up throwaway orgs (cascade)...");
  for (const id of orgIds) await prisma.organization.delete({ where: { id } }).catch((e) => console.log(`  cleanup warn: ${e.message}`));
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
