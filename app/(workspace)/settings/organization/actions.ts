"use server";

import { UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { checkAuthorized, GENERIC_DENIAL } from "@/lib/authorize";
import { hasRole } from "@/lib/authz";
import { getOrgSettings, orgSettingsError, updateOrgSettings } from "@/lib/org-settings";
import { prisma } from "@/lib/prisma";
import { roleLabel } from "@/lib/user-options";

export type OrgSettingsState = { error?: string } | undefined;

/**
 * Save organization identity + workspace defaults. ADMIN-only (MANAGE
 * ORGANIZATION), org-scoped. The slug is immutable. Emits organization.renamed
 * and/or organization.settings_updated only for the parts that actually change.
 * Deterministic — no AI.
 */
export async function saveOrganizationSettings(formData: FormData): Promise<OrgSettingsState> {
  const actor = await requireUser();
  if (!(await checkAuthorized(actor, "MANAGE", "ORGANIZATION"))) {
    return { error: GENERIC_DENIAL };
  }
  if (!hasRole(actor, UserRole.ADMIN)) return { error: "Not authorized." };

  const name = String(formData.get("name") ?? "").trim();
  const inviteExpiryDays = Number.parseInt(String(formData.get("inviteExpiryDays") ?? ""), 10);
  const defaultInviteRole = String(formData.get("defaultInviteRole") ?? "");

  if (!name) return { error: "Organization name is required." };
  const err = orgSettingsError({ inviteExpiryDays, defaultInviteRole });
  if (err) return { error: err };

  const org = await prisma.organization.findUnique({
    where: { id: actor.organizationId },
    select: { name: true },
  });
  const current = await getOrgSettings(actor.organizationId);

  const nameChanged = Boolean(org) && org!.name !== name;
  const settingsChanged =
    current.inviteExpiryDays !== inviteExpiryDays || current.defaultInviteRole !== defaultInviteRole;

  if (nameChanged) {
    await prisma.organization.update({ where: { id: actor.organizationId }, data: { name } });
    await prisma.activityLog.create({
      data: {
        organizationId: actor.organizationId,
        actorId: actor.id,
        eventType: "organization.renamed",
        eventLabel: `Organization renamed: ${org!.name} → ${name}`,
      },
    });
  }

  if (settingsChanged) {
    await updateOrgSettings(actor.organizationId, {
      inviteExpiryDays,
      defaultInviteRole: defaultInviteRole as UserRole,
    });
    await prisma.activityLog.create({
      data: {
        organizationId: actor.organizationId,
        actorId: actor.id,
        eventType: "organization.settings_updated",
        eventLabel: `Updated org settings: invite expiry ${inviteExpiryDays}d, default role ${roleLabel(defaultInviteRole)}`,
      },
    });
  }

  revalidatePath("/settings/organization");
  revalidatePath("/settings/team");
  return undefined;
}
