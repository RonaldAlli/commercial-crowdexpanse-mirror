// Branch 3 — conversation workspace data path e2e. Proves the /acquire loader: a seller's messages + calls
// are org-scoped, and buildUnifiedHistory merges them chronologically. Runs against the *_test DB.
import { randomUUID } from "node:crypto";

import { prisma } from "../lib/prisma.ts";
import { assertTestDatabase } from "./e2e-guard.mjs";
import { buildUnifiedHistory } from "../lib/comms/conversation-view.ts";

const TAG = "e2e-comms-conv";
assertTestDatabase();
let ok = 0;
const fail = [];
const assert = (c, m) => { if (c) { ok++; console.log(`  ✓ ${m}`); } else { fail.push(m); console.log(`  ✗ ${m}`); } };
const orgIds = [];
const mkOrg = async (l) => { const o = await prisma.organization.create({ data: { name: `${TAG} ${l} ${process.pid}`, slug: `${TAG}-${l}-${process.pid}-${randomUUID().slice(0, 8)}` } }); orgIds.push(o.id); return o; };

try {
  const A = await mkOrg("A");
  const B = await mkOrg("B");
  const sa = await prisma.seller.create({ data: { organizationId: A.id, name: "Lead A", phone: "(404) 555-0101" } });
  const conv = await prisma.conversation.create({ data: { organizationId: A.id, sellerId: sa.id } });

  const base = Date.now();
  await prisma.commsMessage.create({ data: { organizationId: A.id, conversationId: conv.id, sellerId: sa.id, channel: "SMS", direction: "OUTBOUND", status: "SENT", body: "first", createdAt: new Date(base) } });
  await prisma.callRecord.create({ data: { organizationId: A.id, conversationId: conv.id, sellerId: sa.id, direction: "OUTBOUND", status: "COMPLETED", disposition: "Connected", durationSec: 90, createdAt: new Date(base + 1000) } });
  await prisma.commsMessage.create({ data: { organizationId: A.id, conversationId: conv.id, sellerId: sa.id, channel: "EMAIL", direction: "INBOUND", status: "RECEIVED", subject: "Re", body: "reply", createdAt: new Date(base + 2000) } });

  // Mirror the /acquire loader.
  const [messages, calls] = await Promise.all([
    prisma.commsMessage.findMany({ where: { organizationId: A.id, sellerId: sa.id }, orderBy: { createdAt: "asc" } }),
    prisma.callRecord.findMany({ where: { organizationId: A.id, sellerId: sa.id }, orderBy: { createdAt: "asc" } }),
  ]);
  const history = buildUnifiedHistory(
    messages.map((m) => ({ id: m.id, channel: m.channel, direction: m.direction, body: m.body, subject: m.subject, status: m.status, createdAt: m.createdAt })),
    calls.map((c) => ({ id: c.id, direction: c.direction, status: c.status, durationSec: c.durationSec, disposition: c.disposition, createdAt: c.createdAt })),
  );
  assert(history.length === 3, "seller thread = 2 messages + 1 call");
  assert(history.map((i) => i.kind).join(",") === "message,call,message", "unified history ordered chronologically (SMS → call → email)");

  const bMsgs = await prisma.commsMessage.count({ where: { organizationId: B.id } });
  assert(bMsgs === 0, "org B loads none of org A's conversation (org-scoped)");
} finally {
  console.log("\nCleaning up throwaway orgs (cascade)...");
  for (const id of orgIds) await prisma.organization.delete({ where: { id } }).catch((e) => console.log(`  cleanup warn: ${e.message}`));
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
