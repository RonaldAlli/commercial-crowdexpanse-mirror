import { prisma } from "@/lib/prisma";

import type { ContextProvider } from "./types";
import { renderProperty } from "./render";

// Primary property for the seller. Org isolation is enforced through the seller
// relation, so it holds regardless of Property's own columns.
export const propertyProvider: ContextProvider = {
  key: "property",
  async load(ctx) {
    const p = await prisma.property.findFirst({
      where: { sellerId: ctx.subjectId, seller: { organizationId: ctx.user.organizationId } },
      select: {
        name: true,
        assetType: true,
        unitCount: true,
        squareFeet: true,
        acreage: true,
        yearBuilt: true,
        city: true,
        state: true,
      },
    });
    if (!p) return null;
    return renderProperty({ ...p, assetType: String(p.assetType) });
  },
};
