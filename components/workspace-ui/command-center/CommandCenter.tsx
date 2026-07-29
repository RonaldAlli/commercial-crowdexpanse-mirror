// CRE Operating Workspace — UI M1 Increment 4: Command Center (presentational).
//
// Contract:
//   guarantees — a read-only landing work-board that orchestrates EXISTING facts into sections: Today's
//     acquisition metrics + all-time revenue (each tagged Observed/Computed with a time basis), sellers
//     due for follow-up (acquisition-queue order preserved), opportunities needing attention and recent
//     opportunities (deterministic order), each deep-linking to the accepted Seller/Opportunity routes;
//     honest empty and "not yet available" states; sections omitted where the role cannot access them.
//   does NOT — fetch data, become a new business-truth layer, invent a priority/motivation score, choose
//     a Next Best Action, synthesize Missing Information, build alternate opportunity-detail summaries, or
//     mutate anything.
//   later increments supply — Next Best Action + Missing Information synthesis (Increment 5).

import Link from "next/link";

import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/workspace-ui/PageHeader";
import { WorkspaceSection } from "@/components/workspace-ui/WorkspaceSection";
import { TaxonomyBadge } from "@/components/workspace-ui/TaxonomyBadge";
import { StateBlock } from "@/components/workspace-ui/StateBlock";
import type { QueueRowView } from "@/lib/workspace-ui/seller-view";
import {
  RECENT_OPPORTUNITY_SECTION_LABEL, UNAVAILABLE_CAPABILITIES,
  type MetricView, type TransactionRowView, type RecentOppView,
} from "@/lib/workspace-ui/command-center";

export type CommandCenterProps = {
  metrics: MetricView[];
  sellers: { visible: boolean; rows: QueueRowView[] };
  attention: { visible: boolean; rows: TransactionRowView[] };
  recent: { visible: boolean; rows: RecentOppView[] };
};

const URGENCY_TONE: Record<QueueRowView["followUp"]["urgency"], string> = {
  overdue: "text-rose-700",
  "due-today": "text-amber-700",
  scheduled: "text-slate-500",
  none: "text-slate-400",
};

function MetricCard({ m }: { m: MetricView }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-500">{m.label}</p>
        <TaxonomyBadge kind={m.kind} />
      </div>
      <p className="mt-0.5 text-lg font-semibold text-slate-900">{m.value}</p>
      <p className="text-[0.68rem] uppercase tracking-wide text-slate-400">{m.basis}</p>
    </div>
  );
}

export function CommandCenter(p: CommandCenterProps) {
  return (
    <div className="space-y-6">
      <PageHeader title="Command Center" description="What needs attention today — a read-only view over existing records." />

      <WorkspaceSection title="Metrics" id="cc-metrics" actions={<span className="text-xs text-slate-400">Each figure states its time basis</span>}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {p.metrics.map((m) => (
            <MetricCard key={m.label + m.basis} m={m} />
          ))}
        </div>
      </WorkspaceSection>

      {p.sellers.visible ? (
        <WorkspaceSection
          title="Follow-ups due"
          id="cc-sellers"
          actions={<Link href="/seller-queue" className="text-xs font-medium text-brand-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">Open queue →</Link>}
        >
          {p.sellers.rows.length === 0 ? (
            <StateBlock state="empty" message="No sellers are due for follow-up" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {p.sellers.rows.map((row) => (
                <li key={row.id}>
                  <Link href={row.href} className="flex items-center gap-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{row.name}</span>
                    <span className="hidden text-xs text-slate-500 sm:inline">{row.status.label}</span>
                    <span className={`text-xs font-medium ${URGENCY_TONE[row.followUp.urgency]}`}>{row.followUp.label}</span>
                    <span aria-hidden="true" className="inline-flex text-slate-300"><Icon name="chevronRight" className="h-4 w-4" /></span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </WorkspaceSection>
      ) : null}

      {p.attention.visible ? (
        <WorkspaceSection title="Opportunities needing attention" id="cc-attention" actions={<Link href="/closing" className="text-xs font-medium text-brand-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">Closing dashboard →</Link>}>
          {p.attention.rows.length === 0 ? (
            <StateBlock state="empty" message="No in-flight opportunities need attention" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {p.attention.rows.map((row) => (
                <li key={row.opportunityId}>
                  <Link href={row.href} className="flex items-center gap-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-800">{row.title}</span>
                      <span className="block truncate text-xs text-slate-400">{row.propertyName} · {row.stageLabel}</span>
                    </span>
                    {row.blockerCount > 0 ? <span className="text-xs font-medium text-rose-700">{row.blockerCount} blocker{row.blockerCount === 1 ? "" : "s"}</span> : null}
                    {row.milestoneLabel ? <span className={`text-xs font-medium ${row.overdue ? "text-rose-700" : "text-slate-500"}`}>{row.overdue ? "Overdue: " : ""}{row.milestoneLabel}</span> : null}
                    <span aria-hidden="true" className="inline-flex text-slate-300"><Icon name="chevronRight" className="h-4 w-4" /></span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </WorkspaceSection>
      ) : null}

      {p.recent.visible ? (
        <WorkspaceSection title={RECENT_OPPORTUNITY_SECTION_LABEL} id="cc-recent">
          {p.recent.rows.length === 0 ? (
            <StateBlock state="empty" message="No opportunities yet" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {p.recent.rows.map((row) => (
                <li key={row.id}>
                  <Link href={row.href} className="flex items-center gap-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{row.title}</span>
                    <span className="text-xs text-slate-500">{row.stageLabel}</span>
                    <span aria-hidden="true" className="inline-flex text-slate-300"><Icon name="chevronRight" className="h-4 w-4" /></span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </WorkspaceSection>
      ) : null}

      <WorkspaceSection title="Not yet available" id="cc-unavailable">
        <StateBlock state="unavailable" message={`${UNAVAILABLE_CAPABILITIES.join(" · ")} are not available yet`} />
      </WorkspaceSection>
    </div>
  );
}
