import { notFound } from "next/navigation";

import { OwnerContactForm } from "@/components/owner-contact-form";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

import { updateOwnerContactAction } from "../../../../actions";

export default async function EditOwnerContactPage({ params }: { params: { id: string; contactId: string } }) {
  const user = await requireUser();
  if (!can(user.role, "UPDATE", "OWNER")) notFound();

  const owner = await prisma.owner.findFirst({
    where: { id: params.id, organizationId: user.organizationId },
    select: { id: true, displayName: true },
  });
  if (!owner) notFound();

  const contact = await prisma.ownerContact.findFirst({
    where: { id: params.contactId, ownerId: owner.id, organizationId: user.organizationId },
  });
  if (!contact) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader eyebrow="Owner contact" title={`Edit contact for ${owner.displayName}`} description="Update the operational contact details used for outreach and follow-up." />
      <div className="card p-6">
        <OwnerContactForm
          action={updateOwnerContactAction.bind(null, owner.id, contact.id)}
          values={{
            label: contact.label,
            contactName: contact.contactName,
            company: contact.company,
            email: contact.email,
            phone: contact.phone,
            mailingAddress: contact.mailingAddress,
            notes: contact.notes,
            isPrimary: contact.isPrimary,
          }}
          submitLabel="Save changes"
          cancelHref={`/owners/${owner.id}`}
        />
      </div>
    </div>
  );
}
