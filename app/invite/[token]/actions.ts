"use server";

import { InvitationStatus } from "@prisma/client";
import { redirect } from "next/navigation";

import { createSession } from "@/lib/auth";
import {
  findInvitationByRawToken,
  inviteAcceptError,
  isEmailTaken,
  markExpiredIfNeeded,
} from "@/lib/invitations";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

export type AcceptState = { error?: string } | undefined;

// Thrown inside the accept transaction when another request consumed the
// invitation first (concurrent double-accept). Enforces single-use.
class InviteConsumedError extends Error {}

/**
 * Accept a copy-link invitation: create the user in the invite's org with the
 * invited role, mark the invite ACCEPTED (single-use), and start a session.
 * All validation is re-run server-side — the page's earlier check is never
 * trusted. Public (unauthenticated) by design.
 */
export async function acceptInvite(
  token: string,
  name: string,
  password: string,
): Promise<AcceptState> {
  const invite = await findInvitationByRawToken(token);
  const nowMs = Date.now();

  // Realize the lazy EXPIRED state before validating, so a stale PENDING invite
  // is recorded as EXPIRED rather than inferred.
  const status = invite ? await markExpiredIfNeeded(invite, nowMs) : undefined;
  const emailTaken = invite ? await isEmailTaken(invite.email) : false;

  const err = inviteAcceptError({
    found: Boolean(invite),
    status,
    expiresAt: invite?.expiresAt,
    nowMs,
    emailTaken,
  });
  if (err) return { error: err };

  const trimmedName = name.trim();
  if (!trimmedName) return { error: "Enter your name." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  let userId: string;
  try {
    const created = await prisma.$transaction(async (tx) => {
      // Atomically claim the invite: only a still-PENDING row is consumable.
      const claim = await tx.invitation.updateMany({
        where: { id: invite!.id, status: InvitationStatus.PENDING },
        data: { status: InvitationStatus.ACCEPTED, acceptedAt: new Date() },
      });
      if (claim.count === 0) throw new InviteConsumedError();

      const user = await tx.user.create({
        data: {
          organizationId: invite!.organizationId,
          name: trimmedName,
          email: invite!.email,
          hashedPassword: hashPassword(password),
          role: invite!.role,
        },
        select: { id: true },
      });
      await tx.invitation.update({
        where: { id: invite!.id },
        data: { acceptedUserId: user.id },
      });
      return user;
    });
    userId = created.id;
  } catch (e) {
    if (e instanceof InviteConsumedError) {
      return { error: "This invitation has already been used." };
    }
    // Unique-email race between page load and submit.
    if (typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002") {
      return { error: "A user with that email already exists." };
    }
    throw e;
  }

  await prisma.activityLog.create({
    data: {
      organizationId: invite!.organizationId,
      actorId: userId,
      eventType: "invitation.accepted",
      eventLabel: `${trimmedName} joined via invitation`,
    },
  });

  await createSession(userId);
  redirect("/dashboard");
}
