import Link from "next/link";
import { notFound } from "next/navigation";

import { Icon } from "@/components/icons";
import { OwnerProvenance } from "@/components/owner-provenance";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getFieldProvenance } from "@/lib/intelligence/provenance";
import { prisma } from "@/lib/prisma";

import { clearOverrideAction } from "../actions";

export const dynamic = "force-dynamic";

function titleCase(value: string) {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

export default async function OwnerDetailPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const org = user.organizationId;

  const owner = await prisma.owner.findFirst({
    where: { id: params.id, organizationId: org },
    include: {
      sellers: { select: { id: true, name: true, company: true }, orderBy: { createdAt: "desc" } },
      properties: { select: { id: true, name: true, addressLine1: true, city: true, state: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!owner) notFound();

  const canWrite = can(user.role, "UPDATE", "OWNER");
  const ref = (fieldKey: string) => ({ entityType: "OWNER" as const, entityId: owner.id, fieldKey });
  const [nameProv, typeProv] = await Promise.all([getFieldProvenance(org, ref("displayName")), getFieldProvenance(org, ref("entityType"))]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Owner record"
        title={owner.displayName}
        description={owner.matchKey}
        actions={
          canWrite ? (
            <Link className="btn-ghost" href={`/owners/${owner.id}/edit`}>
              <Icon name="notes" className="h-4 w-4" />
              Edit
            </Link>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="neutral">{titleCase(owner.entityType)}</Badge>
        {owner.status !== "ACTIVE" ? <Badge tone="warning">{titleCase(owner.status)}</Badge> : <Badge tone="success" dot>Active</Badge>}
        <span className="text-xs text-slate-400">Identity key: {owner.matchKey}</span>
      </div>

      {/* Projected fields with provenance: Projected Value → Winning Signal → Signal History. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <OwnerProvenance
          fieldLabel="Owner name"
          projectedValue={owner.displayName}
          provenance={nameProv}
          canWrite={canWrite}
          clearAction={canWrite ? clearOverrideAction.bind(null, owner.id, "displayName") : undefined}
        />
        <OwnerProvenance
          fieldLabel="Entity type"
          projectedValue={owner.entityType}
          provenance={typeProv}
          canWrite={canWrite}
          clearAction={canWrite ? clearOverrideAction.bind(null, owner.id, "entityType") : undefined}
        />
      </div>

      {/* Linked operational records (read-only in 1d-1; linking arrives in 1d-2). */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card p-5">
          <p className="mb-2 text-sm font-semibold text-slate-700">Sellers ({owner.sellers.length})</p>
          {owner.sellers.length === 0 ? (
            <p className="text-sm text-slate-400">No linked sellers.</p>
          ) : (
            <ul className="space-y-1.5">
              {owner.sellers.map((s) => (
                <li key={s.id}>
                  <Link href={`/sellers/${s.id}`} className="text-sm text-slate-700 hover:text-brand-700">
                    {s.name}
                    {s.company ? <span className="text-slate-400"> · {s.company}</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card p-5">
          <p className="mb-2 text-sm font-semibold text-slate-700">Properties ({owner.properties.length})</p>
          {owner.properties.length === 0 ? (
            <p className="text-sm text-slate-400">No linked properties.</p>
          ) : (
            <ul className="space-y-1.5">
              {owner.properties.map((p) => (
                <li key={p.id}>
                  <Link href={`/properties/${p.id}`} className="text-sm text-slate-700 hover:text-brand-700">
                    {p.name}
                    <span className="text-slate-400"> · {[p.addressLine1, p.city, p.state].filter(Boolean).join(", ")}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
