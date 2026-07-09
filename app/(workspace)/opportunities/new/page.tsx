import { PageHeader } from "@/components/page-header";
import { OpportunityForm } from "@/components/opportunity-form";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PRIORITY_OPTIONS, STAGE_OPTIONS } from "@/lib/opportunity-options";

import { createOpportunity } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewOpportunityPage() {
  const user = await requireUser();

  const [properties, sellers] = await Promise.all([
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

  const propertyOptions = properties.map((p) => ({
    value: p.id,
    label: `${p.name} · ${[p.city, p.state].filter(Boolean).join(", ")}`,
  }));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader eyebrow="Acquisitions pipeline" title="New opportunity" description="Create a deal and link it to a property and seller." />
      <div className="card p-6">
        <OpportunityForm
          action={createOpportunity}
          properties={propertyOptions}
          sellers={sellers}
          stages={STAGE_OPTIONS}
          priorities={PRIORITY_OPTIONS}
          submitLabel="Create opportunity"
          cancelHref="/opportunities"
        />
      </div>
    </div>
  );
}
