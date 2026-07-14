import { notFound } from "next/navigation";

import { OwnerForm } from "@/components/owner-form";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getFieldProvenance } from "@/lib/intelligence/provenance";
import { getOwner } from "@/lib/owners";

import { updateOwnerFieldsAction } from "../../actions";

export default async function EditOwnerPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!can(user.role, "UPDATE", "OWNER")) notFound();

  const owner = await getOwner(user.organizationId, params.id);
  if (!owner) notFound();

  const ref = (fieldKey: string) => ({ entityType: "OWNER" as const, entityId: owner.id, fieldKey });
  const [nameProv, typeProv] = await Promise.all([getFieldProvenance(user.organizationId, ref("displayName")), getFieldProvenance(user.organizationId, ref("entityType"))]);
  const overrides = {
    displayName: nameProv.accepted.some((s) => s.isOverride),
    entityType: typeProv.accepted.some((s) => s.isOverride),
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader eyebrow="Owner record" title={`Edit ${owner.displayName}`} description="Edits are appended to the ledger and reprojected — the ledger stays authoritative." />
      <div className="card p-6">
        <OwnerForm
          action={updateOwnerFieldsAction.bind(null, owner.id)}
          mode="edit"
          values={{ displayName: owner.displayName, entityType: owner.entityType }}
          overrides={overrides}
          submitLabel="Save changes"
          cancelHref={`/owners/${owner.id}`}
        />
      </div>
    </div>
  );
}
