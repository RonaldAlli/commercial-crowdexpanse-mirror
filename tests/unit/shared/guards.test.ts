import { test } from "node:test";
import assert from "node:assert/strict";
import { InvitationStatus } from "@prisma/client";

// Pure decision guards that live in DB-coupled modules. Importing the modules
// constructs a PrismaClient but opens no connection; these tests exercise only
// the pure functions (regression coverage — the DB paths are E2E-tested).
import { orgSettingsError } from "../../../lib/org-settings";
import { inviteAcceptError, inviteCreateError, inviteResendError } from "../../../lib/invitations";

test("orgSettingsError accepts valid bounds and rejects invalid ones", () => {
  assert.equal(orgSettingsError({ inviteExpiryDays: 7, defaultInviteRole: "ACQUISITIONS" }), null);
  assert.match(String(orgSettingsError({ inviteExpiryDays: 0, defaultInviteRole: "ANALYST" })), /between 1 and 90/);
  assert.match(String(orgSettingsError({ inviteExpiryDays: 91, defaultInviteRole: "ANALYST" })), /between 1 and 90/);
  assert.match(String(orgSettingsError({ inviteExpiryDays: 3.5, defaultInviteRole: "ANALYST" })), /whole number/);
  assert.equal(orgSettingsError({ inviteExpiryDays: 7, defaultInviteRole: "ADMIN" }), "Admin can't be the default invitation role.");
  assert.equal(orgSettingsError({ inviteExpiryDays: 7, defaultInviteRole: "NOPE" }), "Invalid default role.");
});

test("inviteCreateError validates email, role, and duplicate/existing state", () => {
  const good = { email: "a@b.com", role: "ANALYST", emailAlreadyUser: false, hasActivePending: false };
  assert.equal(inviteCreateError(good), null);
  assert.match(String(inviteCreateError({ ...good, email: "bad" })), /valid email/);
  assert.match(String(inviteCreateError({ ...good, role: "NOPE" })), /Invalid role/);
  assert.match(String(inviteCreateError({ ...good, emailAlreadyUser: true })), /already exists/);
  assert.match(String(inviteCreateError({ ...good, hasActivePending: true })), /pending invite/);
});

test("inviteResendError blocks only accepted/not-found invites", () => {
  assert.equal(inviteResendError({ found: true, status: InvitationStatus.PENDING }), null);
  assert.equal(inviteResendError({ found: true, status: InvitationStatus.EXPIRED }), null);
  assert.equal(inviteResendError({ found: true, status: InvitationStatus.REVOKED }), null);
  assert.match(String(inviteResendError({ found: false })), /not found/);
  assert.match(String(inviteResendError({ found: true, status: InvitationStatus.ACCEPTED })), /already been accepted/);
});

test("inviteAcceptError enforces status, expiry, and email-conflict", () => {
  const now = Date.now();
  const future = new Date(now + 86_400_000);
  const past = new Date(now - 86_400_000);
  assert.equal(inviteAcceptError({ found: true, status: InvitationStatus.PENDING, expiresAt: future, nowMs: now, emailTaken: false }), null);
  assert.match(String(inviteAcceptError({ found: false, nowMs: now, emailTaken: false })), /invalid/);
  assert.match(String(inviteAcceptError({ found: true, status: InvitationStatus.ACCEPTED, nowMs: now, emailTaken: false })), /already been used/);
  assert.match(String(inviteAcceptError({ found: true, status: InvitationStatus.REVOKED, nowMs: now, emailTaken: false })), /revoked/);
  assert.match(String(inviteAcceptError({ found: true, status: InvitationStatus.EXPIRED, nowMs: now, emailTaken: false })), /expired/);
  assert.match(String(inviteAcceptError({ found: true, status: InvitationStatus.PENDING, expiresAt: past, nowMs: now, emailTaken: false })), /expired/);
  assert.match(String(inviteAcceptError({ found: true, status: InvitationStatus.PENDING, expiresAt: future, nowMs: now, emailTaken: true })), /already exists/);
});
