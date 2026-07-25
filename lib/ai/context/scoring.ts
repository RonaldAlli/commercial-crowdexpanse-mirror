import { prisma } from "@/lib/prisma";

import type { ContextProvider } from "./types";
import { renderScoring } from "./render";

// Lead-quality signal: composes the qualification checklist + motivation + source.
// (The buyer↔opportunity matcher in lib/matching.ts is opportunity-scoped and has
// no seller inputs, so it is deliberately not used here.)
export const scoringProvider: ContextProvider = {
  key: "scoring",
  async load(ctx) {
    const s = await prisma.seller.findFirst({
      where: { id: ctx.subjectId, organizationId: ctx.user.organizationId },
      select: {
        phone: true,
        email: true,
        motivation: true,
        acquisitionChannel: true,
        outreachStatus: true,
        _count: { select: { properties: true } },
      },
    });
    if (!s) return null;
    return renderScoring({
      phone: s.phone,
      email: s.email,
      motivation: s.motivation,
      hasProperty: s._count.properties > 0,
      hasAcquisitionChannel: Boolean(s.acquisitionChannel),
      acquisitionChannel: s.acquisitionChannel ? String(s.acquisitionChannel) : null,
      outreachStatus: s.outreachStatus,
    });
  },
};
