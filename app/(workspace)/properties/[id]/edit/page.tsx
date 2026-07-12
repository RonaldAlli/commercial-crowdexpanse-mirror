import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { PropertyForm } from "@/components/property-form";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { ASSET_TYPE_OPTIONS, PROPERTY_STATUSES } from "@/lib/property-options";

import { updateProperty } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditPropertyPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!can(user.role, "UPDATE", "PROPERTY")) notFound();

  const [property, sellers] = await Promise.all([
    prisma.property.findFirst({ where: { id: params.id, organizationId: user.organizationId } }),
    prisma.seller.findMany({
      where: { organizationId: user.organizationId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!property) {
    notFound();
  }

  const action = updateProperty.bind(null, property.id);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader eyebrow="Property records" title={`Edit ${property.name}`} description="Update this property's details." />
      <div className="card p-6">
        <PropertyForm
          action={action}
          sellers={sellers}
          assetTypes={ASSET_TYPE_OPTIONS}
          statuses={PROPERTY_STATUSES}
          organizationName={user.organizationName}
          values={{
            name: property.name,
            assetType: property.assetType,
            status: property.status,
            addressLine1: property.addressLine1,
            city: property.city,
            state: property.state,
            postalCode: property.postalCode,
            county: property.county,
            sellerId: property.sellerId,
            unitCount: property.unitCount,
            squareFeet: property.squareFeet,
            acreage: property.acreage,
            yearBuilt: property.yearBuilt,
            occupancyRate: property.occupancyRate,
            noiAnnualUsd: property.noiAnnualUsd,
            askingPriceUsd: property.askingPriceUsd,
            estimatedValueUsd: property.estimatedValueUsd,
            capRate: property.capRate,
          }}
          submitLabel="Save changes"
          cancelHref={`/properties/${property.id}`}
        />
      </div>
    </div>
  );
}
