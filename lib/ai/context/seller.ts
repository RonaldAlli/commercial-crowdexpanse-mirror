import { prisma } from "@/lib/prisma";

import type { ContextProvider } from "./types";
import { renderSeller } from "./render";

// The anchor provider. Org-scoped by session — a seller outside the caller's org
// yields null, which the Brain (Slice 3) turns into a 404.
export const sellerProvider: ContextProvider = {
  key: "seller",
  async load(ctx) {
    const s = await prisma.seller.findFirst({
      where: { id: ctx.subjectId, organizationId: ctx.user.organizationId },
      select: {
        id: true,
        name: true,
        company: true,
        phone: true,
        email: true,
        city: true,
        state: true,
        motivation: true,
        acquisitionChannel: true,
        outreachStatus: true,
        doNotCall: true,
        doNotText: true,
        doNotEmail: true,
        owner: { select: { displayName: true } },
      },
    });
    if (!s) return null;
    return renderSeller({
      id: s.id,
      name: s.name,
      company: s.company,
      phone: s.phone,
      email: s.email,
      city: s.city,
      state: s.state,
      motivation: s.motivation,
      acquisitionChannel: s.acquisitionChannel ? String(s.acquisitionChannel) : null,
      outreachStatus: String(s.outreachStatus),
      doNotCall: s.doNotCall,
      doNotText: s.doNotText,
      doNotEmail: s.doNotEmail,
      ownerName: s.owner?.displayName ?? null,
    });
  },
};
