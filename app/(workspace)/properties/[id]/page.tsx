import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { NotesSection } from "@/components/notes-section";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { titleCase } from "@/lib/property-options";

import { deleteProperty } from "../actions";

export const dynamic = "force-dynamic";

function usd(value: number | null) {
  return value == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

export default async function PropertyDetailPage({ params }: { params: { id: string } }) {
  const user = await requireUser();

  const property = await prisma.property.findFirst({
    where: { id: params.id, organizationId: user.organizationId },
    include: {
      seller: { select: { id: true, name: true } },
      opportunities: { orderBy: { updatedAt: "desc" } },
      activities: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });

  if (!property) {
    notFound();
  }

  const general: { label: string; value: string | null }[] = [
    { label: "Asset type", value: titleCase(property.assetType) },
    { label: "Status", value: property.status },
    { label: "Address", value: property.addressLine1 },
    { label: "City", value: property.city },
    { label: "State", value: property.state },
    { label: "ZIP", value: property.postalCode },
    { label: "County", value: property.county },
  ];

  const commercial: { label: string; value: string | null }[] = [
    { label: "Units", value: property.unitCount?.toString() ?? null },
    { label: "Square feet", value: property.squareFeet != null ? property.squareFeet.toLocaleString("en-US") : null },
    { label: "Acres", value: property.acreage?.toString() ?? null },
    { label: "Year built", value: property.yearBuilt?.toString() ?? null },
    { label: "Occupancy", value: property.occupancyRate != null ? `${property.occupancyRate}%` : null },
    { label: "NOI", value: property.noiAnnualUsd != null ? usd(property.noiAnnualUsd) : null },
    { label: "Asking price", value: property.askingPriceUsd != null ? usd(property.askingPriceUsd) : null },
    { label: "Estimated value", value: property.estimatedValueUsd != null ? usd(property.estimatedValueUsd) : null },
    { label: "Cap rate", value: property.capRate != null ? `${property.capRate}%` : null },
  ];

  const deletePropertyBound = deleteProperty.bind(null, property.id);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Property record"
        title={property.name}
        description={[property.city, property.state].filter(Boolean).join(", ") || undefined}
        actions={
          <>
            {can(user.role, "UPDATE", "PROPERTY") ? (
              <Link className="btn-ghost" href={`/properties/${property.id}/edit`}>
                <Icon name="notes" className="h-4 w-4" />
                Edit
              </Link>
            ) : null}
            {can(user.role, "DELETE", "PROPERTY") ? (
              <form action={deletePropertyBound}>
                <button type="submit" className="btn border border-rose-200 bg-white text-rose-600 hover:bg-rose-50">
                  Delete
                </button>
              </form>
            ) : null}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <article className="card p-6">
            <p className="eyebrow">General</p>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {general.map((d) => (
                <div key={d.label}>
                  <dt className="text-xs text-slate-500">{d.label}</dt>
                  <dd className="mt-0.5 text-sm font-medium text-slate-900">{d.value ?? "—"}</dd>
                </div>
              ))}
            </dl>
          </article>

          <article className="card p-6">
            <p className="eyebrow">Commercial</p>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {commercial.map((d) => (
                <div key={d.label}>
                  <dt className="text-xs text-slate-500">{d.label}</dt>
                  <dd className="metric mt-0.5 text-sm font-medium text-slate-900">{d.value ?? "—"}</dd>
                </div>
              ))}
            </dl>
          </article>

          <article className="card">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-900">Opportunities</h2>
              <Badge tone="neutral">{property.opportunities.length}</Badge>
            </div>
            {property.opportunities.length > 0 ? (
              <ul className="divide-y divide-slate-100">
                {property.opportunities.map((opp) => (
                  <li key={opp.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                    <p className="truncate text-sm font-medium text-slate-900">{opp.title}</p>
                    <Badge tone="info" dot>
                      {titleCase(opp.stage)}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon="pipeline" title="No opportunities yet" description="Opportunities created from this property will appear here." />
            )}
          </article>
        </div>

        <div className="space-y-6 lg:col-span-1">
          <article className="card p-6">
            <p className="eyebrow">Ownership</p>
            <div className="mt-4 space-y-3">
              <div>
                <p className="text-xs text-slate-500">Seller</p>
                {property.seller ? (
                  <Link href={`/sellers/${property.seller.id}`} className="mt-0.5 block text-sm font-medium text-brand-700 hover:underline">
                    {property.seller.name}
                  </Link>
                ) : (
                  <p className="mt-0.5 text-sm font-medium text-slate-900">Unassigned</p>
                )}
              </div>
              <div>
                <p className="text-xs text-slate-500">Organization</p>
                <p className="mt-0.5 text-sm font-medium text-slate-900">{user.organizationName}</p>
              </div>
            </div>
          </article>

          <article className="card">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-900">Activity</h2>
            </div>
            {property.activities.length > 0 ? (
              <ul className="px-5 py-2">
                {property.activities.map((entry, i) => (
                  <li key={entry.id} className="flex gap-4 py-3">
                    <div className="flex flex-col items-center">
                      <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-brand-500 ring-4 ring-brand-50" />
                      {i < property.activities.length - 1 ? <span className="mt-1 w-px flex-1 bg-slate-200" /> : null}
                    </div>
                    <div className="min-w-0 pb-1">
                      <p className="text-sm font-medium text-slate-900">{entry.eventLabel}</p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {entry.createdAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon="activity" title="No activity yet" />
            )}
          </article>
        </div>
      </div>

      <NotesSection organizationId={user.organizationId} type="property" id={property.id} />
    </div>
  );
}
