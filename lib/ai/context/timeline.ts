import { prisma } from "@/lib/prisma";

import type { ContextProvider } from "./types";
import { renderTimeline } from "./render";

// Replicates the acquire page's unified-timeline assembly (calls + messages +
// logged touches + status changes), org-scoped by seller, capped for the prompt.
export const timelineProvider: ContextProvider = {
  key: "timeline",
  async load(ctx) {
    const organizationId = ctx.user.organizationId;
    const sellerId = ctx.subjectId;
    const [calls, messages, touches, statusEvents] = await Promise.all([
      prisma.callRecord.findMany({
        where: { organizationId, sellerId },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { createdAt: true, direction: true, status: true, disposition: true, durationSec: true },
      }),
      prisma.commsMessage.findMany({
        where: { organizationId, sellerId },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { createdAt: true, channel: true, direction: true, status: true, body: true, subject: true },
      }),
      prisma.contactTouch.findMany({
        where: { organizationId, sellerId },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { createdAt: true, type: true, summary: true, createdBy: { select: { name: true } } },
      }),
      prisma.activityLog.findMany({
        where: { organizationId, sellerId, eventType: "seller.outreach_status_changed" },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: { eventLabel: true, createdAt: true },
      }),
    ]);
    return renderTimeline({
      calls: calls.map((c) => ({
        at: c.createdAt.getTime(),
        direction: c.direction,
        status: c.status,
        disposition: c.disposition,
        durationSec: c.durationSec,
      })),
      messages: messages.map((m) => ({
        at: m.createdAt.getTime(),
        channel: m.channel,
        direction: m.direction,
        status: m.status,
        body: m.body,
        subject: m.subject,
      })),
      touches: touches.map((t) => ({
        at: t.createdAt.getTime(),
        touchType: String(t.type),
        summary: t.summary,
        actor: t.createdBy?.name ?? null,
      })),
      statusEvents: statusEvents.map((e) => ({ at: e.createdAt.getTime(), label: e.eventLabel })),
    });
  },
};
