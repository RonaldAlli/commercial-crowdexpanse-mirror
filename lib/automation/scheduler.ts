// The Automation scheduler (Phase 2.0.1, Commit 4). Decides WHEN work exists — separate from
// the executor (A2). It enumerates organizations (ids only — never cross-org data), invokes
// each registered per-type seeder to enqueue single-org occurrences, promotes due retries, and
// supersedes stale non-terminal duplicates. No side effects on import.

import { prisma } from "@/lib/prisma";
import { promoteDueRetries } from "./job-service";

/** A seeder enqueues due jobs for ONE organization at `now`; returns the count seeded. */
export type Seeder = (organizationId: string, now: Date) => Promise<number>;

export type SeederRegistry = Record<string, Seeder>;

/**
 * Supersede older non-terminal jobs for the same (org, type, source) whose occurrence differs
 * from the one being kept. Prevents a backlog of periodic occurrences piling up. Terminal jobs
 * are untouched. Returns the count superseded.
 */
export async function supersedeOlderOccurrences(
  organizationId: string,
  automationType: string,
  sourceType: string,
  sourceId: string,
  keepOccurrenceKey: string,
): Promise<number> {
  const res = await prisma.automationJob.updateMany({
    where: {
      organizationId,
      automationType,
      sourceType,
      sourceId,
      occurrenceKey: { not: keepOccurrenceKey },
      status: { in: ["PENDING", "QUEUED", "RETRY_SCHEDULED"] },
    },
    data: { status: "SUPERSEDED" },
  });
  return res.count;
}

/**
 * One scheduler pass: enumerate orgs, run every seeder per org, promote due retries. Enumerating
 * organization ids to seed single-org jobs is NOT cross-org data access — each seeded job and all
 * of its work stay within one organization.
 */
export async function runSchedulerOnce(
  seeders: SeederRegistry,
  now: Date,
): Promise<{ orgs: number; seeded: number; promoted: number }> {
  const orgs = await prisma.organization.findMany({ select: { id: true } });
  let seeded = 0;
  for (const { id } of orgs) {
    for (const seeder of Object.values(seeders)) {
      seeded += await seeder(id, now);
    }
  }
  const promoted = await promoteDueRetries(now);
  return { orgs: orgs.length, seeded, promoted };
}
