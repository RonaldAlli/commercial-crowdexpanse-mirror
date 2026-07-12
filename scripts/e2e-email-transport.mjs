// Focused E2E for the email transport infrastructure (Slice 3d-i).
// Runs against the *_test DB with throwaway orgs (cascade-cleaned). Exercises the
// REAL lib/email stack (templates, MessageService, outbox persistence, drain,
// ActivityLog mirror) with an injected programmable fake transport — nothing
// leaves the box and no env/provider is required. Proves: template rendering,
// SMTP error classification, transport selection, PENDING→SENT, permanent
// failure, transient-then-drain recovery, max-attempts exhaustion, metadata-only
// storage (no body persisted), org-scoped audit mirror, and the unresolved-drain
// guard.
import { EmailStatus } from "@prisma/client";
import { assertTestDatabase } from "./e2e-guard.mjs";

import { prisma } from "../lib/prisma.ts";
import { renderTemplate } from "../lib/email/templates/index.ts";
import { transportFromEnv, isPermanentSmtpError } from "../lib/email/transports/index.ts";
import { MessageService } from "../lib/email/message-service.ts";

const TAG = "e2e-email";
let ok = 0;
assertTestDatabase();
const fail = [];
function assert(cond, msg) {
  if (cond) { ok++; console.log(`  ✓ ${msg}`); }
  else { fail.push(msg); console.log(`  ✗ ${msg}`); }
}

// Programmable transport: a scripted list of SendResults, indexed by call count
// (the last entry repeats). No network, fully deterministic.
class FakeTransport {
  constructor(results) { this.name = "fake"; this.results = results; this.calls = 0; }
  async send() {
    const r = this.results[Math.min(this.calls, this.results.length - 1)];
    this.calls++;
    return r;
  }
}

const RESOLVER = { system_alert: async () => ({ heading: "Reissued", message: "rebuilt at drain" }) };
const ALERT = { kind: "system_alert", data: { heading: "Heads up", message: "Something happened." } };

// ── Part A: pure — rendering, classification, transport selection ────────────
console.log("[A] Pure — template rendering:");
const rendered = renderTemplate("system_alert", ALERT.data);
assert(rendered.subject === "Heads up", "subject comes from the heading");
assert(rendered.html.includes("Something happened.") && rendered.html.includes("<html"), "html includes body + layout shell");
assert(rendered.text.includes("Something happened."), "plaintext fallback includes the message");
assert(rendered.version === 1, "rendered output carries templateVersion");

console.log("\n[A] Pure — SMTP error classification:");
assert(isPermanentSmtpError({ code: "EAUTH" }) === true, "EAUTH is permanent");
assert(isPermanentSmtpError({ responseCode: 550 }) === true, "5xx is permanent");
assert(isPermanentSmtpError({ responseCode: 421 }) === false, "4xx is transient");
assert(isPermanentSmtpError({ code: "ETIMEDOUT" }) === false, "timeout is transient");

console.log("\n[A] Pure — transport selection (no EMAIL_PROVIDER → console):");
assert(transportFromEnv().name === "console", "default provider is console (never sends in test/CI)");

// ── Part B: DB-backed ───────────────────────────────────────────────────────
const orgIds = [];
async function clearEmails() {
  await prisma.emailMessage.deleteMany({ where: { OR: [{ organizationId: { in: orgIds } }, { toEmail: { contains: TAG } }] } });
}

try {
  console.log("\n[B] Seeding org A + org B (scoping control)...");
  const a = await prisma.organization.create({ data: { name: "Org A", slug: `${TAG}-${process.pid}-a` } });
  orgIds.push(a.id);
  const b = await prisma.organization.create({ data: { name: "Org B", slug: `${TAG}-${process.pid}-b` } });
  orgIds.push(b.id);
  const to = `${TAG}-${process.pid}@example.test`;

  console.log("\n[B1] Happy path — PENDING row written then advanced to SENT:");
  const okSvc = new MessageService({ transport: new FakeTransport([{ ok: true, providerMessageId: "fake-ok" }]) });
  const row1 = await okSvc.send({ ...ALERT, to, organizationId: a.id, correlationId: "corr-1" });
  assert(row1.status === EmailStatus.SENT, "status is SENT");
  assert(row1.attempts === 1 && row1.sentAt !== null && row1.providerMessageId === "fake-ok", "attempts=1, sentAt + providerMessageId set");
  assert(row1.templateVersion === 1 && row1.subject === "Heads up", "row records template version + subject");

  console.log("\n[B2] Metadata only — no body/link/token persisted:");
  const raw = await prisma.$queryRawUnsafe(`SELECT * FROM email_messages WHERE id = $1`, row1.id);
  const cols = Object.keys(raw[0]);
  assert(!cols.includes("html") && !cols.includes("text") && !cols.includes("body"), "email_messages has no html/text/body columns");
  assert(cols.includes("subject") && cols.includes("template") && cols.includes("templateVersion"), "stores subject + template + templateVersion metadata");

  console.log("\n[B3] Audit mirror — org-scoped email.sent:");
  assert((await prisma.activityLog.count({ where: { organizationId: a.id, eventType: "email.sent" } })) === 1, "one email.sent ActivityLog for org A");

  console.log("\n[B4] Permanent failure → FAILED, no retry:");
  await clearEmails();
  const permSvc = new MessageService({ transport: new FakeTransport([{ ok: false, permanent: true, error: "bad address" }]) });
  const row4 = await permSvc.send({ ...ALERT, to, organizationId: a.id });
  assert(row4.status === EmailStatus.FAILED && row4.attempts === 1, "permanent failure → FAILED at attempt 1");
  assert((await prisma.activityLog.count({ where: { organizationId: a.id, eventType: "email.failed" } })) === 1, "one email.failed ActivityLog for org A");

  console.log("\n[B5] Transient failure → PENDING, then drain recovers → SENT:");
  await clearEmails();
  const flakySvc = new MessageService({
    transport: new FakeTransport([{ ok: false, permanent: false, error: "timeout" }, { ok: true, providerMessageId: "fake-drained" }]),
    resolvers: RESOLVER,
  });
  const row5 = await flakySvc.send({ ...ALERT, to, organizationId: a.id, correlationId: "corr-5" });
  assert(row5.status === EmailStatus.PENDING && row5.attempts === 1, "transient failure leaves PENDING (attempts 1 < max)");
  const drain5 = await flakySvc.drain({});
  const row5b = await prisma.emailMessage.findUnique({ where: { id: row5.id } });
  assert(drain5.sent === 1 && row5b.status === EmailStatus.SENT && row5b.attempts === 2, "drain re-attempted via resolver → SENT (attempts 2)");

  console.log("\n[B6] Exhaustion — repeated transient failures reach FAILED at maxAttempts:");
  await clearEmails();
  const deadSvc = new MessageService({
    transport: new FakeTransport([{ ok: false, permanent: false, error: "timeout" }]),
    resolvers: RESOLVER,
  });
  const row6 = await deadSvc.send({ ...ALERT, to, organizationId: a.id }); // attempt 1 → PENDING
  await deadSvc.drain({}); // attempt 2 → PENDING
  await deadSvc.drain({}); // attempt 3 → FAILED (== maxAttempts)
  const row6b = await prisma.emailMessage.findUnique({ where: { id: row6.id } });
  assert(row6b.status === EmailStatus.FAILED && row6b.attempts === 3, "reaches FAILED at maxAttempts (3)");
  const drainAfter = await deadSvc.drain({});
  assert(drainAfter.attempted === 0, "drain skips rows at maxAttempts (no further attempts)");

  console.log("\n[B7] Unresolved drain guard — no resolver → row left untouched:");
  await clearEmails();
  const noResolverSvc = new MessageService({ transport: new FakeTransport([{ ok: false, permanent: false, error: "timeout" }]) });
  const row7 = await noResolverSvc.send({ ...ALERT, to, organizationId: a.id });
  const drain7 = await noResolverSvc.drain({});
  const row7b = await prisma.emailMessage.findUnique({ where: { id: row7.id } });
  assert(drain7.unresolved === 1 && drain7.attempted === 0, "row with no resolver is counted unresolved, not attempted");
  assert(row7b.status === EmailStatus.PENDING && row7b.attempts === 1, "unresolved row left untouched");

  console.log("\n[B8] System email (no org) — sends without an audit mirror:");
  await clearEmails();
  const sysSvc = new MessageService({ transport: new FakeTransport([{ ok: true, providerMessageId: "fake-sys" }]) });
  const row8 = await sysSvc.send({ ...ALERT, to: `${TAG}-sys@example.test` }); // no organizationId
  assert(row8.status === EmailStatus.SENT && row8.organizationId === null, "system email SENT with null organizationId");
  await prisma.emailMessage.delete({ where: { id: row8.id } });

  console.log("\n[B9] Org scoping — org B saw none of org A's email events:");
  assert((await prisma.activityLog.count({ where: { organizationId: b.id, eventType: { in: ["email.sent", "email.failed"] } } })) === 0, "org B has no email audit events");
} finally {
  console.log("\nCleaning up throwaway orgs (cascade)...");
  await clearEmails().catch(() => {});
  for (const id of orgIds) {
    await prisma.organization.delete({ where: { id } }).catch((e) => console.log(`  cleanup warn: ${e.message}`));
  }
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
