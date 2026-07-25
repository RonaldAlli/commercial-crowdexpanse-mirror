import { prisma } from "@/lib/prisma";

import type { ContextProvider } from "./types";
import { renderCommunications } from "./render";

// "Last communication" — the most recent message and call, org-scoped by seller.
// Used by drafting intents that need the thread's last exchange, not the whole log.
export const communicationsProvider: ContextProvider = {
  key: "communications",
  async load(ctx) {
    const organizationId = ctx.user.organizationId;
    const sellerId = ctx.subjectId;
    const [msg, call] = await Promise.all([
      prisma.commsMessage.findFirst({
        where: { organizationId, sellerId },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true, channel: true, direction: true, body: true, subject: true },
      }),
      prisma.callRecord.findFirst({
        where: { organizationId, sellerId },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true, direction: true, status: true, disposition: true },
      }),
    ]);
    return renderCommunications({
      lastMessage: msg
        ? { at: msg.createdAt.getTime(), channel: msg.channel, direction: msg.direction, body: msg.body, subject: msg.subject }
        : null,
      lastCall: call
        ? { at: call.createdAt.getTime(), direction: call.direction, status: call.status, disposition: call.disposition }
        : null,
    });
  },
};
