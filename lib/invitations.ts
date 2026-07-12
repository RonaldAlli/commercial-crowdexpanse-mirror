import crypto from "node:crypto";
import { InvitationStatus, UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Copy-link team invitations.
//
// This module is the single choke point for two concerns that are cheap today
// but expensive to change if scattered:
//   1. Token generation + hashed storage (the raw token is never persisted).
//   2. Email -> account resolution. Today email is globally unique and a user
//      belongs to exactly one organization. If that ever changes (consultants,
//      brokers, investors spanning multiple orgs), the uniqueness/membership
//      semantics change HERE only — no caller reaches for prisma.user directly.
// ---------------------------------------------------------------------------

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_ROLES = new Set<string>(Object.values(UserRole));

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("SESSION_SECRET is not configured (needs at least 16 characters).");
  }
  return secret;
}

/** Canonical email form used everywhere invitations touch email. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// --- token: generate raw (shown once), store only the HMAC hash -------------

/** A URL-safe 256-bit token. Returned to the admin once; never stored raw. */
export function generateInviteToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/** HMAC-SHA256(SESSION_SECRET, raw) — mirrors the session-cookie signing so a
 *  DB leak of hashes cannot be turned into working links without the secret. */
export function hashInviteToken(raw: string): string {
  return crypto.createHmac("sha256", getSecret()).update(raw).digest("hex");
}

/** Expiry from a moment, using the org's configured number of days. */
export function inviteExpiry(nowMs: number, days: number): Date {
  return new Date(nowMs + days * MS_PER_DAY);
}

// --- centralized account / invite lookups -----------------------------------

/** THE email -> account resolver. Change multi-org semantics here only. */
export async function findAccountByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email: normalizeEmail(email) },
    select: { id: true, email: true, organizationId: true },
  });
}

/** True when the email already belongs to an account (anywhere, today). */
export async function isEmailTaken(email: string): Promise<boolean> {
  return Boolean(await findAccountByEmail(email));
}

/** True when an active (PENDING, unexpired) invite already exists for org+email. */
export async function hasActivePendingInvite(
  organizationId: string,
  email: string,
  now: Date,
): Promise<boolean> {
  const existing = await prisma.invitation.findFirst({
    where: {
      organizationId,
      email: normalizeEmail(email),
      status: InvitationStatus.PENDING,
      expiresAt: { gt: now },
    },
    select: { id: true },
  });
  return Boolean(existing);
}

/** Resolve a raw token to its invitation (or null) via the stored hash. */
export async function findInvitationByRawToken(raw: string) {
  return prisma.invitation.findUnique({
    where: { tokenHash: hashInviteToken(raw) },
  });
}

/**
 * Lazily realize the EXPIRED state: a PENDING invite past its expiry is flipped
 * to EXPIRED so reporting/analytics/cleanup have an explicit status instead of
 * inferring it from timestamps. Returns the effective status.
 */
export async function markExpiredIfNeeded(
  invite: { id: string; status: InvitationStatus; expiresAt: Date },
  nowMs: number,
): Promise<InvitationStatus> {
  if (invite.status === InvitationStatus.PENDING && invite.expiresAt.getTime() <= nowMs) {
    await prisma.invitation.update({
      where: { id: invite.id },
      data: { status: InvitationStatus.EXPIRED },
    });
    return InvitationStatus.EXPIRED;
  }
  return invite.status;
}

// --- pure decision guards (shared verbatim by actions + E2E) ----------------

/** null = allowed to create; string = reason to reject. */
export function inviteCreateError(input: {
  email: string;
  role: string;
  emailAlreadyUser: boolean;
  hasActivePending: boolean;
}): string | null {
  const { email, role, emailAlreadyUser, hasActivePending } = input;
  if (!EMAIL_RE.test(normalizeEmail(email))) return "Enter a valid email address.";
  if (!VALID_ROLES.has(role)) return "Invalid role.";
  if (emailAlreadyUser) return "A user with that email already exists.";
  if (hasActivePending) return "There's already a pending invite for that email.";
  return null;
}

/**
 * null = the invitation may be resent (token rotates in place); string = reason
 * it can't. PENDING, EXPIRED, and REVOKED are all resendable — only an already-
 * ACCEPTED invite is terminal.
 */
export function inviteResendError(input: {
  found: boolean;
  status?: InvitationStatus;
}): string | null {
  const { found, status } = input;
  if (!found || !status) return "Invitation not found.";
  if (status === InvitationStatus.ACCEPTED) return "This invitation has already been accepted.";
  return null;
}

/** null = invitation is acceptable; string = reason it isn't. */
export function inviteAcceptError(input: {
  found: boolean;
  status?: InvitationStatus;
  expiresAt?: Date;
  nowMs: number;
  emailTaken: boolean;
}): string | null {
  const { found, status, expiresAt, nowMs, emailTaken } = input;
  if (!found || !status) return "This invitation is invalid.";
  if (status === InvitationStatus.ACCEPTED) return "This invitation has already been used.";
  if (status === InvitationStatus.REVOKED) return "This invitation has been revoked.";
  if (status === InvitationStatus.EXPIRED) return "This invitation has expired.";
  if (status === InvitationStatus.PENDING && expiresAt && expiresAt.getTime() <= nowMs) {
    return "This invitation has expired.";
  }
  if (emailTaken) return "A user with that email already exists.";
  return null;
}
