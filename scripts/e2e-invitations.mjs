// Focused E2E for copy-link team invitations (Invitations slice).
// Runs against the real DB using throwaway orgs (cascade-cleaned at the end).
// Mirrors the create/accept/revoke write paths through the REAL helpers in
// lib/invitations (token gen/hash, centralized email lookup, pure guards, lazy
// EXPIRED write-through) — the server actions can't run headless (requireUser /
// cookies). Proves: create, hashed-token storage, duplicate-pending guard,
// global email conflict, accept-creates-user, single-use, expiry (incl. EXPIRED
// persistence), revoke, org scoping, and the audit trail.
import { InvitationStatus, UserRole } from "@prisma/client";
import { assertTestDatabase } from "./e2e-guard.mjs";

import { prisma } from "../lib/prisma.ts";
import {
  generateInviteToken,
  hashInviteToken,
  hasActivePendingInvite,
  findInvitationByRawToken,
  inviteAcceptError,
  inviteCreateError,
  inviteExpiry,
  inviteResendError,
  isEmailTaken,
  markExpiredIfNeeded,
  normalizeEmail,
} from "../lib/invitations.ts";
import { getOrgSettings } from "../lib/org-settings.ts";
import { hashPassword, verifyPassword } from "../lib/password.ts";

const TAG = "e2e-invitations";
let ok = 0;
assertTestDatabase(); // abort unless DATABASE_URL targets a *_test database
const fail = [];
function assert(cond, msg) {
  if (cond) { ok++; console.log(`  ✓ ${msg}`); }
  else { fail.push(msg); console.log(`  ✗ ${msg}`); }
}

// --- mirrors of the server actions (same helpers, same order, same guards) ---

async function mirrorCreate(orgId, actorId, email, role) {
  const normalized = normalizeEmail(email);
  const now = new Date();
  const settings = await getOrgSettings(orgId);
  const emailAlreadyUser = await isEmailTaken(normalized);
  const hasActivePending = await hasActivePendingInvite(orgId, normalized, now);
  const err = inviteCreateError({ email: normalized, role, emailAlreadyUser, hasActivePending });
  if (err) return { error: err };
  const raw = generateInviteToken();
  await prisma.invitation.create({
    data: {
      organizationId: orgId, email: normalized, role,
      tokenHash: hashInviteToken(raw), status: InvitationStatus.PENDING,
      expiresAt: inviteExpiry(now.getTime(), settings.inviteExpiryDays), invitedById: actorId,
    },
  });
  await prisma.activityLog.create({
    data: { organizationId: orgId, actorId, eventType: "invitation.created", eventLabel: `Invited ${normalized}` },
  });
  return { token: raw };
}

async function mirrorAccept(token, name, password) {
  const invite = await findInvitationByRawToken(token);
  const nowMs = Date.now();
  const status = invite ? await markExpiredIfNeeded(invite, nowMs) : undefined;
  const emailTaken = invite ? await isEmailTaken(invite.email) : false;
  const err = inviteAcceptError({ found: Boolean(invite), status, expiresAt: invite?.expiresAt, nowMs, emailTaken });
  if (err) return { error: err };
  let userId;
  const created = await prisma.$transaction(async (tx) => {
    const claim = await tx.invitation.updateMany({
      where: { id: invite.id, status: InvitationStatus.PENDING },
      data: { status: InvitationStatus.ACCEPTED, acceptedAt: new Date() },
    });
    if (claim.count === 0) throw new Error("__consumed__");
    const user = await tx.user.create({
      data: { organizationId: invite.organizationId, name: name.trim(), email: invite.email, hashedPassword: hashPassword(password), role: invite.role },
      select: { id: true },
    });
    await tx.invitation.update({ where: { id: invite.id }, data: { acceptedUserId: user.id } });
    return user;
  }).catch((e) => { if (e.message === "__consumed__") return null; throw e; });
  if (!created) return { error: "This invitation has already been used." };
  userId = created.id;
  await prisma.activityLog.create({
    data: { organizationId: invite.organizationId, actorId: userId, eventType: "invitation.accepted", eventLabel: `${name.trim()} joined via invitation` },
  });
  return { userId };
}

async function mirrorRevoke(orgId, actorId, invitationId) {
  const invite = await prisma.invitation.findFirst({
    where: { id: invitationId, organizationId: orgId },
    select: { id: true, email: true, status: true },
  });
  if (!invite) return { error: "Invitation not found." };
  if (invite.status !== InvitationStatus.PENDING) return { error: "Only pending invitations can be revoked." };
  await prisma.invitation.update({ where: { id: invite.id }, data: { status: InvitationStatus.REVOKED } });
  await prisma.activityLog.create({
    data: { organizationId: orgId, actorId, eventType: "invitation.revoked", eventLabel: `Revoked invite for ${invite.email}` },
  });
  return {};
}

// Mirror of resendInvite: rotate the token IN PLACE (same row), reset expiry +
// PENDING, audit invitation.resent. Pending/expired/revoked are resendable.
async function mirrorResend(orgId, actorId, invitationId) {
  const invite = await prisma.invitation.findFirst({
    where: { id: invitationId, organizationId: orgId },
    select: { id: true, email: true, status: true, role: true },
  });
  const err = inviteResendError({ found: Boolean(invite), status: invite?.status });
  if (err) return { error: err };
  const now = new Date();
  const settings = await getOrgSettings(orgId);
  const raw = generateInviteToken();
  await prisma.invitation.update({
    where: { id: invite.id },
    data: {
      tokenHash: hashInviteToken(raw), status: InvitationStatus.PENDING,
      expiresAt: inviteExpiry(now.getTime(), settings.inviteExpiryDays), acceptedAt: null, acceptedUserId: null,
    },
  });
  await prisma.activityLog.create({
    data: { organizationId: orgId, actorId, eventType: "invitation.resent", eventLabel: `Resent invite for ${invite.email}` },
  });
  return { token: raw };
}

const orgIds = [];
try {
  const a = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-a` } });
  orgIds.push(a.id);
  const adminA = await prisma.user.create({ data: { organizationId: a.id, name: "Ada Admin", email: `${TAG}-${process.pid}-admin-a@example.test`, hashedPassword: "x", role: UserRole.ADMIN } });
  const b = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-b` } });
  orgIds.push(b.id);
  const adminB = await prisma.user.create({ data: { organizationId: b.id, name: "Bob Admin", email: `${TAG}-${process.pid}-admin-b@example.test`, hashedPassword: "x", role: UserRole.ADMIN } });
  // An account that already exists (in org B) — for the global email-conflict test.
  const existingEmail = `${TAG}-${process.pid}-existing@example.test`;
  await prisma.user.create({ data: { organizationId: b.id, name: "Existing", email: existingEmail, hashedPassword: "x", role: UserRole.ANALYST } });

  const newEmail = `${TAG}-${process.pid}-newhire@example.test`;

  console.log("\n[1] Create invite (fresh email):");
  const c1 = await mirrorCreate(a.id, adminA.id, newEmail, UserRole.ANALYST);
  assert(!c1.error && typeof c1.token === "string", "invite created, raw token returned");
  const stored = await prisma.invitation.findFirst({ where: { organizationId: a.id, email: newEmail } });
  assert(stored?.status === InvitationStatus.PENDING, "row persisted as PENDING");
  assert(stored?.tokenHash === hashInviteToken(c1.token) && stored?.tokenHash !== c1.token, "only the HMAC hash is stored, never the raw token");

  console.log("\n[2] Duplicate pending guard:");
  const c2 = await mirrorCreate(a.id, adminA.id, newEmail, UserRole.ANALYST);
  assert(c2.error === "There's already a pending invite for that email.", "second active invite rejected");

  console.log("\n[3] Global email conflict (email already an account elsewhere):");
  const c3 = await mirrorCreate(a.id, adminA.id, existingEmail, UserRole.ANALYST);
  assert(c3.error === "A user with that email already exists.", "existing-account email rejected");

  console.log("\n[4] Accept invite -> creates user:");
  const ac = await mirrorAccept(c1.token, "New Hire", "password123");
  assert(!ac.error && ac.userId, "accept succeeded");
  const newUser = await prisma.user.findUnique({ where: { id: ac.userId } });
  assert(newUser?.organizationId === a.id && newUser?.role === UserRole.ANALYST, "user created in org A with invited role");
  assert(newUser && verifyPassword("password123", newUser.hashedPassword), "password round-trips");
  const acceptedInvite = await prisma.invitation.findUnique({ where: { id: stored.id } });
  assert(acceptedInvite?.status === InvitationStatus.ACCEPTED && acceptedInvite?.acceptedUserId === ac.userId, "invite marked ACCEPTED with acceptedUserId");

  console.log("\n[5] Single-use — replay the accepted token:");
  const ac2 = await mirrorAccept(c1.token, "Imposter", "password123");
  assert(ac2.error === "This invitation has already been used.", "replayed token rejected");

  console.log("\n[6] Expiry (lazy EXPIRED persistence):");
  const expEmail = `${TAG}-${process.pid}-expired@example.test`;
  const c6 = await mirrorCreate(a.id, adminA.id, expEmail, UserRole.ANALYST);
  const expInvite = await prisma.invitation.findFirst({ where: { organizationId: a.id, email: expEmail } });
  await prisma.invitation.update({ where: { id: expInvite.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  const ac6 = await mirrorAccept(c6.token, "Too Late", "password123");
  assert(ac6.error === "This invitation has expired.", "expired invite rejected on accept");
  const afterExp = await prisma.invitation.findUnique({ where: { id: expInvite.id } });
  assert(afterExp?.status === InvitationStatus.EXPIRED, "stale PENDING flipped to EXPIRED (audit trail)");

  console.log("\n[7] Revoke -> accept rejected:");
  const revEmail = `${TAG}-${process.pid}-revoked@example.test`;
  const c7 = await mirrorCreate(a.id, adminA.id, revEmail, UserRole.ANALYST);
  const revInvite = await prisma.invitation.findFirst({ where: { organizationId: a.id, email: revEmail } });
  const rv = await mirrorRevoke(a.id, adminA.id, revInvite.id);
  assert(!rv.error, "revoke succeeded");
  const ac7 = await mirrorAccept(c7.token, "Revoked", "password123");
  assert(ac7.error === "This invitation has been revoked.", "revoked invite rejected on accept");

  console.log("\n[8] Org scoping — org B admin revoking an org A invite:");
  const scopeEmail = `${TAG}-${process.pid}-scope@example.test`;
  const c8 = await mirrorCreate(a.id, adminA.id, scopeEmail, UserRole.ANALYST);
  const scopeInvite = await prisma.invitation.findFirst({ where: { organizationId: a.id, email: scopeEmail } });
  const rv8 = await mirrorRevoke(b.id, adminB.id, scopeInvite.id);
  assert(rv8.error === "Invitation not found.", "cross-org revoke treated as not found");
  const stillPending = await prisma.invitation.findUnique({ where: { id: scopeInvite.id } });
  assert(stillPending?.status === InvitationStatus.PENDING, "org A invite unchanged by org B");

  console.log("\n[9] Audit trail + membership:");
  const created = await prisma.activityLog.count({ where: { organizationId: a.id, eventType: "invitation.created" } });
  const accepted = await prisma.activityLog.count({ where: { organizationId: a.id, eventType: "invitation.accepted" } });
  const revoked = await prisma.activityLog.count({ where: { organizationId: a.id, eventType: "invitation.revoked" } });
  assert(created === 4, `4 invitation.created (got ${created})`);
  assert(accepted === 1, `1 invitation.accepted (got ${accepted})`);
  assert(revoked === 1, `1 invitation.revoked (got ${revoked})`);
  const orgAUsers = await prisma.user.count({ where: { organizationId: a.id } });
  assert(orgAUsers === 2, "org A has exactly 2 users (admin + accepted invitee)");

  // ── Resend (Slice 3b) — token rotation in place ───────────────────────────
  console.log("\n[10] Resend rotates the token in place (old link dies, new works):");
  const resendEmail = `${TAG}-${process.pid}-resend@example.test`;
  const c10 = await mirrorCreate(a.id, adminA.id, resendEmail, UserRole.ANALYST);
  const inv10 = await prisma.invitation.findFirst({ where: { organizationId: a.id, email: resendEmail } });
  const oldExpiry = inv10.expiresAt.getTime();
  await prisma.invitation.update({ where: { id: inv10.id }, data: { expiresAt: new Date(Date.now() - 1000) } }); // age it
  const r10 = await mirrorResend(a.id, adminA.id, inv10.id);
  assert(!r10.error && r10.token && r10.token !== c10.token, "resend returns a new raw token, different from the old one");
  assert((await findInvitationByRawToken(c10.token)) === null, "the previous link no longer resolves (hash rotated)");
  const rotated = await findInvitationByRawToken(r10.token);
  assert(rotated?.id === inv10.id, "the new link resolves to the SAME invitation row (one row per person)");
  assert(rotated?.status === InvitationStatus.PENDING && rotated.expiresAt.getTime() > oldExpiry, "resend resets status to PENDING and pushes expiry forward");

  console.log("\n[11] Accept works on the rotated link:");
  const ac11 = await mirrorAccept(r10.token, "Resent Hire", "password123");
  assert(!ac11.error && ac11.userId, "the fresh link accepts and creates the user");
  assert((await prisma.invitation.count({ where: { organizationId: a.id, email: resendEmail } })) === 1, "still exactly one invitation row for that email");

  console.log("\n[12] Expired and revoked invites are resendable (reactivated):");
  const r12a = await mirrorResend(a.id, adminA.id, expInvite.id); // was EXPIRED (from [6])
  assert(!r12a.error && (await prisma.invitation.findUnique({ where: { id: expInvite.id } }))?.status === InvitationStatus.PENDING, "EXPIRED invite reactivated to PENDING");
  assert((await findInvitationByRawToken(c6.token)) === null, "the expired invite's old link is invalidated");
  const r12b = await mirrorResend(a.id, adminA.id, revInvite.id); // was REVOKED (from [7])
  assert(!r12b.error && (await prisma.invitation.findUnique({ where: { id: revInvite.id } }))?.status === InvitationStatus.PENDING, "REVOKED invite reactivated to PENDING");

  console.log("\n[13] Accepted invite cannot be resent; cross-org resend denied:");
  const r13 = await mirrorResend(a.id, adminA.id, stored.id); // stored is ACCEPTED (from [4])
  assert(r13.error === "This invitation has already been accepted.", "resend of an accepted invite rejected");
  const r13b = await mirrorResend(b.id, adminB.id, scopeInvite.id); // org A invite, org B actor
  assert(r13b.error === "Invitation not found.", "cross-org resend treated as not found");

  console.log("\n[14] Resend audit trail:");
  const resent = await prisma.activityLog.count({ where: { organizationId: a.id, eventType: "invitation.resent" } });
  assert(resent === 3, `3 invitation.resent (got ${resent})`); // [10], [12a], [12b]
  assert((await prisma.activityLog.count({ where: { organizationId: b.id, eventType: "invitation.resent" } })) === 0, "no resent events leaked to org B");
} finally {
  console.log("\nCleaning up throwaway orgs (cascade)...");
  for (const id of orgIds) {
    await prisma.organization.delete({ where: { id } }).catch((e) => console.log(`  cleanup warn: ${e.message}`));
  }
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
