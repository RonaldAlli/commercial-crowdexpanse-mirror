import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { SellerForm } from "@/components/seller-form";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

import { createSeller } from "../actions";

export default async function NewSellerPage() {
  const user = await requireUser();
  if (!can(user.role, "CREATE", "SELLER")) notFound();

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
