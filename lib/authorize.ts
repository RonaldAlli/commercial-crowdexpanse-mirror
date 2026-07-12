import type { OpportunityStage, UserRole } from "@prisma/client";

import { can, canMoveStage, type Action, type Resource } from "./permissions";
import { prisma } from "./prisma";

// Server-side enforcement built on the pure policy in ./permissions. On denial it
// records an `authorization.denied` ActivityLog event (for troubleshooting /
// misuse detection) and either returns false (state-returning actions) or throws
// (void/redirect actions). The user only ever sees a generic message.

export const GENERIC_DENIAL = "You don't have permission to do that.";

export class AuthorizationError extends Error {
  constructor(message: string = GENERIC_DENIAL) {
    super(message);
    this.name = "AuthorizationError";
  }
}

// Minimal principal — CurrentUser satisfies this; tests can pass a plain object.
export type Principal = { id: string; role: UserRole; organizationId: string };

export type DenyContext = {
  targetId?: string;
  detail?: string;
  opportunityId?: string;
  sellerId?: string;
  propertyId?: string;
  buyerId?: string;
};

// Best-effort audit; a logging failure must never turn a denial into a 500.
async function logDenied(user: Principal, action: string, resource: string, ctx?: DenyContext): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        organizationId: user.organizationId,
        actorId: user.id,
        opportunityId: ctx?.opportunityId ?? null,
        sellerId: ctx?.sellerId ?? null,
        propertyId: ctx?.propertyId ?? null,
        buyerId: ctx?.buyerId ?? null,
        eventType: "authorization.denied",
        eventLabel: `Denied: ${action} ${resource}${ctx?.detail ? ` (${ctx.detail})` : ""}`,
        eventBody: JSON.stringify({
          role: user.role,
          resource,
          action,
          targetId: ctx?.targetId ?? null,
          detail: ctx?.detail ?? null,
        }),
      },
    });
  } catch {
    /* swallow — audit is best-effort */
  }
}

/** Non-throwing check for state-returning actions. Logs a denial. */
export async function checkAuthorized(
  user: Principal,
  action: Action,
  resource: Resource,
  ctx?: DenyContext,
): Promise<boolean> {
  if (can(user.role, action, resource)) return true;
  await logDenied(user, action, resource, ctx);
  return false;
}

/** Throwing check for void/redirect actions. Logs a denial, then throws AuthorizationError. */
export async function authorize(
  user: Principal,
  action: Action,
  resource: Resource,
  ctx?: DenyContext,
): Promise<void> {
  if (!(await checkAuthorized(user, action, resource, ctx))) {
    throw new AuthorizationError();
  }
}

/** Non-throwing pipeline-movement check (both current and target stage). Logs a denial. */
export async function checkStageMove(
  user: Principal,
  current: OpportunityStage,
  target: OpportunityStage,
  ctx?: DenyContext,
): Promise<boolean> {
  if (canMoveStage(user.role, current, target)) return true;
  await logDenied(user, "MOVE_STAGE", "PIPELINE", { ...ctx, detail: `${current} -> ${target}` });
  return false;
}

/** Throwing pipeline-movement check for void actions. */
export async function authorizeStageMove(
  user: Principal,
  current: OpportunityStage,
  target: OpportunityStage,
  ctx?: DenyContext,
): Promise<void> {
  if (!(await checkStageMove(user, current, target, ctx))) {
    throw new AuthorizationError();
  }
}
