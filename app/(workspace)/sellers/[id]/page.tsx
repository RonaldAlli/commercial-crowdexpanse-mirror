import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { NotesSection } from "@/components/notes-section";
import { Icon } from "@/components/icons";
import { OwnerPrimaryContactCard } from "@/components/owner-primary-contact-card";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { resolveSellerPromotion } from "@/lib/promote-seller";

import { deleteSeller } from "../actions";
import { unlinkSellerAction } from "../../owners/actions";

export const dynamic = "force-dynamic";

function titleCase(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default async function SellerDetailPage({ params }: { params: { id: string } }) {
  const user = await requireUser();

  const seller = await prisma.seller.findFirst({
    where: { id: params.id, organizationId: user.organizationId },
    include: {
      owner: {
        select: {
          id: true,
          displayName: true,
          contacts: {
            where: { isPrimary: true },
            take: 1,
            orderBy: { createdAt: "desc" },
          },
        },
      },
      properties: { orderBy: { createdAt: "desc" } },
      opportunities: { orderBy: { updatedAt: "desc" } },
      activities: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });

  if (!seller) {
    notFound();
  }

  const details: { label: string; value: string | null }[] = [
    { label: "Company", value: seller.company },
    { label: "Email", value: seller.email },
    { label: "Phone", value: seller.phone },
    { label: "Market", value: [seller.city, seller.state].filter(Boolean).join(", ") || null },
  ];
  const primaryOwnerContact = seller.owner
    ? {
        ...seller.owner.contacts[0],
        ownerId: seller.owner.id,
        ownerName: seller.owner.displayName,
      }
    : null;

  const deleteSellerBound = deleteSeller.bind(null, seller.id);

  // Promote to opportunity — the Seller Acquisition vertical (Path A). Pure decision
  // in lib/promote-seller.ts; this only seeds the existing New-Opportunity form, which
  // invokes the canonical createOpportunity path (AC-PROMOTE-7).
  const promote = resolveSellerPromotion({
    canCreateOpportunity: can(user.role, "CREATE", "OPPORTUNITY"),
    outreachStatus: seller.outreachStatus,
    sellerId: seller.id,
    propertyIds: seller.properties.map((p) => p.id),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Seller record"
        title={seller.name}
        description={seller.company ?? undefined}
        actions={
          <>
            {promote ? (
              <Link className="btn-primary" href={promote.href}>
                <Icon name="pipeline" className="h-4 w-4" />
                {promote.label}
              </Link>
            ) : null}
            {can(user.role, "UPDATE", "SELLER") ? (
              <Link className="btn-ghost" href={`/sellers/${seller.id}/edit`}>
                <Icon name="notes" className="h-4 w-4" />
                Edit
              </Link>
            ) : null}
            {can(user.role, "DELETE", "SELLER") ? (
              <form action={deleteSellerBound}>
                <button
                  type="submit"
                  className="btn border border-rose-200 bg-white text-rose-600 hover:bg-rose-50"
                >
                  Delete
                </button>
              </form>
            ) : null}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Details + motivation */}
        <div className="space-y-6 lg:col-span-2">
          <article className="card p-6">
            <p className="eyebrow">Contact</p>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              {details.map((d) => (
                <div key={d.label}>
                  <dt className="text-xs text-slate-500">{d.label}</dt>
                  <dd className="mt-0.5 text-sm font-medium text-slate-900">{d.value ?? "—"}</dd>
                </div>
              ))}
            </dl>
            {seller.motivation ? (
              <div className="mt-6 border-t border-slate-100 pt-5">
                <p className="eyebrow">Motivation</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{seller.motivation}</p>
              </div>
            ) : null}
            <div className="mt-6 border-t border-slate-100 pt-5">
              <div className="flex items-center justify-between">
                <p className="eyebrow">Owner</p>
                {can(user.role, "UPDATE", "OWNER") ? (
                  <Link className="text-xs font-medium text-brand-700 hover:underline" href={`/sellers/${seller.id}/link-owner`}>
                    {seller.owner ? "Change" : "Link owner"}
                  </Link>
                ) : null}
              </div>
              {seller.owner ? (
                <div className="mt-2 flex items-center justify-between gap-2">
                  <Link href={`/owners/${seller.owner.id}`} className="text-sm font-medium text-slate-900 hover:text-brand-700">
                    {seller.owner.displayName}
                  </Link>
                  {can(user.role, "UPDATE", "OWNER") ? (
                    <form action={unlinkSellerAction}>
                      <input type="hidden" name="sellerId" value={seller.id} />
                      <input type="hidden" name="redirectTo" value={`/sellers/${seller.id}`} />
                      <button type="submit" className="text-xs text-slate-400 hover:text-rose-600">Unlink</button>
                    </form>
                  ) : null}
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-400">No owner linked.</p>
              )}
            </div>
          </article>

          <OwnerPrimaryContactCard title="Owner primary contact" owner={primaryOwnerContact} />

          {/* Properties */}
          <article className="card">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-900">Properties</h2>
              <Badge tone="neutral">{seller.properties.length}</Badge>
            </div>
            {seller.properties.length > 0 ? (
              <ul className="divide-y divide-slate-100">
                {seller.properties.map((property) => (
                  <li key={property.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">{property.name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {titleCase(property.assetType)} · {property.city}, {property.state}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon="properties" title="No properties linked" />
            )}
          </article>
        </div>

        {/* Activity */}
        <article className="card lg:col-span-1">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-900">Activity</h2>
          </div>
          {seller.activities.length > 0 ? (
            <ul className="px-5 py-2">
              {seller.activities.map((entry, i) => (
                <li key={entry.id} className="flex gap-4 py-3">
                  <div className="flex flex-col items-center">
                    <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-brand-500 ring-4 ring-brand-50" />
                    {i < seller.activities.length - 1 ? (
                      <span className="mt-1 w-px flex-1 bg-slate-200" />
                    ) : null}
                  </div>
                  <div className="min-w-0 pb-1">
                    <p className="text-sm font-medium text-slate-900">{entry.eventLabel}</p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {entry.createdAt.toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
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

      <NotesSection organizationId={user.organizationId} type="seller" id={seller.id} />
    </div>
  );
}
