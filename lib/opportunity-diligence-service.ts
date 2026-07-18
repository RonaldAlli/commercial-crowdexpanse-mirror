import { OpportunityDiligenceStatus } from "@prisma/client";

import { PRECONTRACT_DILIGENCE_TEMPLATE } from "@/lib/opportunity-diligence";
import { prisma } from "@/lib/prisma";

export async function ensureOpportunityDiligence(organizationId: string, opportunityId: string) {
  await prisma.opportunityDiligenceItem.createMany({
    data: PRECONTRACT_DILIGENCE_TEMPLATE.map((item) => ({
      organizationId,
      opportunityId,
      key: item.key,
      label: item.label,
      position: item.position,
      status: OpportunityDiligenceStatus.NOT_REQUESTED,
    })),
    skipDuplicates: true,
  });

  return prisma.opportunityDiligenceItem.findMany({
    where: { organizationId, opportunityId },
    orderBy: { position: "asc" },
  });
}
