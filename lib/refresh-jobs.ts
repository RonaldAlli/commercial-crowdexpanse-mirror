// Commercial Intelligence (v1.2, Commit 1c) — RefreshJob read access.
//
// Org-scoped reads over the refresh audit trail, for the UI (1d) and diagnostics.
// The write path lives in lib/intelligence/refresh (the orchestrator); this module
// is read-only. Permission enforcement (REFRESH read) belongs to the trigger
// surface, matching the Authorization Principles (policy in lib/permissions).
import { prisma } from "@/lib/prisma";

/** Fetch one refresh job, scoped to its org (null if not in this org). */
export async function getRefreshJob(organizationId: string, id: string) {
  return prisma.refreshJob.findFirst({ where: { id, organizationId } });
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
