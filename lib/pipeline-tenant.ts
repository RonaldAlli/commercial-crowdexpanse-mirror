import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/auth";

/**
 * Tenant-scope authority for the deployed pipeline adapters (GET read, POST
 * fact-operations, and the Pipeline screen). ONE place, so every adapter derives
 * organization scope the same way.
 *
 * Security rule (session-authoritative tenancy): the organization is taken ONLY
 * from the authenticated user. Any `organizationId` arriving in the request — query
 * string or body — is IGNORED; it is not part of the authority path. The requested
 * opportunity must belong to the caller's own organization, or the caller is treated
 * as if it does not exist (returns `null` → the adapter responds 404 / notFound), so
 * tenant existence is never disclosed.
 */
export type PipelineScope = { organizationId: string; opportunityId: string };

/**
 * PURE core of the rule, split out so the security property is unit-testable without a
 * database: the resolved organization is ALWAYS the session organization passed in, and
 * scope exists only when the opportunity was found within it. `ownedInOrg` MUST have
 * been determined by a lookup scoped to `sessionOrganizationId` (see resolveOwnedPipelineScope).
 */
export function ownedScopeFrom(
  sessionOrganizationId: string,
  opportunityId: string,
  ownedInOrg: boolean,
): PipelineScope | null {
  if (!ownedInOrg) return null;
  return { organizationId: sessionOrganizationId, opportunityId };
}

/**
 * Resolve session-authoritative pipeline scope. Read-only: a single existence check
 * scoped to the caller's org. Returns `null` for a cross-tenant or unknown opportunity.
 */
export async function resolveOwnedPipelineScope(
  user: Pick<CurrentUser, "organizationId">,
  opportunityId: string,
): Promise<PipelineScope | null> {
  const owned = await prisma.opportunity.findFirst({
    where: { id: opportunityId, organizationId: user.organizationId },
    select: { id: true },
  });
  return ownedScopeFrom(user.organizationId, opportunityId, owned !== null);
}
