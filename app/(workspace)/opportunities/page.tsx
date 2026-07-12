import Link from "next/link";
import type { Prisma, UserRole } from "@prisma/client";

import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { StageSelect } from "@/components/stage-select";
import { Badge, statusTone } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth";
import { canMoveStage } from "@/lib/permissions";
import { ilike, listQueryString, parseListParams, totalPages } from "@/lib/list-params";
import { prisma } from "@/lib/prisma";
import { STAGE_OPTIONS, STAGE_ORDER, stageLabel } from "@/lib/opportunity-options";
import { titleCase } from "@/lib/property-options";

import { moveOpportunityStage } from "./actions";

export const dynamic = "force-dynamic";

// Search + sort apply to the List view only; the Board is a full-pipeline
// kanban and is left untouched.
const SORT_OPTIONS = [
  { value: "updated", label: "Recently updated" },
  { value: "newest", label: "Newest" },
  { value: "title", label: "Title A–Z" },
] as const;

const SORT_KEYS = SORT_OPTIONS.map((o) => o.value);

const SORT_ORDER: Record<string, Prisma.OpportunityOrderByWithRelationInput> = {
  updated: { updatedAt: "desc" }, // default — preserves the previous ordering
  newest: { createdAt: "desc" },
  title: { title: "asc" },
};

const OPP_INCLUDE = {
  property: { select: { name: true, city: true, state: true, assetType: true } },
  seller: { select: { name: true } },
} satisfies Prisma.OpportunityInclude;

function usd(value: number | null) {
  return value == null ? null : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 1, notation: "compact" }).format(value);
}

async function loadBoardOpportunities(organizationId: string) {
  return prisma.opportunity.findMany({
    where: { organizationId },
    include: OPP_INCLUDE,
    orderBy: { updatedAt: "desc" },
  });
}

type OppWithRels = Awaited<ReturnType<typeof loadBoardOpportunities>>[number];

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: { view?: string; q?: string; sort?: string; page?: string };
}) {
  const user = await requireUser();
  const view = searchParams.view === "list" ? "list" : "board";

  const header = (
    <PageHeader
      eyebrow="Acquisitions pipeline"
      title="Opportunities"
      description="Every live deal from lead to paid, across the 13-stage pipeline."
      actions={
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 p-0.5">
            <Link
              href="/opportunities"
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${view === "board" ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:text-slate-700"}`}
            >
              Board
            </Link>
            <Link
              href="/opportunities?view=list"
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${view === "list" ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:text-slate-700"}`}
            >
              List
            </Link>
          </div>
          <Link className="btn-primary" href="/opportunities/new">
            New opportunity
            <Icon name="arrowUpRight" className="h-4 w-4" />
          </Link>
        </div>
      }
    />
  );

  const emptyState = (
    <div className="card">
      <EmptyState
        icon="pipeline"
        title="No opportunities yet"
        description="Create your first opportunity to start moving deals through the pipeline."
        action={
          <Link className="btn-primary" href="/opportunities/new">
            New opportunity
          </Link>
        }
      />
    </div>
  );

  // Board view — unchanged full-pipeline kanban.
  if (view === "board") {
    const opportunities = await loadBoardOpportunities(user.organizationId);
    return (
      <div className="space-y-6">
        {header}
        {opportunities.length === 0 ? emptyState : <Board opportunities={opportunities} role={user.role} />}
      </div>
    );
  }

  // List view — search + sort + pagination.
  const params = parseListParams(searchParams, { sortKeys: SORT_KEYS, defaultSort: "updated" });

  const where: Prisma.OpportunityWhereInput = { organizationId: user.organizationId };
  if (params.hasQuery) {
    where.OR = [{ title: ilike(params.q) }, { summary: ilike(params.q) }, { source: ilike(params.q) }];
  }

  const [total, opportunities] = await Promise.all([
    prisma.opportunity.count({ where }),
    prisma.opportunity.findMany({
      where,
      include: OPP_INCLUDE,
      orderBy: SORT_ORDER[params.sort],
      skip: params.skip,
      take: params.take,
    }),
  ]);

  // No opportunities at all (unfiltered) → global empty state.
  if (total === 0 && !params.hasQuery) {
    return (
      <div className="space-y-6">
        {header}
        {emptyState}
      </div>
    );
  }

  const pages = totalPages(total);
  const pageLink = (page: number) => listQueryString({ view: "list", q: params.q, sort: params.sort, page });

  return (
    <div className="space-y-6">
      {header}

      {/* Search + sort (GET form — no JS required; submitting resets to page 1) */}
      <form method="get" className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="view" value="list" />
        <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-slate-500">
          Search
          <input
            className="input h-9 py-0 text-sm"
            name="q"
            type="search"
            defaultValue={params.q}
            placeholder="Title, summary, or source…"
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
          <Link href="/opportunities?view=list" className="btn-ghost">
            Clear
          </Link>
        ) : null}
      </form>

      {total > 0 ? (
        <>
          <ListTable opportunities={opportunities} />

          {/* Pagination */}
          <div className="flex items-center justify-between text-sm text-slate-500">
            <span>
              {total} opportunit{total === 1 ? "y" : "ies"} · page {params.page} of {pages}
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
      ) : (
        <div className="card">
          <EmptyState
            icon="pipeline"
            title="No opportunities match"
            description={`Nothing matched “${params.q}”. Try a different search or clear it.`}
            action={
              <Link className="btn-primary" href="/opportunities?view=list">
                Clear search
              </Link>
            }
          />
        </div>
      )}
    </div>
  );
}

function Board({ opportunities, role }: { opportunities: OppWithRels[]; role: UserRole }) {
  const byStage = new Map<string, OppWithRels[]>();
  for (const stage of STAGE_ORDER) byStage.set(stage, []);
  for (const opp of opportunities) byStage.get(opp.stage)?.push(opp);

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex gap-4" style={{ minWidth: "min-content" }}>
        {STAGE_ORDER.map((stage) => {
          const items = byStage.get(stage) ?? [];
          const moveableStages = STAGE_OPTIONS.filter(
            (s) => s.value === stage || canMoveStage(role, stage, s.value),
          );
          return (
            <div key={stage} className="flex w-72 shrink-0 flex-col">
              <div className="mb-2 flex items-center justify-between px-1">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{stageLabel(stage)}</p>
                <Badge tone="neutral">{items.length}</Badge>
              </div>
              <div className="flex-1 space-y-2 rounded-xl bg-slate-50/70 p-2">
                {items.map((opp) => (
                  <div key={opp.id} className="card p-3">
                    <Link href={`/opportunities/${opp.id}`} className="block text-sm font-medium text-slate-900 hover:text-brand-700">
                      {opp.title}
                    </Link>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {opp.property.name} · {titleCase(opp.property.assetType)}
                    </p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      {usd(opp.assignmentFeeUsd ?? opp.contractValueUsd) ? (
                        <span className="metric text-xs font-medium text-emerald-600">
                          {usd(opp.assignmentFeeUsd ?? opp.contractValueUsd)}
                        </span>
                      ) : (
                        <span />
                      )}
                      {opp.priority ? <Badge tone={statusTone(opp.priority)}>{opp.priority}</Badge> : null}
                    </div>
                    {moveableStages.length > 1 ? (
                      <div className="mt-2">
                        <StageSelect action={moveOpportunityStage.bind(null, opp.id)} current={opp.stage} stages={moveableStages} className="w-full" />
                      </div>
                    ) : null}
                  </div>
                ))}
                {items.length === 0 ? <p className="px-1 py-4 text-center text-xs text-slate-400">—</p> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ListTable({ opportunities }: { opportunities: OppWithRels[] }) {
  const usdFull = (v: number | null) => (v == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v));
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse">
          <thead className="border-b border-slate-200 bg-slate-50/60">
            <tr>
              <th className="table-head">Opportunity</th>
              <th className="table-head">Stage</th>
              <th className="table-head">Priority</th>
              <th className="table-head">Target close</th>
              <th className="table-head text-right">Contract</th>
              <th className="table-head text-right">Fee</th>
              <th className="table-head">Seller</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {opportunities.map((opp) => (
              <tr key={opp.id} className="transition-colors hover:bg-slate-50/60">
                <td className="table-cell">
                  <Link href={`/opportunities/${opp.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                    {opp.title}
                  </Link>
                  <p className="text-xs text-slate-500">{opp.property.name}</p>
                </td>
                <td className="table-cell whitespace-nowrap">
                  <Badge tone="info" dot>{stageLabel(opp.stage)}</Badge>
                </td>
                <td className="table-cell">{opp.priority ? <Badge tone={statusTone(opp.priority)}>{opp.priority}</Badge> : "—"}</td>
                <td className="table-cell whitespace-nowrap">
                  {opp.targetCloseDate ? opp.targetCloseDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "—"}
                </td>
                <td className="table-cell metric text-right">{usdFull(opp.contractValueUsd)}</td>
                <td className="table-cell metric text-right font-medium text-emerald-600">{usdFull(opp.assignmentFeeUsd)}</td>
                <td className="table-cell whitespace-nowrap text-slate-600">{opp.seller?.name ?? "Unassigned"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
