import { UserRole } from "@prisma/client";

// Pure authorization helpers — no I/O, so they are trivially unit-testable and
// shared verbatim between server actions and the focused E2E (no logic drift).

const VALID_ROLES = new Set<string>(Object.values(UserRole));

/** True when the user holds any of the given roles. */
export function hasRole(user: { role: UserRole }, ...roles: UserRole[]): boolean {
  return roles.includes(user.role);
}

/**
 * Decide whether an ADMIN may set `newRole` on a target member.
 * Returns null when the change is allowed, or a human-readable reason to reject.
 * Captures every guard in one place: unknown role, cross-org / missing target,
 * the last-admin lockout guard, and the no-op case.
 */
export function roleChangeError(input: {
  newRole: string;
  targetCurrentRole: UserRole;
  targetIsInOrg: boolean;
  orgAdminCount: number; // number of ADMINs currently in the target's org
}): string | null {
  const { newRole, targetCurrentRole, targetIsInOrg, orgAdminCount } = input;

  if (!targetIsInOrg) return "Member not found.";
  if (!VALID_ROLES.has(newRole)) return "Invalid role.";
  if (newRole === targetCurrentRole) return null; // no-op — nothing to change

  // Demoting the final ADMIN would lock the organization out of team
  // management. This is who-agnostic, so it also blocks an admin from
  // demoting themselves into a lockout.
  if (targetCurrentRole === UserRole.ADMIN && newRole !== UserRole.ADMIN && orgAdminCount <= 1) {
    return "Can't remove the last admin.";
  }

  return null;
}

/**
 * Decide whether an ADMIN may deactivate a target member.
 * Returns null when allowed, or a human-readable reason to reject. Self-
 * deactivation is always blocked (avoids accidental lockouts and confusing
 * session behavior), and the last ACTIVE admin can't be deactivated. Counts
 * must exclude already-deactivated users so a dead admin never "covers" the org.
 */
export function deactivationError(input: {
  isSelf: boolean;
  targetIsInOrg: boolean;
  targetRole: UserRole;
  targetIsActive: boolean; // currently ACTIVE (not already deactivated)
  orgActiveAdminCount: number; // ACTIVE admins in the target's org
}): string | null {
  const { isSelf, targetIsInOrg, targetRole, targetIsActive, orgActiveAdminCount } = input;

  if (!targetIsInOrg) return "Member not found.";
  if (isSelf) return "You can't deactivate your own account.";
  if (!targetIsActive) return null; // already deactivated — no-op, not an error
  if (targetRole === UserRole.ADMIN && orgActiveAdminCount <= 1) {
    return "Can't deactivate the last admin.";
  }

  return null;
}
