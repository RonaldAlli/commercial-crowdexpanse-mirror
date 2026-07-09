import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { OpportunityForm } from "@/components/opportunity-form";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PRIORITY_OPTIONS, STAGE_OPTIONS } from "@/lib/opportunity-options";

import { updateOpportunity } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditOpportunityPage({ params }: { params: { id: string } }) {
  const user = await requireUser();

  const [opportunity, properties, sellers] = await Promise.all([
    prisma.opportunity.findFirst({ where: { id: params.id, organizationId: user.organizationId } }),
    prisma.property.findMany({
      where: { organizationId: user.organizationId },
      select: { id: true, name: true, city: true, state: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.seller.findMany({
      where: { organizationId: user.organizationId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!opportunity) {
    notFound();
  }

  const propertyOptions = properties.map((p) => ({
    value: p.id,
    label: `${p.name} · ${[p.city, p.state].filter(Boolean).join(", ")}`,
  }));

  const action = updateOpportunity.bind(null, opportunity.id);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader eyebrow="Acquisitions pipeline" title={`Edit ${opportunity.title}`} description="Update this opportunity's details." />
      <div className="card p-6">
        <OpportunityForm
          action={action}
          properties={propertyOptions}
          sellers={sellers}
          stages={STAGE_OPTIONS}
          priorities={PRIORITY_OPTIONS}
          values={{
            title: opportunity.title,
            propertyId: opportunity.propertyId,
            sellerId: opportunity.sellerId,
            stage: opportunity.stage,
            source: opportunity.source,
            priority: opportunity.priority,
            targetCloseDate: opportunity.targetCloseDate ? opportunity.targetCloseDate.toISOString().slice(0, 10) : "",
            contractValueUsd: opportunity.contractValueUsd,
            assignmentFeeUsd: opportunity.assignmentFeeUsd,
            summary: opportunity.summary,
          }}
          submitLabel="Save changes"
          cancelHref={`/opportunities/${opportunity.id}`}
        />
      </div>
    </div>
  );
}
