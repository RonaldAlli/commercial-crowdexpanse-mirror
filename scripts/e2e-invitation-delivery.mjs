// Focused E2E for invitation EMAIL DELIVERY (Slice 3d-ii). Kept separate from
// e2e-invitations.mjs (lifecycle) on purpose — delivery is its own concern.
// Runs against the *_test DB with throwaway orgs (cascade-cleaned). Mirrors the
// createInvite/resendInvite delivery path (server actions can't run headless:
// requireUser) using the REAL lib/invitations helpers + lib/email MessageService
// with an injected fake transport. Proves: invitation template renders an
// absolute accept URL; delivery records an EmailMessage + email.sent mirror;
// invitation is inline-only (transient failure → terminal FAILED, drain skips it,
// token never rotated automatically); explicit resend rotates + re-delivers;
// metadata only / no raw token persisted; org scoping.
import { EmailStatus, InvitationStatus, UserRole } from "@prisma/client";
import { assertTestDatabase } from "./e2e-guard.mjs";

import { prisma } from "../lib/prisma.ts";
import {
  generateInviteToken,
  hashInviteToken,
  inviteAcceptUrl,
  inviteExpiry,
  normalizeEmail,
} from "../lib/invitations.ts";
import { getEnv } from "../lib/env.ts";
import { renderTemplate, retryPolicyFor } from "../lib/email/templates/index.ts";
import { MessageService } from "../lib/email/message-service.ts";

const { ADMIN } = UserRole;
const TAG = "e2e-invite-delivery";
let ok = 0;
assertTestDatabase();
const fail = [];
function assert(cond, msg) {
  if (cond) { ok++; console.log(`  ✓ ${msg}`); }
  else { fail.push(msg); console.log(`  ✗ ${msg}`); }
}

class FakeTransport {
  constructor(results) { this.name = "fake"; this.results = results; this.calls = 0; }
  async send() { const r = this.results[Math.min(this.calls, this.results.length - 1)]; this.calls++; return r; }
}

// Mirror of createInvite's delivery step: create the invite row, then send the
// invitation email through MessageService with the absolute accept URL.
async function mirrorCreateAndDeliver(svc, { organizationId, actorId, actorName, email, role }) {
  const raw = generateInviteToken();
  const now = new Date();
  const invite = await prisma.invitation.create({
    data: {
      organizationId, email: normalizeEmail(email), role,
      tokenHash: hashInviteToken(raw), status: InvitationStatus.PENDING,
      expiresAt: inviteExpiry(now.getTime(), 7), invitedById: actorId,
    },
  });
  const emailRow = await svc.send({
    kind: "invitation", to: normalizeEmail(email), organizationId, actorId,
    correlationId: invite.id,
    data: { orgName: "Org A", inviterName: actorName, role, acceptUrl: inviteAcceptUrl(raw), expiresAt: invite.expiresAt },
  });
  return { invite, raw, emailRow };
}

// Mirror of resendInvite's rotation + delivery.
async function mirrorResendAndDeliver(svc, { invite, organizationId, actorId }) {
  const raw = generateInviteToken();
  const now = new Date();
  const rotated = await prisma.invitation.update({
    where: { id: invite.id },
    data: { tokenHash: hashInviteToken(raw), status: InvitationStatus.PENDING, expiresAt: inviteExpiry(now.getTime(), 7) },
  });
  const emailRow = await svc.send({
    kind: "invitation", to: invite.email, organizationId, actorId, correlationId: invite.id,
    data: { orgName: "Org A", role: rotated.role, acceptUrl: inviteAcceptUrl(raw), expiresAt: rotated.expiresAt },
  });
  return { raw, rotated, emailRow };
}

// ── Part A: pure — template + link builder + policy ──────────────────────────
console.log("[A] Pure — invitation template + accept URL:");
const appUrl = getEnv().appUrl;
const sampleUrl = inviteAcceptUrl("TOKEN123");
assert(sampleUrl === `${appUrl}/invite/TOKEN123`, "inviteAcceptUrl builds APP_URL + /invite/<token>");
assert(sampleUrl.startsWith("http") && sampleUrl.endsWith("/invite/TOKEN123"), "accept URL is absolute");
const r = renderTemplate("invitation", { orgName: "Acme", inviterName: "Ada", role: "Acquisitions", acceptUrl: sampleUrl, expiresAt: new Date(Date.now() + 7 * 86400000) });
assert(r.subject.includes("Acme"), "subject names the org");
assert(r.html.includes(sampleUrl) && r.html.includes("<html"), "html embeds the absolute accept URL + layout");
assert(r.text.includes(sampleUrl), "plaintext embeds the accept URL");
assert(r.version === 1, "template carries a version");

console.log("\n[A] Pure — retry policy:");
assert(retryPolicyFor("invitation") === "inline-only", "invitation is inline-only");
assert(retryPolicyFor("system_alert") === "drainable", "system_alert stays drainable");

// ── Part B: DB-backed ────────────────────────────────────────────────────────
const orgIds = [];
try {
  console.log("\n[B] Seeding org A (+ admin) and org B (scoping control)...");
  const a = await prisma.organization.create({ data: { name: "Org A", slug: `${TAG}-${process.pid}-a` } });
  orgIds.push(a.id);
  const admin = await prisma.user.create({ data: { organizationId: a.id, name: "Ada", email: `${TAG}-${process.pid}-admin@example.test`, hashedPassword: "x", role: ADMIN } });
  const b = await prisma.organization.create({ data: { name: "Org B", slug: `${TAG}-${process.pid}-b` } });
  orgIds.push(b.id);
  const rawTokens = [];

  console.log("\n[B1] Create + deliver — EmailMessage recorded, SENT, correlated + audited:");
  const okSvc = new MessageService({ transport: new FakeTransport([{ ok: true, providerMessageId: "fake-ok" }]) });
  const c1 = await mirrorCreateAndDeliver(okSvc, { organizationId: a.id, actorId: admin.id, actorName: "Ada", email: `${TAG}-${process.pid}-1@example.test`, role: ADMIN });
  rawTokens.push(c1.raw);
  assert(c1.emailRow.status === EmailStatus.SENT && c1.emailRow.template === "invitation", "invitation email SENT");
  assert(c1.emailRow.correlationId === c1.invite.id && c1.emailRow.toEmail === c1.invite.email, "row correlated to the invitation + recipient");
  assert((await prisma.activityLog.count({ where: { organizationId: a.id, eventType: "email.sent" } })) === 1, "one email.sent audit mirror for org A");

  console.log("\n[B2] Metadata only — no body columns, no raw token in the row:");
  const rawRow = await prisma.$queryRawUnsafe(`SELECT * FROM email_messages WHERE id = $1`, c1.emailRow.id);
  const cols = Object.keys(rawRow[0]);
  assert(!cols.includes("html") && !cols.includes("text") && !cols.includes("body"), "no html/text/body columns");
  assert(!JSON.stringify(rawRow[0]).includes(c1.raw), "the raw invitation token is NOT present anywhere in the row");

  console.log("\n[B3] Inline-only — transient failure is terminal FAILED, drain skips it, no rotation:");
  const flakySvc = new MessageService({ transport: new FakeTransport([{ ok: false, permanent: false, error: "timeout" }]), resolvers: {} });
  const c3 = await mirrorCreateAndDeliver(flakySvc, { organizationId: a.id, actorId: admin.id, actorName: "Ada", email: `${TAG}-${process.pid}-3@example.test`, role: ADMIN });
  rawTokens.push(c3.raw);
  assert(c3.emailRow.status === EmailStatus.FAILED && c3.emailRow.attempts === 1, "transient failure → FAILED at attempt 1 (never PENDING)");
  const hashBefore = (await prisma.invitation.findUnique({ where: { id: c3.invite.id } })).tokenHash;
  const drain = await flakySvc.drain({});
  const hashAfter = (await prisma.invitation.findUnique({ where: { id: c3.invite.id } })).tokenHash;
  assert(drain.attempted === 0, "drain does not attempt invitation rows (inline-only skipped)");
  assert(hashBefore === hashAfter, "invitation token was NOT rotated by the drain");

  console.log("\n[B4] Failure keeps the invite usable (still PENDING, token intact):");
  const stillValid = await prisma.invitation.findUnique({ where: { id: c3.invite.id } });
  assert(stillValid.status === InvitationStatus.PENDING && stillValid.tokenHash === hashInviteToken(c3.raw), "invite remains PENDING with its original token after a failed email");

  console.log("\n[B5] Explicit resend rotates the token AND re-delivers the new link:");
  const emailsBefore = await prisma.emailMessage.count({ where: { correlationId: c1.invite.id } });
  const res = await mirrorResendAndDeliver(okSvc, { invite: c1.invite, organizationId: a.id, actorId: admin.id });
  rawTokens.push(res.raw);
  assert(res.rotated.tokenHash === hashInviteToken(res.raw) && res.rotated.tokenHash !== hashInviteToken(c1.raw), "resend rotated the token (explicit admin action)");
  const emailsAfter = await prisma.emailMessage.count({ where: { correlationId: c1.invite.id } });
  assert(res.emailRow.status === EmailStatus.SENT && emailsAfter === emailsBefore + 1, "a new invitation email was delivered for the resend");

  console.log("\n[B6] No raw invitation token is persisted anywhere in email_messages:");
  const allRows = await prisma.$queryRawUnsafe(`SELECT * FROM email_messages WHERE "organizationId" = $1`, a.id);
  const blob = JSON.stringify(allRows);
  assert(rawTokens.every((t) => !blob.includes(t)), `none of the ${rawTokens.length} raw tokens appear in any email row`);

  console.log("\n[B7] Org scoping — org B saw no invitation email events:");
  assert((await prisma.activityLog.count({ where: { organizationId: b.id, eventType: { in: ["email.sent", "email.failed"] } } })) === 0, "org B has no email audit events");
} finally {
  console.log("\nCleaning up throwaway orgs (cascade)...");
  for (const id of orgIds) {
    await prisma.organization.delete({ where: { id } }).catch((e) => console.log(`  cleanup warn: ${e.message}`));
  }
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
