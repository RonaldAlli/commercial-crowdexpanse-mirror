import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { BuyerForm } from "@/components/buyer-form";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { ASSET_TYPE_OPTIONS } from "@/lib/property-options";

import { createBuyer } from "../actions";

export default async function NewBuyerPage() {
  const user = await requireUser();
  if (!can(user.role, "CREATE", "BUYER")) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader eyebrow="Buyer records" title="Add buyer" description="Create a new capital partner and their buy box." />
      <div className="card p-6">
        <BuyerForm action={createBuyer} assetTypes={ASSET_TYPE_OPTIONS} submitLabel="Create buyer" cancelHref="/buyers" />
      </div>
    </div>
  );
}
