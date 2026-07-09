import { PageHeader } from "@/components/page-header";
import { SellerForm } from "@/components/seller-form";

import { createSeller } from "../actions";

export default function NewSellerPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        eyebrow="Seller records"
        title="Add seller"
        description="Create a new motivated-seller record. Only a name is required."
      />
      <div className="card p-6">
        <SellerForm action={createSeller} submitLabel="Create seller" cancelHref="/sellers" />
      </div>
    </div>
  );
}
