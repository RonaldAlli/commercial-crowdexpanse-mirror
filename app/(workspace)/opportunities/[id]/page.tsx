import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { NotesSection } from "@/components/notes-section";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { StageSelect } from "@/components/stage-select";
import { Badge, statusTone } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { STAGE_OPTIONS, stageLabel } from "@/lib/opportunity-options";
import { titleCase } from "@/lib/property-options";

import { deleteOpportunity, moveOpportunityStage } from "../actions";

export const dynamic = "force-dynamic";

function usd(value: number | null) {
  return value == null ? null : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

export default async function OpportunityDetailPage({ params }: { params: { id: string } }) {
  const user = await requireUser();

  const opportunity = await prisma.opportunity.findFirst({
    where: { id: params.id, organizationId: user.organizationId },
    include: {
      property: { select: { id: true, name: true, city: true, state: true, assetType: true } },
      seller: { select: { id: true, name: true } },
      activities: { orderBy: { createdAt: "desc" }, take: 12 },
    },
  });

  if (!opportunity) {
    notFound();
  }

  const terms: { label: string; value: string | null }[] = [
    { label: "Source", value: opportunity.source },
    { label: "Priority", value: opportunity.priority },
    { label: "Target close", value: opportunity.targetCloseDate ? opportunity.targetCloseDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : null },
    { label: "Contract value", value: usd(opportunity.contractValueUsd) },
    { label: "Assignment fee", value: usd(opportunity.assignmentFeeUsd) },
  ];

  const deleteOpportunityBound = deleteOpportunity.bind(null, opportunity.id);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Opportunity"
        title={opportunity.title}
        description={`${opportunity.property.name} · ${titleCase(opportunity.property.assetType)}`}
        actions={
          <>
            <Link className="btn-ghost" href={`/opportunities/${opportunity.id}/edit`}>
              <Icon name="notes" className="h-4 w-4" />
              Edit
            </Link>
            <form action={deleteOpportunityBound}>
              <button type="submit" className="btn border border-rose-200 bg-white text-rose-600 hover:bg-rose-50">
                Delete
              </button>
            </form>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <article className="card p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <p className="eyebrow">Stage</p>
                <Badge tone="info" dot>{stageLabel(opportunity.stage)}</Badge>
              </div>
              <StageSelect action={moveOpportunityStage.bind(null, opportunity.id)} current={opportunity.stage} stages={STAGE_OPTIONS} />
            </div>
            <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {terms.map((t) => (
                <div key={t.label}>
                  <dt className="text-xs text-slate-500">{t.label}</dt>
                  <dd className="metric mt-0.5 text-sm font-medium text-slate-900">
                    {t.label === "Priority" && t.value ? <Badge tone={statusTone(t.value)}>{t.value}</Badge> : (t.value ?? "—")}
                  </dd>
                </div>
              ))}
            </dl>
            {opportunity.summary ? (
              <div className="mt-6 border-t border-slate-100 pt-5">
                <p className="eyebrow">Summary</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{opportunity.summary}</p>
              </div>
            ) : null}
          </article>
        </div>

        <div className="space-y-6 lg:col-span-1">
          <article className="card p-6">
            <p className="eyebrow">Links</p>
            <div className="mt-4 space-y-3">
              <div>
                <p className="text-xs text-slate-500">Property</p>
                <Link href={`/properties/${opportunity.property.id}`} className="mt-0.5 block text-sm font-medium text-brand-700 hover:underline">
                  {opportunity.property.name}
                </Link>
                <p className="text-xs text-slate-400">{[opportunity.property.city, opportunity.property.state].filter(Boolean).join(", ")}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Seller</p>
                {opportunity.seller ? (
                  <Link href={`/sellers/${opportunity.seller.id}`} className="mt-0.5 block text-sm font-medium text-brand-700 hover:underline">
                    {opportunity.seller.name}
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
            {opportunity.activities.length > 0 ? (
              <ul className="px-5 py-2">
                {opportunity.activities.map((entry, i) => (
                  <li key={entry.id} className="flex gap-4 py-3">
                    <div className="flex flex-col items-center">
                      <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-brand-500 ring-4 ring-brand-50" />
                      {i < opportunity.activities.length - 1 ? <span className="mt-1 w-px flex-1 bg-slate-200" /> : null}
                    </div>
                    <div className="min-w-0 pb-1">
                      <p className="text-sm font-medium text-slate-900">{entry.eventLabel}</p>
                      {entry.eventBody ? <p className="mt-0.5 text-xs text-slate-500">{entry.eventBody}</p> : null}
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

      <NotesSection organizationId={user.organizationId} type="opportunity" id={opportunity.id} />
    </div>
  );
}
