// Closing Center Slice 6 — Transaction Timeline (TX-0): the read path (DB orchestration). Runs ONE
// org- + opportunity-scoped ActivityLog query (+ actor name) with offset pagination — the same
// shape the org-wide /activity feed already uses (app/(workspace)/activity/page.tsx) — and maps
// each recorded event into the pure projection. It performs NO writes (TL-6), reads only events
// that ALREADY exist (TL-10), and adds NO ActivityLog index (Option A — TL-9). Thin by design: all
// classification/ordering/reference logic lives in the pure lib/transaction-timeline module.
import { prisma } from "@/lib/prisma";
import { projectTimeline, type TimelineEntry, type TimelineInputEvent, type TimelineOrder } from "@/lib/transaction-timeline";

export const TIMELINE_PAGE_SIZE = 20;

export type TimelineQuery = { order?: TimelineOrder; page?: number; pageSize?: number };

export type OpportunityTimeline = {
  entries: TimelineEntry[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  order: TimelineOrder;
};

/**
 * Read + project one Opportunity's recorded event history (read-only). Scoped by BOTH
 * `organizationId` and `opportunityId` — a timeline can never expose another organization's or
 * another deal's events. `order` selects newest- or oldest-first; the DB `orderBy` matches the
 * page direction and the pure projection enforces the deterministic in-page tie-break (TL-3).
 */
export async function getOpportunityTimeline(
  organizationId: string,
  opportunityId: string,
  opts: TimelineQuery = {},
): Promise<OpportunityTimeline> {
  const order: TimelineOrder = opts.order === "oldest" ? "oldest" : "newest";
  const pageSize = opts.pageSize && opts.pageSize > 0 ? opts.pageSize : TIMELINE_PAGE_SIZE;
  const where = { organizationId, opportunityId };

  const total = await prisma.activityLog.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  // Clamp the requested page into range so an out-of-bounds ?tlpage= never 500s or shows a blank page.
  const page = Math.min(Math.max(1, opts.page ?? 1), pageCount);

  const rows = await prisma.activityLog.findMany({
    where,
    select: { id: true, eventType: true, eventLabel: true, eventBody: true, createdAt: true, actor: { select: { name: true } } },
    orderBy: { createdAt: order === "oldest" ? "asc" : "desc" },
    take: pageSize,
    skip: (page - 1) * pageSize,
  });

  const events: TimelineInputEvent[] = rows.map((r) => ({
    id: r.id,
    eventType: r.eventType,
    eventLabel: r.eventLabel,
    eventBody: r.eventBody,
    actorName: r.actor?.name ?? null,
    occurredAtMs: r.createdAt.getTime(),
  }));

  return { entries: projectTimeline(events, opportunityId, order), total, page, pageSize, pageCount, order };
}
