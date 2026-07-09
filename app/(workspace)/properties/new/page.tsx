import { PageHeader } from "@/components/page-header";
import { PropertyForm } from "@/components/property-form";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ASSET_TYPE_OPTIONS, PROPERTY_STATUSES } from "@/lib/property-options";

import { createProperty } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewPropertyPage() {
  const user = await requireUser();

  const sellers = await prisma.seller.findMany({
    where: { organizationId: user.organizationId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader eyebrow="Property records" title="Add property" description="Create a new commercial asset record." />
      <div className="card p-6">
        <PropertyForm
          action={createProperty}
          sellers={sellers}
          assetTypes={ASSET_TYPE_OPTIONS}
          statuses={PROPERTY_STATUSES}
          organizationName={user.organizationName}
          submitLabel="Create property"
          cancelHref="/properties"
        />
      </div>
    </div>
  );
}
