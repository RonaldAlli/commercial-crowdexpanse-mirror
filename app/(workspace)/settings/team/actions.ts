"use server";

import { InvitationStatus, UserLifecycleState, UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { checkAuthorized, GENERIC_DENIAL } from "@/lib/authorize";
import { deactivationError, hasRole, roleChangeError } from "@/lib/authz";
import {
  generateInviteToken,
  hashInviteToken,
  hasActivePendingInvite,
  inviteCreateError,
  inviteExpiry,
  inviteResendError,
  isEmailTaken,
  normalizeEmail,
} from "@/lib/invitations";
import { prisma } from "@/lib/prisma";
import { roleLabel } from "@/lib/user-options";

export type TeamActionState = { error?: string } | undefined;

/**
 * Change one org member's role. ADMIN-only, org-scoped, and protected by the
 * last-admin lockout guard. Deterministic — no AI. Writes a user.role_changed
 * audit entry on success.
 */
export async function updateMemberRole(
  userId: string,
  role: string,
): Promise<TeamActionState> {
  const actor = await requireUser();
  if (!(await checkAuthorized(actor, "MANAGE", "TEAM", { targetId: userId }))) {
    return { error: GENERIC_DENIAL };
  }
  if (!hasRole(actor, UserRole.ADMIN)) return { error: "Not authorized." };

  const target = await prisma.user.findFirst({
    where: { id: userId, organizationId: actor.organizationId },
    select: { id: true, name: true, role: true },
  });

  // No-op — nothing to change, and no spurious audit entry.
  if (target && target.role === role) return undefined;

  // Only ACTIVE admins "cover" the org — a deactivated admin can't log in.
  const orgAdminCount = await prisma.user.count({
    where: { organizationId: actor.organizationId, role: UserRole.ADMIN, lifecycleState: UserLifecycleState.ACTIVE },
  });

  const err = roleChangeError({
    newRole: role,
    targetCurrentRole: target?.role ?? UserRole.ADMIN,
    targetIsInOrg: Boolean(target),
    orgAdminCount,
  });
  if (err) return { error: err };

  const previousRole = target!.role;

  await prisma.user.update({
    where: { id: target!.id },
    data: { role: role as UserRole },
  });

  await prisma.activityLog.create({
    data: {
      organizationId: actor.organizationId,
      actorId: actor.id,
      eventType: "user.role_changed",
      eventLabel: `Role: ${roleLabel(previousRole)} → ${roleLabel(role)} for ${target!.name}`,
    },
  });

  revalidatePath("/settings/team");
  return undefined;
}

/**
 * Deactivate an org member. ADMIN-only (MANAGE TEAM), org-scoped. Self-
 * deactivation and last-active-admin deactivation are blocked. Sets the session
 * epoch so every existing cookie for the target is invalidated immediately.
 * Writes a user.deactivated audit entry. Deterministic — no AI.
 */
export async function deactivateMember(userId: string): Promise<TeamActionState> {
  const actor = await requireUser();
  if (!(await checkAuthorized(actor, "MANAGE", "TEAM", { targetId: userId }))) {
    return { error: GENERIC_DENIAL };
  }
  if (!hasRole(actor, UserRole.ADMIN)) return { error: "Not authorized." };

  const target = await prisma.user.findFirst({
    where: { id: userId, organizationId: actor.organizationId },
    select: { id: true, name: true, role: true, lifecycleState: true },
  });

  const orgActiveAdminCount = await prisma.user.count({
    where: { organizationId: actor.organizationId, role: UserRole.ADMIN, lifecycleState: UserLifecycleState.ACTIVE },
  });

  const err = deactivationError({
    isSelf: target?.id === actor.id,
    targetIsInOrg: Boolean(target),
    targetRole: target?.role ?? UserRole.ACQUISITIONS,
    targetIsActive: target?.lifecycleState === UserLifecycleState.ACTIVE,
    orgActiveAdminCount,
  });
  if (err) return { error: err };

  // Guard returned null for an already-deactivated target — nothing to do.
  if (target!.lifecycleState !== UserLifecycleState.ACTIVE) return undefined;

  await prisma.user.update({
    where: { id: target!.id },
    data: {
      lifecycleState: UserLifecycleState.DEACTIVATED,
      deactivatedAt: new Date(),
      deactivatedById: actor.id,
      sessionsValidAfter: new Date(), // invalidate all existing sessions now
    },
  });

  await prisma.activityLog.create({
    data: {
      organizationId: actor.organizationId,
      actorId: actor.id,
      eventType: "user.deactivated",
      eventLabel: `Deactivated ${target!.name}`,
    },
  });

  revalidatePath("/settings/team");
  return undefined;
}

/**
 * Reactivate a deactivated member. ADMIN-only (MANAGE TEAM), org-scoped.
 * Deliberately does NOT clear sessionsValidAfter, so previously-issued cookies
 * stay invalid; only a fresh login (issuedAt > sessionsValidAfter) works.
 */
export async function reactivateMember(userId: string): Promise<TeamActionState> {
  const actor = await requireUser();
  if (!(await checkAuthorized(actor, "MANAGE", "TEAM", { targetId: userId }))) {
    return { error: GENERIC_DENIAL };
  }
  if (!hasRole(actor, UserRole.ADMIN)) return { error: "Not authorized." };

  const target = await prisma.user.findFirst({
    where: { id: userId, organizationId: actor.organizationId },
    select: { id: true, name: true, lifecycleState: true },
  });
  if (!target) return { error: "Member not found." };
  if (target.lifecycleState === UserLifecycleState.ACTIVE) return undefined; // no-op

  await prisma.user.update({
    where: { id: target.id },
    data: {
      lifecycleState: UserLifecycleState.ACTIVE,
      deactivatedAt: null,
      deactivatedById: null,
      // sessionsValidAfter is intentionally left untouched.
    },
  });

  await prisma.activityLog.create({
    data: {
      organizationId: actor.organizationId,
      actorId: actor.id,
      eventType: "user.reactivated",
      eventLabel: `Reactivated ${target.name}`,
    },
  });

  revalidatePath("/settings/team");
  return undefined;
}

/**
 * Create a copy-link invitation. ADMIN-only, org-scoped. Returns the raw token
 * exactly once (the caller composes the link); only its hash is persisted.
 * Rejects existing accounts and duplicate active invites. Deterministic — no AI.
 */
export async function createInvite(
  email: string,
  role: string,
): Promise<{ token?: string; error?: string }> {
  const actor = await requireUser();
  if (!(await checkAuthorized(actor, "MANAGE", "INVITATION"))) {
    return { error: GENERIC_DENIAL };
  }
  if (!hasRole(actor, UserRole.ADMIN)) return { error: "Not authorized." };

  const normalized = normalizeEmail(email);
  const now = new Date();

  const emailAlreadyUser = await isEmailTaken(normalized);
  const hasActivePending = await hasActivePendingInvite(actor.organizationId, normalized, now);

  const err = inviteCreateError({ email: normalized, role, emailAlreadyUser, hasActivePending });
  if (err) return { error: err };

  const raw = generateInviteToken();
  await prisma.invitation.create({
    data: {
      organizationId: actor.organizationId,
      email: normalized,
      role: role as UserRole,
      tokenHash: hashInviteToken(raw),
      status: InvitationStatus.PENDING,
      expiresAt: inviteExpiry(now.getTime()),
      invitedById: actor.id,
    },
  });

  await prisma.activityLog.create({
    data: {
      organizationId: actor.organizationId,
      actorId: actor.id,
      eventType: "invitation.created",
      eventLabel: `Invited ${normalized} as ${roleLabel(role)}`,
    },
  });

  revalidatePath("/settings/team");
  return { token: raw };
}

/** Revoke a pending invitation. ADMIN-only, org-scoped. */
export async function revokeInvite(invitationId: string): Promise<TeamActionState> {
  const actor = await requireUser();
  if (!(await checkAuthorized(actor, "MANAGE", "INVITATION", { targetId: invitationId }))) {
    return { error: GENERIC_DENIAL };
  }
  if (!hasRole(actor, UserRole.ADMIN)) return { error: "Not authorized." };

  const invite = await prisma.invitation.findFirst({
    where: { id: invitationId, organizationId: actor.organizationId },
    select: { id: true, email: true, status: true },
  });
  if (!invite) return { error: "Invitation not found." };
  if (invite.status !== InvitationStatus.PENDING) {
    return { error: "Only pending invitations can be revoked." };
  }

  await prisma.invitation.update({
    where: { id: invite.id },
    data: { status: InvitationStatus.REVOKED },
  });

  await prisma.activityLog.create({
    data: {
      organizationId: actor.organizationId,
      actorId: actor.id,
      eventType: "invitation.revoked",
      eventLabel: `Revoked invite for ${invite.email}`,
    },
  });

  revalidatePath("/settings/team");
  return undefined;
}

/**
 * Resend an invitation by ROTATING it in place: a fresh token replaces the old
 * hash (so the previous link stops working immediately), expiry is reset, and
 * status returns to PENDING. One invitation row per person — pending, expired,
 * and revoked invites are all resendable; an accepted one is terminal. ADMIN-
 * only, org-scoped. Returns the new raw token once. Deterministic — no AI.
 */
export async function resendInvite(invitationId: string): Promise<{ token?: string; error?: string }> {
  const actor = await requireUser();
  if (!(await checkAuthorized(actor, "MANAGE", "INVITATION", { targetId: invitationId }))) {
    return { error: GENERIC_DENIAL };
  }
  if (!hasRole(actor, UserRole.ADMIN)) return { error: "Not authorized." };

  const invite = await prisma.invitation.findFirst({
    where: { id: invitationId, organizationId: actor.organizationId },
    select: { id: true, email: true, status: true, role: true },
  });

  const err = inviteResendError({ found: Boolean(invite), status: invite?.status });
  if (err) return { error: err };

  const now = new Date();
  const raw = generateInviteToken();
  await prisma.invitation.update({
    where: { id: invite!.id },
    data: {
      tokenHash: hashInviteToken(raw), // rotates the token — the previous link is now invalid
      status: InvitationStatus.PENDING,
      expiresAt: inviteExpiry(now.getTime()),
      acceptedAt: null,
      acceptedUserId: null,
    },
  });

  await prisma.activityLog.create({
    data: {
      organizationId: actor.organizationId,
      actorId: actor.id,
      eventType: "invitation.resent",
      eventLabel: `Resent invite for ${invite!.email} as ${roleLabel(invite!.role)}`,
    },
  });

  revalidatePath("/settings/team");
  return { token: raw };
}
