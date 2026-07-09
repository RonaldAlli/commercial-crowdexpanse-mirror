"use server";

import { UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { hasRole, roleChangeError } from "@/lib/authz";
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
