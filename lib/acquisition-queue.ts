import { prisma } from "@/lib/prisma";
import type { ContactOutreachStatus } from "@prisma/client";

// The seller acquisition work queue + daily activity metrics. Org-scoped. Read-only over existing
// Seller / ContactTouch / ActivityLog facts — no new persistence, no duplicated logic.

// Sellers you don't call: dead leads and do-not-contact.
const EXCLUDE: ContactOutreachStatus[] = ["DEAD", "DO_NOT_CONTACT"];

export type QueueSeller = {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  outreachStatus: ContactOutreachStatus;
  nextFollowUpAt: Date | null;
  lastTouchAt: Date | null;
};

const QUEUE_SELECT = {
  id: true,
  name: true,
  company: true,
  phone: true,
  outreachStatus: true,
  nextFollowUpAt: true,
  touchHistory: { select: { createdAt: true }, orderBy: { createdAt: "desc" as const }, take: 1 },
};

function toQueueSeller(s: {
  id: string; name: string; company: string | null; phone: string | null;
  outreachStatus: ContactOutreachStatus; nextFollowUpAt: Date | null;
  touchHistory: { createdAt: Date }[];
}): QueueSeller {
  return {
    id: s.id,
    name: s.name,
    company: s.company,
    phone: s.phone,
    outreachStatus: s.outreachStatus,
    nextFollowUpAt: s.nextFollowUpAt,
    lastTouchAt: s.touchHistory[0]?.createdAt ?? null,
  };
}

/**
 * "Who to work next": due/overdue follow-ups first (earliest date first), then unscheduled leads
 * oldest-first. Excludes DEAD / DO_NOT_CONTACT. A bounded working set (default 50).
 */
export async function getAcquisitionQueue(organizationId: string, now: Date, limit = 50): Promise<QueueSeller[]> {
  const base = { organizationId, outreachStatus: { notIn: EXCLUDE } };

  const due = await prisma.seller.findMany({
    where: { ...base, nextFollowUpAt: { lte: now } },
    orderBy: { nextFollowUpAt: "asc" },
    take: limit,
    select: QUEUE_SELECT,
  });

  const remaining = limit - due.length;
  const fresh =
    remaining > 0
      ? await prisma.seller.findMany({
          where: { ...base, OR: [{ nextFollowUpAt: null }, { nextFollowUpAt: { gt: now } }] },
          orderBy: { createdAt: "asc" },
          take: remaining,
          select: QUEUE_SELECT,
        })
      : [];

  return [...due, ...fresh].map(toQueueSeller);
}

export type DailyMetrics = {
  callsToday: number;
  touchesToday: number;
  statusUpdatesToday: number;
  queueSize: number;
};

/** Daily activity metrics, counted from authoritative rows (ContactTouch / ActivityLog). */
export async function getDailyAcquisitionMetrics(organizationId: string, startOfDay: Date): Promise<DailyMetrics> {
  const [callsToday, touchesToday, statusUpdatesToday, queueSize] = await Promise.all([
    prisma.contactTouch.count({ where: { organizationId, sellerId: { not: null }, type: "CALL", createdAt: { gte: startOfDay } } }),
    prisma.contactTouch.count({ where: { organizationId, sellerId: { not: null }, createdAt: { gte: startOfDay } } }),
    prisma.activityLog.count({ where: { organizationId, eventType: "seller.outreach_status_changed", createdAt: { gte: startOfDay } } }),
    prisma.seller.count({ where: { organizationId, outreachStatus: { notIn: EXCLUDE } } }),
  ]);
  return { callsToday, touchesToday, statusUpdatesToday, queueSize };
}
