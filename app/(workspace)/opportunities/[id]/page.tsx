import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { NotesSection } from "@/components/notes-section";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { StageSelect } from "@/components/stage-select";
import { Badge, statusTone } from "@/components/ui/badge";
import { GenerateMatchesButton, MatchRowControls } from "@/components/match-controls";
import { requireUser } from "@/lib/auth";
import { can, canMoveStage } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { matchStatusLabel, matchStatusTone } from "@/lib/match-options";
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

  const matches = await prisma.buyerMatch.findMany({
    where: { opportunityId: opportunity.id, organizationId: user.organizationId },
    include: { buyer: { select: { id: true, name: true, company: true } } },
    orderBy: [{ score: "desc" }, { createdAt: "desc" }],
  });

  const terms: { label: string; value: string | null }[] = [
    { label: "Source", value: opportunity.source },
    { label: "Priority", value: opportunity.priority },
    { label: "Target close", value: opportunity.targetCloseDate ? opportunity.targetCloseDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : null },
    { label: "Contract value", value: usd(opportunity.contractValueUsd) },
    { label: "Assignment fee", value: usd(opportunity.assignmentFeeUsd) },
  ];

  const deleteOpportunityBound = deleteOpportunity.bind(null, opportunity.id);

  // Only the stages this role may move to from the current stage (plus the
  // current stage itself, which stays selected). Server re-checks on submit.
  const moveableStages = STAGE_OPTIONS.filter(
    (s) => s.value === opportunity.stage || canMoveStage(user.role, opportunity.stage, s.value),
  );
  const canRemoveMatch = can(user.role, "DELETE", "BUYER_MATCH");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Opportunity"
        title={opportunity.title}
        description={`${opportunity.property.name} · ${titleCase(opportunity.property.assetType)}`}
        actions={
          <>
            {can(user.role, "UPDATE", "OPPORTUNITY") ? (
              <Link className="btn-ghost" href={`/opportunities/${opportunity.id}/edit`}>
                <Icon name="notes" className="h-4 w-4" />
                Edit
              </Link>
            ) : null}
            {can(user.role, "DELETE", "OPPORTUNITY") ? (
              <form action={deleteOpportunityBound}>
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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <p className="eyebrow">Stage</p>
                <Badge tone="info" dot>{stageLabel(opportunity.stage)}</Badge>
              </div>
              {moveableStages.length > 1 ? (
                <StageSelect action={moveOpportunityStage.bind(null, opportunity.id)} current={opportunity.stage} stages={moveableStages} />
              ) : null}
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

      <article className="card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Buyer Matches</h2>
            <p className="text-xs text-slate-500">
              Deterministic fit across asset type, location, and price. {matches.length > 0 ? `${matches.length} match${matches.length === 1 ? "" : "es"}.` : null}
            </p>
          </div>
          <GenerateMatchesButton opportunityId={opportunity.id} />
        </div>
        {matches.length > 0 ? (
          <ul className="divide-y divide-slate-100">
            {matches.map((m) => (
              <li key={m.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/buyers/${m.buyer.id}`} className="text-sm font-medium text-brand-700 hover:underline">
                        {m.buyer.name}
                      </Link>
                      {m.buyer.company ? <span className="text-xs text-slate-400">{m.buyer.company}</span> : null}
                      <Badge tone={matchStatusTone(m.status)}>{matchStatusLabel(m.status)}</Badge>
                    </div>
                    {m.thesis ? <p className="mt-1 text-xs leading-relaxed text-slate-500">{m.thesis}</p> : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <div className="flex items-baseline gap-1">
                      <span className="metric text-lg font-semibold text-slate-900">{m.score ?? "—"}</span>
                      <span className="text-xs text-slate-400">/100</span>
                    </div>
                    <MatchRowControls matchId={m.id} current={m.status} canRemove={canRemoveMatch} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon="buyers"
            title="No buyer matches yet"
            description="Run “Find matching buyers” to score buyers in your organization against this opportunity."
          />
        )}
      </article>

      <NotesSection organizationId={user.organizationId} type="opportunity" id={opportunity.id} />
    </div>
  );
}
