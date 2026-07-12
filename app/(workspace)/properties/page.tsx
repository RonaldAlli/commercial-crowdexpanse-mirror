import Link from "next/link";
import type { Prisma } from "@prisma/client";

import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { ilike, listQueryString, parseListParams, totalPages } from "@/lib/list-params";
import { prisma } from "@/lib/prisma";
import { titleCase } from "@/lib/property-options";

export const dynamic = "force-dynamic";

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "name", label: "Name A–Z" },
  { value: "updated", label: "Recently updated" },
] as const;

const SORT_KEYS = SORT_OPTIONS.map((o) => o.value);

const SORT_ORDER: Record<string, Prisma.PropertyOrderByWithRelationInput> = {
  newest: { createdAt: "desc" }, // default — preserves the previous ordering
  name: { name: "asc" },
  updated: { updatedAt: "desc" },
};

function usd(value: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 1,
    notation: "compact",
  }).format(value);
}

function percent(value: number | null) {
  return value == null ? "—" : `${value}%`;
}

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: { q?: string; sort?: string; page?: string };
}) {
  const user = await requireUser();
  const params = parseListParams(searchParams, { sortKeys: SORT_KEYS, defaultSort: "newest" });

  const where: Prisma.PropertyWhereInput = { organizationId: user.organizationId };
  if (params.hasQuery) {
    where.OR = [
      { name: ilike(params.q) },
      { addressLine1: ilike(params.q) },
      { city: ilike(params.q) },
      { state: ilike(params.q) },
    ];
  }

  const [total, properties] = await Promise.all([
    prisma.property.count({ where }),
    prisma.property.findMany({
      where,
      include: { seller: { select: { name: true } } },
      orderBy: SORT_ORDER[params.sort],
      skip: params.skip,
      take: params.take,
    }),
  ]);

  const pages = totalPages(total);
  const pageLink = (page: number) => listQueryString({ q: params.q, sort: params.sort, page });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Property records"
        title="Properties"
        description="Asset inventory tied to sellers, underwriting, and opportunity flow."
        actions={
          can(user.role, "CREATE", "PROPERTY") ? (
            <Link className="btn-primary" href="/properties/new">
              Add property
              <Icon name="arrowUpRight" className="h-4 w-4" />
            </Link>
          ) : null
        }
      />

      {/* Search + sort (GET form — no JS required; submitting resets to page 1) */}
      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-slate-500">
          Search
          <input
            className="input h-9 py-0 text-sm"
            name="q"
            type="search"
            defaultValue={params.q}
            placeholder="Name, address, city, or state…"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          Sort
          <select name="sort" defaultValue={params.sort} className="input h-9 w-44 py-0 text-sm">
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn">
          Apply
        </button>
        {params.hasQuery ? (
          <Link href="/properties" className="btn-ghost">
            Clear
          </Link>
        ) : null}
      </form>

      {properties.length > 0 ? (
        <>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse">
                <thead className="border-b border-slate-200 bg-slate-50/60">
                  <tr>
                    <th className="table-head">Property</th>
                    <th className="table-head">Asset type</th>
                    <th className="table-head text-right">Units</th>
                    <th className="table-head text-right">Occupancy</th>
                    <th className="table-head text-right">Asking</th>
                    <th className="table-head text-right">NOI</th>
                    <th className="table-head">Seller</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {properties.map((property) => (
                    <tr key={property.id} className="transition-colors hover:bg-slate-50/60">
                      <td className="table-cell">
                        <Link href={`/properties/${property.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                          {property.name}
                        </Link>
                        <p className="text-xs text-slate-500">
                          {[property.city, property.state].filter(Boolean).join(", ") || "—"}
                        </p>
                      </td>
                      <td className="table-cell whitespace-nowrap">
                        <Badge tone="neutral">{titleCase(property.assetType)}</Badge>
                      </td>
                      <td className="table-cell metric text-right text-slate-900">{property.unitCount ?? "—"}</td>
                      <td className="table-cell metric text-right text-slate-900">{percent(property.occupancyRate)}</td>
                      <td className="table-cell metric text-right font-medium text-slate-900">{usd(property.askingPriceUsd)}</td>
                      <td className="table-cell metric text-right font-medium text-emerald-600">{usd(property.noiAnnualUsd)}</td>
                      <td className="table-cell whitespace-nowrap text-slate-600">{property.seller?.name ?? "Unassigned"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-sm text-slate-500">
            <span>
              {total} propert{total === 1 ? "y" : "ies"} · page {params.page} of {pages}
            </span>
            <div className="flex gap-2">
              {params.page > 1 ? (
                <Link className="btn-ghost" href={pageLink(params.page - 1)}>
                  Previous
                </Link>
              ) : (
                <span className="btn-ghost cursor-not-allowed opacity-40">Previous</span>
              )}
              {params.page < pages ? (
                <Link className="btn-ghost" href={pageLink(params.page + 1)}>
                  Next
                </Link>
              ) : (
                <span className="btn-ghost cursor-not-allowed opacity-40">Next</span>
              )}
            </div>
          </div>
        </>
      ) : params.hasQuery ? (
        <div className="card">
          <EmptyState
            icon="properties"
            title="No properties match"
            description={`Nothing matched “${params.q}”. Try a different search or clear it.`}
            action={
              <Link className="btn-primary" href="/properties">
                Clear search
              </Link>
            }
          />
        </div>
      ) : (
        <div className="card">
          <EmptyState
            icon="properties"
            title="No properties yet"
            description="Add your first commercial asset to start underwriting and matching."
            action={
              can(user.role, "CREATE", "PROPERTY") ? (
                <Link className="btn-primary" href="/properties/new">
                  Add property
                </Link>
              ) : null
            }
          />
        </div>
      )}
    </div>
  );
}
