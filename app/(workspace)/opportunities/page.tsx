import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { StageSelect } from "@/components/stage-select";
import { Badge, statusTone } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { STAGE_OPTIONS, STAGE_ORDER, stageLabel } from "@/lib/opportunity-options";
import { titleCase } from "@/lib/property-options";

import { moveOpportunityStage } from "./actions";

export const dynamic = "force-dynamic";

function usd(value: number | null) {
  return value == null ? null : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 1, notation: "compact" }).format(value);
}

type OppWithRels = Awaited<ReturnType<typeof loadOpportunities>>[number];

async function loadOpportunities(organizationId: string) {
  return prisma.opportunity.findMany({
    where: { organizationId },
    include: {
      property: { select: { name: true, city: true, state: true, assetType: true } },
      seller: { select: { name: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: { view?: string };
}) {
  const user = await requireUser();
  const opportunities = await loadOpportunities(user.organizationId);
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

  if (opportunities.length === 0) {
    return (
      <div className="space-y-6">
        {header}
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
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}
      {view === "board" ? (
        <Board opportunities={opportunities} />
      ) : (
        <ListTable opportunities={opportunities} />
      )}
    </div>
  );
}

function Board({ opportunities }: { opportunities: OppWithRels[] }) {
  const byStage = new Map<string, OppWithRels[]>();
  for (const stage of STAGE_ORDER) byStage.set(stage, []);
  for (const opp of opportunities) byStage.get(opp.stage)?.push(opp);

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex gap-4" style={{ minWidth: "min-content" }}>
        {STAGE_ORDER.map((stage) => {
          const items = byStage.get(stage) ?? [];
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
                    <div className="mt-2">
                      <StageSelect action={moveOpportunityStage.bind(null, opp.id)} current={opp.stage} stages={STAGE_OPTIONS} className="w-full" />
                    </div>
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
