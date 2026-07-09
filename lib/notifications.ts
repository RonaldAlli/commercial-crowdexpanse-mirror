import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

// Notifications, derived from the existing org-scoped ActivityLog — no dedicated
// table. "Unread" = org activity newer than the user's lastNotificationsReadAt
// cursor (or their account creation, if never read) and NOT performed by the
// user themselves. Single source of truth for the query logic — imported by the
// layout (bell badge), the /notifications page, and the focused E2E.

export const NOTIFICATIONS_CAP = 20;

/** Org activity that counts as a notification for this user: same org, not by
 *  them (system events with a null actor are included). */
function feedWhere(organizationId: string, userId: string): Prisma.ActivityLogWhereInput {
  return {
    organizationId,
    OR: [{ actorId: null }, { actorId: { not: userId } }],
  };
}

async function readCursor(userId: string): Promise<Date | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { createdAt: true, lastNotificationsReadAt: true },
  });
  if (!user) return null;
  return user.lastNotificationsReadAt ?? user.createdAt;
}

/** Count of unread notifications for the bell badge. */
export async function unreadCount(userId: string, organizationId: string): Promise<number> {
  const cursor = await readCursor(userId);
  if (!cursor) return 0;
  return prisma.activityLog.count({
    where: { ...feedWhere(organizationId, userId), createdAt: { gt: cursor } },
  });
}

/** Recent notifications (self-excluded), newest first, each flagged unread. */
export async function recentNotifications(userId: string, organizationId: string) {
  const cursor = (await readCursor(userId)) ?? new Date(0);
  const rows = await prisma.activityLog.findMany({
    where: feedWhere(organizationId, userId),
    include: {
      actor: { select: { name: true } },
      seller: { select: { id: true, name: true } },
      buyer: { select: { id: true, name: true } },
      property: { select: { id: true, name: true } },
      opportunity: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: "desc" },
    take: NOTIFICATIONS_CAP,
  });
  return rows.map((row) => ({ ...row, unread: row.createdAt > cursor }));
}

/** Advance the read cursor to now. Returns the count marked read. */
export async function markAllRead(userId: string, organizationId: string): Promise<number> {
  const unread = await unreadCount(userId, organizationId);
  await prisma.user.update({
    where: { id: userId },
    data: { lastNotificationsReadAt: new Date() },
  });
  return unread;
}
