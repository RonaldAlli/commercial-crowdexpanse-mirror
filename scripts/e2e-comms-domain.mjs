// Integrated Communications Desk (v1.4) Branch 1 — domain model e2e. Proves the channel-agnostic
// Conversation / CommsMessage / CallRecord / CommsProviderConfig model: one conversation per seller,
// unified history (messages + calls), delivery-state, org tenant isolation, and encrypted-at-rest secrets.
import { randomUUID } from "node:crypto";
import crypto from "node:crypto";

import { prisma } from "../lib/prisma.ts";
import { assertTestDatabase } from "./e2e-guard.mjs";
import { encryptSecret, decryptSecret } from "../lib/comms/secret-box.ts";

const TAG = "e2e-comms";
assertTestDatabase();
let ok = 0;
const fail = [];
const assert = (c, m) => { if (c) { ok++; console.log(`  ✓ ${m}`); } else { fail.push(m); console.log(`  ✗ ${m}`); } };
const orgIds = [];
const mkOrg = async (label) => {
  const o = await prisma.organization.create({ data: { name: `${TAG} ${label} ${process.pid}`, slug: `${TAG}-${label}-${process.pid}-${randomUUID().slice(0, 8)}` } });
  orgIds.push(o.id);
  return o;
};
const KEY = crypto.randomBytes(32).toString("hex");

try {
  const A = await mkOrg("A");
  const B = await mkOrg("B");
  const sa = await prisma.seller.create({ data: { organizationId: A.id, name: "Lead A", phone: "(404) 555-0101" } });
  const sb = await prisma.seller.create({ data: { organizationId: B.id, name: "Lead B", phone: "(404) 555-0202" } });

  console.log("\n[conversation] one unified conversation per seller:");
  const conv = await prisma.conversation.create({ data: { organizationId: A.id, sellerId: sa.id } });
  assert(conv.id != null, "conversation created for seller A");
  let dupThrew = false;
  try { await prisma.conversation.create({ data: { organizationId: A.id, sellerId: sa.id } }); } catch { dupThrew = true; }
  assert(dupThrew, "a second conversation for the same seller is rejected (sellerId unique)");

  console.log("\n[messages + calls] unified chronological history:");
  const msg = await prisma.commsMessage.create({ data: { organizationId: A.id, conversationId: conv.id, sellerId: sa.id, channel: "SMS", direction: "OUTBOUND", body: "Hi, following up on your property.", toAddress: sa.phone } });
  assert(msg.status === "QUEUED", "outbound SMS starts QUEUED");
  const sent = await prisma.commsMessage.update({ where: { id: msg.id }, data: { status: "SENT", provider: "TELNYX", providerMessageId: "tlx_msg_1", sentAt: new Date() } });
  assert(sent.status === "SENT" && sent.providerMessageId === "tlx_msg_1", "delivery-state advances to SENT with a provider message id");
  await prisma.commsMessage.create({ data: { organizationId: A.id, conversationId: conv.id, sellerId: sa.id, channel: "EMAIL", direction: "INBOUND", subject: "Re: your offer", body: "Interested — call me.", status: "RECEIVED", provider: "TELNYX", externalEventId: "tlx_evt_1" } });
  await prisma.callRecord.create({ data: { organizationId: A.id, conversationId: conv.id, sellerId: sa.id, direction: "OUTBOUND", status: "COMPLETED", toNumber: sa.phone, provider: "TELNYX", providerCallId: "tlx_call_1", durationSec: 214, disposition: "Connected" } });
  const [msgCount, callCount] = await Promise.all([
    prisma.commsMessage.count({ where: { conversationId: conv.id } }),
    prisma.callRecord.count({ where: { conversationId: conv.id } }),
  ]);
  assert(msgCount === 2 && callCount === 1, "history = 2 messages (SMS + email) + 1 call under one conversation");

  console.log("\n[idempotency] inbound provider events dedupe on (provider, externalEventId):");
  let dedupeThrew = false;
  try { await prisma.commsMessage.create({ data: { organizationId: A.id, conversationId: conv.id, channel: "SMS", direction: "INBOUND", body: "dup", provider: "TELNYX", externalEventId: "tlx_evt_1" } }); } catch { dedupeThrew = true; }
  assert(dedupeThrew, "a duplicate provider event id is rejected (webhook idempotency)");

  console.log("\n[secrets] provider config stores the API key ENCRYPTED at rest:");
  const apiKey = "KEY_live_9f3a2bcd";
  const cfg = await prisma.commsProviderConfig.create({ data: { organizationId: A.id, smsEnabled: true, voiceEnabled: true, fromNumber: "+14045550000", apiKeyEnc: encryptSecret(apiKey, KEY), apiKeyLast4: apiKey.slice(-4) } });
  assert(cfg.apiKeyEnc !== apiKey && !cfg.apiKeyEnc.includes(apiKey), "stored apiKeyEnc is ciphertext, not the plaintext key");
  assert(decryptSecret(cfg.apiKeyEnc, KEY) === apiKey, "server can decrypt the key with the comms encryption key");
  assert(cfg.apiKeyLast4 === "bcd" || cfg.apiKeyLast4 === apiKey.slice(-4), "masked last-4 hint stored for the UI");

  console.log("\n[tenant isolation] org B cannot see org A's conversation/messages:");
  const bMsgs = await prisma.commsMessage.count({ where: { organizationId: B.id } });
  const bConvForA = await prisma.conversation.findFirst({ where: { organizationId: B.id, sellerId: sa.id } });
  assert(bMsgs === 0 && bConvForA === null, "org B sees none of org A's comms (org-scoped)");
  void sb;
} finally {
  console.log("\nCleaning up throwaway orgs (cascade)...");
  for (const id of orgIds) await prisma.organization.delete({ where: { id } }).catch((e) => console.log(`  cleanup warn: ${e.message}`));
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
