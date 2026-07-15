import Link from "next/link";
import { notFound } from "next/navigation";

import { Icon } from "@/components/icons";
import { FieldProvenanceCard } from "@/components/field-provenance";
import { OwnerRefreshForm } from "@/components/owner-refresh-form";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getFieldProvenance } from "@/lib/intelligence/provenance";
import { listRefreshJobsForEntity } from "@/lib/refresh-jobs";
import { prisma } from "@/lib/prisma";

import { clearOverrideAction, unlinkPropertyAction, unlinkSellerAction } from "../actions";
import { triggerRefreshAction } from "../refresh-actions";

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
  const canRefresh = can(user.role, "MANAGE", "REFRESH");
  const canViewRefresh = can(user.role, "READ", "REFRESH");
  const ref = (fieldKey: string) => ({ entityType: "OWNER" as const, entityId: owner.id, fieldKey });
  const [nameProv, typeProv, refreshJobs] = await Promise.all([
    getFieldProvenance(org, ref("displayName")),
    getFieldProvenance(org, ref("entityType")),
    canViewRefresh ? listRefreshJobsForEntity(org, "OWNER", owner.id) : Promise.resolve([]),
  ]);

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
        <FieldProvenanceCard
          fieldLabel="Owner name"
          projectedValue={owner.displayName}
          provenance={nameProv}
          canWrite={canWrite}
          clearAction={canWrite ? clearOverrideAction.bind(null, owner.id, "displayName") : undefined}
        />
        <FieldProvenanceCard
          fieldLabel="Entity type"
          projectedValue={owner.entityType}
          provenance={typeProv}
          canWrite={canWrite}
          clearAction={canWrite ? clearOverrideAction.bind(null, owner.id, "entityType") : undefined}
        />
      </div>

      {/* Linked operational records. Linking edits only the operational graph — never identity. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card p-5">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">Sellers ({owner.sellers.length})</p>
            {canWrite ? (
              <Link href={`/owners/${owner.id}/link?type=seller`} className="text-xs font-medium text-brand-700 hover:underline">
                + Link seller
              </Link>
            ) : null}
          </div>
          {owner.sellers.length === 0 ? (
            <p className="text-sm text-slate-400">No linked sellers.</p>
          ) : (
            <ul className="space-y-1.5">
              {owner.sellers.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2">
                  <Link href={`/sellers/${s.id}`} className="truncate text-sm text-slate-700 hover:text-brand-700">
                    {s.name}
                    {s.company ? <span className="text-slate-400"> · {s.company}</span> : null}
                  </Link>
                  {canWrite ? (
                    <form action={unlinkSellerAction}>
                      <input type="hidden" name="sellerId" value={s.id} />
                      <input type="hidden" name="redirectTo" value={`/owners/${owner.id}`} />
                      <button type="submit" className="shrink-0 text-xs text-slate-400 hover:text-rose-600">Unlink</button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card p-5">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">Properties ({owner.properties.length})</p>
            {canWrite ? (
              <Link href={`/owners/${owner.id}/link?type=property`} className="text-xs font-medium text-brand-700 hover:underline">
                + Link property
              </Link>
            ) : null}
          </div>
          {owner.properties.length === 0 ? (
            <p className="text-sm text-slate-400">No linked properties.</p>
          ) : (
            <ul className="space-y-1.5">
              {owner.properties.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2">
                  <Link href={`/properties/${p.id}`} className="truncate text-sm text-slate-700 hover:text-brand-700">
                    {p.name}
                    <span className="text-slate-400"> · {[p.addressLine1, p.city, p.state].filter(Boolean).join(", ")}</span>
                  </Link>
                  {canWrite ? (
                    <form action={unlinkPropertyAction}>
                      <input type="hidden" name="propertyId" value={p.id} />
                      <input type="hidden" name="redirectTo" value={`/owners/${owner.id}`} />
                      <button type="submit" className="shrink-0 text-xs text-slate-400 hover:text-rose-600">Unlink</button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Manual source refresh (1d-3a): ingestion pipeline over the manual adapter — distinct from Edit. */}
      {canViewRefresh ? (
        <div className="card p-5">
          <p className="mb-1 text-sm font-semibold text-slate-700">Manual source refresh</p>
          {canRefresh ? (
            <OwnerRefreshForm action={triggerRefreshAction.bind(null, owner.id)} />
          ) : (
            <p className="text-xs text-slate-400">You can view refresh history but not run a refresh.</p>
          )}

          <div className="mt-5 border-t border-slate-100 pt-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Recent refresh jobs</p>
            {refreshJobs.length === 0 ? (
              <p className="text-sm text-slate-400">No refresh jobs yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {refreshJobs.map((j) => (
                  <li key={j.id} className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                    <span className="flex items-center gap-2">
                      <Badge tone={j.status === "SUCCEEDED" ? "success" : j.status === "FAILED" ? "danger" : "neutral"}>{j.status}</Badge>
                      <span>via {j.sourceKey}</span>
                      <span>· {j.signalsAccepted} accepted{j.signalsSuperseded ? `, ${j.signalsSuperseded} superseded` : ""}</span>
                    </span>
                    <span className="text-slate-400">{(j.finishedAt ?? j.createdAt).toISOString().slice(0, 16).replace("T", " ")}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
