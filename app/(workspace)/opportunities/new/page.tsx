import { PageHeader } from "@/components/page-header";
import { OpportunityForm } from "@/components/opportunity-form";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { PRIORITY_OPTIONS, STAGE_OPTIONS } from "@/lib/opportunity-options";

import { createOpportunity } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewOpportunityPage({
  searchParams,
}: {
  searchParams?: { sellerId?: string; propertyId?: string };
}) {
  const user = await requireUser();
  if (!can(user.role, "CREATE", "OPPORTUNITY")) notFound();

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

  // Prefill seed (e.g. from "Promote to opportunity" on a qualified seller). Only
  // honor ids that resolve to this org's own options, so a stale/foreign query
  // param silently falls back to unselected rather than pre-filling a bad value.
  // The canonical createOpportunity path still re-validates on submit — this is
  // presentation seeding only, never a second authorization/validation surface.
  const seedSellerId =
    searchParams?.sellerId && sellers.some((s) => s.id === searchParams.sellerId)
      ? searchParams.sellerId
      : undefined;
  const seedPropertyId =
    searchParams?.propertyId && properties.some((p) => p.id === searchParams.propertyId)
      ? searchParams.propertyId
      : undefined;
  const values = seedSellerId || seedPropertyId ? { sellerId: seedSellerId, propertyId: seedPropertyId } : undefined;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader eyebrow="Acquisitions pipeline" title="New opportunity" description="Create a deal and link it to a property and seller." />
      <div className="card p-6">
        <OpportunityForm
          action={createOpportunity}
          values={values}
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
