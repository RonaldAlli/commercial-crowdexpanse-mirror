import { PageHeader } from "@/components/page-header";
import { BuyerForm } from "@/components/buyer-form";
import { ASSET_TYPE_OPTIONS } from "@/lib/property-options";

import { createBuyer } from "../actions";

export default function NewBuyerPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader eyebrow="Buyer records" title="Add buyer" description="Create a new capital partner and their buy box." />
      <div className="card p-6">
        <BuyerForm action={createBuyer} assetTypes={ASSET_TYPE_OPTIONS} submitLabel="Create buyer" cancelHref="/buyers" />
      </div>
    </div>
  );
}
