"use server";

import { InvitationStatus, UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { hasRole, roleChangeError } from "@/lib/authz";
import {
  generateInviteToken,
  hashInviteToken,
  hasActivePendingInvite,
  inviteCreateError,
  inviteExpiry,
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
  if (!hasRole(actor, UserRole.ADMIN)) return { error: "Not authorized." };

  const target = await prisma.user.findFirst({
    where: { id: userId, organizationId: actor.organizationId },
    select: { id: true, name: true, role: true },
  });

  // No-op — nothing to change, and no spurious audit entry.
  if (target && target.role === role) return undefined;

  const orgAdminCount = await prisma.user.count({
    where: { organizationId: actor.organizationId, role: UserRole.ADMIN },
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
 * Create a copy-link invitation. ADMIN-only, org-scoped. Returns the raw token
 * exactly once (the caller composes the link); only its hash is persisted.
 * Rejects existing accounts and duplicate active invites. Deterministic — no AI.
 */
export async function createInvite(
  email: string,
  role: string,
): Promise<{ token?: string; error?: string }> {
  const actor = await requireUser();
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
