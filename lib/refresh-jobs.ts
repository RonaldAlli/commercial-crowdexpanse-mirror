// Commercial Intelligence (v1.2, Commit 1c) — RefreshJob read access.
//
// Org-scoped reads over the refresh audit trail, for the UI (1d) and diagnostics.
// The write path lives in lib/intelligence/refresh (the orchestrator); this module
// is read-only. Permission enforcement (REFRESH read) belongs to the trigger
// surface, matching the Authorization Principles (policy in lib/permissions).
import type { IntelligenceEntityType } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/** Fetch one refresh job, scoped to its org (null if not in this org). */
export async function getRefreshJob(organizationId: string, id: string) {
  return prisma.refreshJob.findFirst({ where: { id, organizationId } });
}

/**
 * List refresh jobs for a single entity (e.g. one Owner), newest first — the
 * inline history on the entity's detail page (Commit 1d-3a). Org-scoped, narrow
 * select. Defaults to the 10 most recent (no detail-page pagination in 1d-3a).
 */
export async function listRefreshJobsForEntity(
  organizationId: string,
  entityType: IntelligenceEntityType,
  entityId: string,
  { skip = 0, take = 10 }: { skip?: number; take?: number } = {},
) {
  return prisma.refreshJob.findMany({
    where: { organizationId, targetEntityType: entityType, targetEntityId: entityId },
    select: { id: true, sourceKey: true, status: true, observationsRecorded: true, signalsAccepted: true, signalsSuperseded: true, actorUserId: true, error: true, finishedAt: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    skip,
    take,
  });
}

/** List an org's refresh jobs, newest first, with simple skip/take pagination. */
export async function listRefreshJobs(organizationId: string, { skip = 0, take = 20 } = {}) {
  return prisma.refreshJob.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    skip,
    take,
  });
}
