import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { SellerForm } from "@/components/seller-form";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import { updateSeller } from "../../actions";

export default async function EditSellerPage({ params }: { params: { id: string } }) {
  const user = await requireUser();

  const seller = await prisma.seller.findFirst({
    where: { id: params.id, organizationId: user.organizationId },
  });

  if (!seller) {
    notFound();
  }

  const action = updateSeller.bind(null, seller.id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader eyebrow="Seller records" title={`Edit ${seller.name}`} description="Update this seller's details." />
      <div className="card p-6">
        <SellerForm
          action={action}
          values={{
            name: seller.name,
            company: seller.company,
            email: seller.email,
            phone: seller.phone,
            city: seller.city,
            state: seller.state,
            motivation: seller.motivation,
          }}
          submitLabel="Save changes"
          cancelHref={`/sellers/${seller.id}`}
        />
      </div>
    </div>
  );
}
