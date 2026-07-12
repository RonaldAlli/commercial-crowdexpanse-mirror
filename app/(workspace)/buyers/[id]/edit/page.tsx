import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { BuyerForm } from "@/components/buyer-form";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { ASSET_TYPE_OPTIONS } from "@/lib/property-options";

import { updateBuyer } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditBuyerPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!can(user.role, "UPDATE", "BUYER")) notFound();

  const buyer = await prisma.buyer.findFirst({
    where: { id: params.id, organizationId: user.organizationId },
  });

  if (!buyer) {
    notFound();
  }

  const action = updateBuyer.bind(null, buyer.id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader eyebrow="Buyer records" title={`Edit ${buyer.name}`} description="Update this buyer's details and buy box." />
      <div className="card p-6">
        <BuyerForm
          action={action}
          assetTypes={ASSET_TYPE_OPTIONS}
          values={{
            name: buyer.name,
            company: buyer.company,
            email: buyer.email,
            phone: buyer.phone,
            targetAssetTypes: buyer.targetAssetTypes,
            targetStates: buyer.targetStates,
            minimumPurchaseUsd: buyer.minimumPurchaseUsd,
            maximumPurchaseUsd: buyer.maximumPurchaseUsd,
          }}
          submitLabel="Save changes"
          cancelHref={`/buyers/${buyer.id}`}
        />
      </div>
    </div>
  );
}
