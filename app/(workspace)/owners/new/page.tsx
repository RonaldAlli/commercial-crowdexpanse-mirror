import { notFound } from "next/navigation";

import { OwnerForm } from "@/components/owner-form";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

import { createOwnerAction } from "../actions";

export default async function NewOwnerPage() {
  const user = await requireUser();
  if (!can(user.role, "CREATE", "OWNER")) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        eyebrow="Commercial intelligence"
        title="Add owner"
        description="Create a canonical owner. Its name and type are seeded as user-entered signals in the ledger."
      />
      <div className="card p-6">
        <OwnerForm action={createOwnerAction} mode="create" submitLabel="Create owner" cancelHref="/owners" />
      </div>
    </div>
  );
}
