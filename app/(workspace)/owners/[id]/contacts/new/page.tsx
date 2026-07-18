import { notFound } from "next/navigation";

import { OwnerContactForm } from "@/components/owner-contact-form";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

import { createOwnerContactAction } from "../../../actions";

export default async function NewOwnerContactPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!can(user.role, "UPDATE", "OWNER")) notFound();

  const owner = await prisma.owner.findFirst({
    where: { id: params.id, organizationId: user.organizationId },
    select: { id: true, displayName: true },
  });
  if (!owner) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader eyebrow="Owner contact" title={`Add contact for ${owner.displayName}`} description="Store the best reachable owner contact details separately from canonical owner identity." />
      <div className="card p-6">
        <OwnerContactForm
          action={createOwnerContactAction.bind(null, owner.id)}
          submitLabel="Save contact"
          cancelHref={`/owners/${owner.id}`}
        />
      </div>
    </div>
  );
}
