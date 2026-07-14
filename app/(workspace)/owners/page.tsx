import Link from "next/link";
import type { Prisma } from "@prisma/client";

import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth";
import { can, canMergeOwners } from "@/lib/permissions";
import { ilike, listQueryString, parseListParams, totalPages } from "@/lib/list-params";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "name", label: "Name A–Z" },
  { value: "updated", label: "Recently updated" },
] as const;
const SORT_KEYS = SORT_OPTIONS.map((o) => o.value);
const SORT_ORDER: Record<string, Prisma.OwnerOrderByWithRelationInput> = {
  newest: { createdAt: "desc" },
  name: { displayName: "asc" },
  updated: { updatedAt: "desc" },
};

function titleCase(value: string) {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

export default async function OwnersPage({
  searchParams,
}: {
  searchParams: { q?: string; sort?: string; page?: string; merged?: string };
}) {
  const user = await requireUser();
  const params = parseListParams(searchParams, { sortKeys: SORT_KEYS, defaultSort: "newest" });
  const showMerged = searchParams.merged === "1";

  const where: Prisma.OwnerWhereInput = { organizationId: user.organizationId };
  if (!showMerged) where.status = "ACTIVE";
  if (params.hasQuery) where.OR = [{ displayName: ilike(params.q) }, { matchKey: ilike(params.q) }];

  const [total, owners] = await Promise.all([
    prisma.owner.count({ where }),
    prisma.owner.findMany({
      where,
      select: {
        id: true,
        displayName: true,
        entityType: true,
        status: true,
        matchKey: true,
        _count: { select: { sellers: true, properties: true } },
      },
      orderBy: SORT_ORDER[params.sort],
      skip: params.skip,
      take: params.take,
    }),
  ]);

  const pages = totalPages(total);
  const canCreate = can(user.role, "CREATE", "OWNER");
  const canReviewDuplicates = can(user.role, "READ", "OWNER_IDENTITY");
  const canMerge = canMergeOwners(user.role);
  const baseQuery = { q: params.hasQuery ? params.q : undefined, sort: params.sort, merged: showMerged ? "1" : undefined };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Commercial intelligence"
        title="Owners"
        description="Canonical title-holding parties. Values are projected from the provenance ledger."
        actions={
          <>
            {canReviewDuplicates ? (
              <Link className="btn-ghost" href="/owners/candidates">
                Review duplicates
              </Link>
            ) : null}
            {canMerge ? (
              <Link className="btn-ghost" href="/owners/merges">
                Merges
              </Link>
            ) : null}
            {canCreate ? (
              <Link className="btn-primary" href="/owners/new">
                <Icon name="buyers" className="h-4 w-4" />
                New owner
              </Link>
            ) : null}
          </>
        }
      />

      <form className="flex flex-wrap items-center gap-2" action="/owners">
        <div className="relative flex-1 min-w-[220px]">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" name="q" defaultValue={params.hasQuery ? params.q : ""} placeholder="Search by name…" />
        </div>
        <select className="input w-auto" name="sort" defaultValue={params.sort}>
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" name="merged" value="1" defaultChecked={showMerged} />
          Include merged
        </label>
        <button className="btn-ghost" type="submit">
          Apply
        </button>
      </form>

      {owners.length === 0 ? (
        <EmptyState
          icon="buyers"
          title={params.hasQuery ? "No owners match your search" : "No owners yet"}
          description={params.hasQuery ? "Try a different name." : "Create the first owner to start building the intelligence graph."}
          action={
            canCreate && !params.hasQuery ? (
              <Link className="btn-primary" href="/owners/new">
                New owner
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="card divide-y divide-slate-100">
          {owners.map((o) => (
            <Link key={o.id} href={`/owners/${o.id}`} className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-slate-50">
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-900">{o.displayName}</p>
                <p className="truncate text-xs text-slate-400">{o.matchKey}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {o.status !== "ACTIVE" ? <Badge tone="warning">{titleCase(o.status)}</Badge> : null}
                <Badge tone="neutral">{titleCase(o.entityType)}</Badge>
                <span className="text-xs text-slate-400">
                  {o._count.sellers} seller{o._count.sellers === 1 ? "" : "s"} · {o._count.properties} propert{o._count.properties === 1 ? "y" : "ies"}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {pages > 1 ? (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>
            Page {params.page} of {pages} · {total} owner{total === 1 ? "" : "s"}
          </span>
          <div className="flex gap-2">
            {params.page > 1 ? (
              <Link className="btn-ghost" href={`/owners${listQueryString({ ...baseQuery, page: params.page - 1 })}`}>
                Previous
              </Link>
            ) : null}
            {params.page < pages ? (
              <Link className="btn-ghost" href={`/owners${listQueryString({ ...baseQuery, page: params.page + 1 })}`}>
                Next
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
