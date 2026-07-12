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

const SORT_ORDER: Record<string, Prisma.BuyerOrderByWithRelationInput> = {
  newest: { createdAt: "desc" }, // default — preserves the previous ordering
  name: { name: "asc" },
  updated: { updatedAt: "desc" },
};

function usd(value: number | null) {
  if (value == null) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 1,
    notation: "compact",
  }).format(value);
}

function rangeLabel(min: number | null, max: number | null) {
  const lo = usd(min);
  const hi = usd(max);
  if (lo && hi) return `${lo} – ${hi}`;
  if (lo) return `${lo}+`;
  if (hi) return `Up to ${hi}`;
  return "—";
}

export default async function BuyersPage({
  searchParams,
}: {
  searchParams: { q?: string; sort?: string; page?: string };
}) {
  const user = await requireUser();
  const params = parseListParams(searchParams, { sortKeys: SORT_KEYS, defaultSort: "newest" });

  const where: Prisma.BuyerWhereInput = { organizationId: user.organizationId };
  if (params.hasQuery) {
    where.OR = [{ name: ilike(params.q) }, { company: ilike(params.q) }, { email: ilike(params.q) }];
  }

  const [total, buyers] = await Promise.all([
    prisma.buyer.count({ where }),
    prisma.buyer.findMany({
      where,
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
        eyebrow="Buyer records"
        title="Buyers"
        description="Capital partners by asset appetite, target market, and purchase range."
        actions={
          can(user.role, "CREATE", "BUYER") ? (
            <Link className="btn-primary" href="/buyers/new">
              Add buyer
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
            placeholder="Name, company, or email…"
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
          <Link href="/buyers" className="btn-ghost">
            Clear
          </Link>
        ) : null}
      </form>

      {buyers.length > 0 ? (
        <>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {buyers.map((buyer) => (
              <Link
                key={buyer.id}
                href={`/buyers/${buyer.id}`}
                className="card p-5 transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">{buyer.name}</p>
                    {buyer.company ? <p className="truncate text-xs text-slate-500">{buyer.company}</p> : null}
                  </div>
                  <Badge tone="brand">{rangeLabel(buyer.minimumPurchaseUsd, buyer.maximumPurchaseUsd)}</Badge>
                </div>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {buyer.targetAssetTypes.length > 0 ? (
                    buyer.targetAssetTypes.map((t) => (
                      <Badge key={t} tone="neutral">
                        {titleCase(t)}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-xs text-slate-400">No target asset types</span>
                  )}
                </div>

                <p className="mt-3 text-xs text-slate-500">
                  {buyer.targetStates.length > 0 ? `Markets: ${buyer.targetStates.join(", ")}` : "No target markets"}
                </p>
              </Link>
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-sm text-slate-500">
            <span>
              {total} buyer{total === 1 ? "" : "s"} · page {params.page} of {pages}
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
            icon="buyers"
            title="No buyers match"
            description={`Nothing matched “${params.q}”. Try a different search or clear it.`}
            action={
              <Link className="btn-primary" href="/buyers">
                Clear search
              </Link>
            }
          />
        </div>
      ) : (
        <div className="card">
          <EmptyState
            icon="buyers"
            title="No buyers yet"
            description="Add capital partners to match against your acquisition pipeline."
            action={
              can(user.role, "CREATE", "BUYER") ? (
                <Link className="btn-primary" href="/buyers/new">
                  Add buyer
                </Link>
              ) : null
            }
          />
        </div>
      )}
    </div>
  );
}
