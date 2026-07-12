import { UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// The single home for organization-wide defaults. Every read/write of org
// configuration goes through here, so settings never scatter across the app.
// Today: invitation expiry + default invite role. This module is where future
// settings (branding, timezone, locale, sender identity, …) will land.
// ---------------------------------------------------------------------------

export const INVITE_EXPIRY_MIN_DAYS = 1;
export const INVITE_EXPIRY_MAX_DAYS = 90;
export const DEFAULT_INVITE_EXPIRY_DAYS = 7;

// ADMIN is deliberately excluded — an org can never DEFAULT new members to admin.
const NON_ADMIN_ROLES = new Set<string>([
  UserRole.ACQUISITIONS,
  UserRole.ANALYST,
  UserRole.DISPOSITIONS,
]);

/**
 * Pure validation guard — null when the patch is valid, else a human-readable
 * reason. Shared verbatim by the server action and the E2E (no logic drift).
 */
export function orgSettingsError(input: {
  inviteExpiryDays: number;
  defaultInviteRole: string;
}): string | null {
  const { inviteExpiryDays, defaultInviteRole } = input;
  if (
    !Number.isInteger(inviteExpiryDays) ||
    inviteExpiryDays < INVITE_EXPIRY_MIN_DAYS ||
    inviteExpiryDays > INVITE_EXPIRY_MAX_DAYS
  ) {
    return `Invite link expiry must be a whole number between ${INVITE_EXPIRY_MIN_DAYS} and ${INVITE_EXPIRY_MAX_DAYS} days.`;
  }
  if (defaultInviteRole === UserRole.ADMIN) return "Admin can't be the default invitation role.";
  if (!NON_ADMIN_ROLES.has(defaultInviteRole)) return "Invalid default role.";
  return null;
}

/**
 * Get-or-create the org's settings row. Existing orgs get a row lazily on first
 * read (schema defaults apply); the upsert is race-safe on the unique org key.
 */
export async function getOrgSettings(organizationId: string) {
  return prisma.organizationSettings.upsert({
    where: { organizationId },
    update: {},
    create: { organizationId },
  });
}

/** Persist a validated settings patch (caller runs orgSettingsError first). */
export async function updateOrgSettings(
  organizationId: string,
  data: { inviteExpiryDays: number; defaultInviteRole: UserRole },
) {
  return prisma.organizationSettings.upsert({
    where: { organizationId },
    update: data,
    create: { organizationId, ...data },
  });
}
