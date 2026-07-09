// Focused E2E for notifications (Notifications slice).
// Runs against the real DB using throwaway orgs (cascade-cleaned at the end).
// Drives the REAL lib/notifications used by the layout badge and /notifications
// page. Proves: unread counts org activity by others after the read cursor,
// self-exclusion, system (null-actor) inclusion, mark-all-read advances the
// cursor, new events re-raise unread, org scoping, and the feed cap.
import { prisma } from "../lib/prisma.ts";
import { unreadCount, recentNotifications, markAllRead, NOTIFICATIONS_CAP } from "../lib/notifications.ts";

const TAG = "e2e-notifications";
let ok = 0;
const fail = [];
function assert(cond, msg) {
  if (cond) { ok++; console.log(`  ✓ ${msg}`); }
  else { fail.push(msg); console.log(`  ✗ ${msg}`); }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function logEvent(orgId, actorId, label) {
  return prisma.activityLog.create({
    data: { organizationId: orgId, actorId, eventType: "test.event", eventLabel: label },
  });
}

const orgIds = [];
try {
  const a = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-a` } });
  orgIds.push(a.id);
  const actor = await prisma.user.create({ data: { organizationId: a.id, name: "Actor", email: `${TAG}-${process.pid}-actor@example.test`, hashedPassword: "x", role: "ADMIN" } });
  const recipient = await prisma.user.create({ data: { organizationId: a.id, name: "Recipient", email: `${TAG}-${process.pid}-rcpt@example.test`, hashedPassword: "x", role: "ANALYST" } });

  const b = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-b` } });
  orgIds.push(b.id);
  const actorB = await prisma.user.create({ data: { organizationId: b.id, name: "ActorB", email: `${TAG}-${process.pid}-actorb@example.test`, hashedPassword: "x", role: "ADMIN" } });

  console.log("\n[1] Unread counts others' events after the cursor:");
  await logEvent(a.id, actor.id, "e1");
  await logEvent(a.id, actor.id, "e2");
  await logEvent(a.id, actor.id, "e3");
  assert((await unreadCount(recipient.id, a.id)) === 3, "3 events by another user → unread 3");

  console.log("\n[2] Self-exclusion:");
  await logEvent(a.id, recipient.id, "own1");
  await logEvent(a.id, recipient.id, "own2");
  assert((await unreadCount(recipient.id, a.id)) === 3, "recipient's own actions don't raise their unread");

  console.log("\n[3] System (null-actor) events included:");
  await logEvent(a.id, null, "system1");
  assert((await unreadCount(recipient.id, a.id)) === 4, "null-actor event counts → unread 4");

  console.log("\n[4] Feed excludes self, flags unread:");
  const feed = await recentNotifications(recipient.id, a.id);
  assert(feed.length === 4, "feed has 4 rows (self-excluded)");
  assert(feed.every((r) => r.actorId !== recipient.id), "no self-authored rows in feed");
  assert(feed.every((r) => r.unread === true), "all rows flagged unread");

  console.log("\n[5] Mark all read:");
  const marked = await markAllRead(recipient.id, a.id);
  assert(marked === 4, "markAllRead reports 4 marked");
  assert((await unreadCount(recipient.id, a.id)) === 0, "unread is 0 after mark-all-read");

  console.log("\n[6] New event after read re-raises unread:");
  await wait(15); // ensure createdAt is strictly after the just-set cursor
  await logEvent(a.id, actor.id, "e4");
  assert((await unreadCount(recipient.id, a.id)) === 1, "one new event → unread 1");

  console.log("\n[7] Org scoping — other org's events don't count:");
  for (let i = 0; i < 5; i++) await logEvent(b.id, actorB.id, `b${i}`);
  assert((await unreadCount(recipient.id, a.id)) === 1, "org B events ignored for org A recipient");

  console.log("\n[8] Feed cap:");
  for (let i = 0; i < NOTIFICATIONS_CAP + 5; i++) await logEvent(a.id, actor.id, `bulk${i}`);
  const capped = await recentNotifications(recipient.id, a.id);
  assert(capped.length === NOTIFICATIONS_CAP, `feed capped at ${NOTIFICATIONS_CAP}`);
} finally {
  console.log("\nCleaning up throwaway orgs (cascade)...");
  for (const id of orgIds) {
    await prisma.organization.delete({ where: { id } }).catch((e) => console.log(`  cleanup warn: ${e.message}`));
  }
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
