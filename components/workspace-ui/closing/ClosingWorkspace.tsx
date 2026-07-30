// CRE Operating Workspace — Closing Workspace, Increment 1: Executive Closing Summary view.
//
// Presentational + READ-ONLY. Answers "Can this transaction close?" — the verdict FIRST, then four visually
// distinct domain panels (Checklist / Escrow / Financing / Assignment — Domain Progression), then the existing
// primary blockers, then a prominent deep-link to the Closing Console (/opportunities/[id]) which remains the
// authoritative execution surface. It renders no editing controls and performs no closing mutations.

import Link from "next/link";

import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/workspace-ui/PageHeader";
import { WorkspaceSection } from "@/components/workspace-ui/WorkspaceSection";
import { TaxonomyBadge } from "@/components/workspace-ui/TaxonomyBadge";
import type { ClosingWorkspaceView, DomainView } from "@/lib/workspace-ui/closing-workspace";
import type { ClosingBlockersView, OwnerGroupView, BlockerItemView } from "@/lib/workspace-ui/closing-blockers";
import { TransactionTimelinePanel } from "@/components/transaction-timeline-panel";
import type { OpportunityTimeline } from "@/lib/transaction-timeline-service";

const STATE_TONE: Record<DomainView["state"], string> = {
  resolved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  "in-progress": "bg-amber-50 text-amber-800 ring-amber-200",
  "not-started": "bg-slate-100 text-slate-600 ring-slate-200",
};

function ConsoleLink({ opportunityId }: { opportunityId: string }) {
  return (
    <Link
      href={`/opportunities/${opportunityId}`}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    >
      <Icon name="check" className="h-4 w-4 text-slate-400" aria-hidden="true" />
      <span>Open Closing Console</span>
    </Link>
  );
}

function DomainPanel({ d }: { d: DomainView }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4" aria-labelledby={`closing-domain-${d.key}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 id={`closing-domain-${d.key}`} className="text-sm font-semibold text-slate-900">{d.title}</h3>
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${STATE_TONE[d.state]}`}>
          {d.stateLabel}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-600 break-words">{d.statusLabel}</p>
    </div>
  );
}

function BlockerRow({ item }: { item: BlockerItemView }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-1.5">
      <span className="text-sm font-medium text-slate-900 break-words">{item.title}</span>
      <span className="text-xs text-slate-500">· {item.statusLabel}</span>
      <span className="text-[0.7rem] font-medium uppercase tracking-wide text-slate-400">· {item.domain}</span>
      {item.dueDate ? <span className="text-xs text-slate-500">· due {item.dueDate.slice(0, 10)}</span> : null}
    </li>
  );
}

function OwnerGroup({ group }: { group: OwnerGroupView }) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2">
      <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
        {group.ownerLabel}
        {!group.ownerResolved ? (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.7rem] font-medium text-slate-500">unassigned / unresolved</span>
        ) : null}
        <span className="text-xs font-normal text-slate-400">· {group.items.length} blocker{group.items.length === 1 ? "" : "s"}</span>
      </p>
      <ul className="mt-1 divide-y divide-slate-100">
        {group.items.map((it, i) => <BlockerRow key={i} item={it} />)}
      </ul>
    </div>
  );
}

export function ClosingWorkspace({
  view,
  blockersDetail,
  timeline,
  timelineBasePath,
  opportunityId,
  opportunityName,
}: {
  view: ClosingWorkspaceView;
  /** Increment 2: owner-grouped blocker detail + next milestone. Optional so Increment 1 rendering is unchanged. */
  blockersDetail?: ClosingBlockersView;
  /** Increment 3: closing history — the existing transaction timeline, reused verbatim. Optional/additive. */
  timeline?: OpportunityTimeline;
  timelineBasePath?: string;
  opportunityId: string;
  opportunityName: string;
}) {
  const { verdict, readiness, domains, blockers } = view;

  return (
    <div>
      <PageHeader
        title="Closing"
        description={`${opportunityName} — can this transaction close?`}
        actions={<ConsoleLink opportunityId={opportunityId} />}
      />

      <div className="space-y-4">
        {/* Executive Closing Summary — the operator's answer FIRST. */}
        <WorkspaceSection title="Executive closing summary" id="closing-summary" actions={<TaxonomyBadge kind="recommended" />}>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className={`inline-flex items-center rounded-lg px-3 py-1.5 text-base font-semibold ring-1 ${verdict.toneClass}`}>
                Closeable: {verdict.label}
              </span>
              <span className="sr-only">{verdict.srLabel}</span>
              {readiness ? (
                <span className="text-sm text-slate-600">
                  Checklist: <span className="font-medium text-slate-900">{readiness.requiredSatisfied}/{readiness.requiredTotal}</span> required complete
                </span>
              ) : null}
            </div>
            {verdict.explanation ? <p className="text-sm text-slate-600 break-words">{verdict.explanation}</p> : null}
          </div>
        </WorkspaceSection>

        {/* Domain readiness — four visually distinct domains (Domain Progression). */}
        <WorkspaceSection title="Domain readiness" id="closing-domains" actions={<TaxonomyBadge kind="observed" />}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {domains.map((d) => <DomainPanel key={d.key} d={d} />)}
          </div>
        </WorkspaceSection>

        {/* Primary blockers — existing only, persisted order, never reprioritized. Increment 2 enriches this
            with owner grouping (who owns each) + due dates + originating domain; falls back to the flat list. */}
        <WorkspaceSection title="Primary blockers" id="closing-blockers" actions={<TaxonomyBadge kind="observed" />}>
          {blockersDetail ? (
            !blockersDetail.hasBlockers ? (
              <p className="text-sm italic text-slate-400">No outstanding blockers.</p>
            ) : (
              <div className="space-y-4">
                {blockersDetail.ownerGroups.length > 0 ? (
                  <div>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Checklist — by owner</h3>
                    <div className="space-y-2">
                      {blockersDetail.ownerGroups.map((g, i) => <OwnerGroup key={i} group={g} />)}
                    </div>
                  </div>
                ) : null}
                {blockersDetail.domainBlockers.length > 0 ? (
                  <div>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Operational domains outstanding</h3>
                    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 px-3">
                      {blockersDetail.domainBlockers.map((it, i) => <BlockerRow key={i} item={it} />)}
                    </ul>
                  </div>
                ) : null}
              </div>
            )
          ) : blockers.length === 0 ? (
            <p className="text-sm italic text-slate-400">No outstanding blockers.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {blockers.map((b, i) => <li key={i} className="py-2 text-sm text-slate-700 break-words">{b}</li>)}
            </ul>
          )}
        </WorkspaceSection>

        {/* What happens next? — the existing next-milestone selection (Increment 2). */}
        {blockersDetail ? (
          <WorkspaceSection title="What happens next?" id="closing-next" actions={<TaxonomyBadge kind="observed" />}>
            {blockersDetail.nextMilestone ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium text-slate-900 break-words">{blockersDetail.nextMilestone.label}</span>
                <span className="text-sm text-slate-500">· {blockersDetail.nextMilestone.date}</span>
                {blockersDetail.nextMilestone.overdueLabel ? (
                  <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200">
                    {blockersDetail.nextMilestone.overdueLabel}
                  </span>
                ) : null}
              </div>
            ) : (
              <p className="text-sm italic text-slate-400">No upcoming milestone recorded.</p>
            )}
            <p className="mt-4 text-xs text-slate-400">
              Closing work — completing items, resolving escrow / financing / assignment, assigning owners and
              due dates — happens in the{" "}
              <Link href={`/opportunities/${opportunityId}`} className="font-medium text-brand-600 underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                Closing Console
              </Link>
              . This workspace is read-only.
            </p>
          </WorkspaceSection>
        ) : null}

        {/* What has happened so far? — Increment 3: the EXISTING transaction timeline, reused verbatim
            (chronological, actor-resolved, evidence-referenced). Placed AFTER current-state + next-step.
            A plain section heading frames it in operator terms; the reused panel keeps its own card. */}
        {timeline && timelineBasePath ? (
          <section aria-labelledby="closing-history-heading" className="space-y-2">
            <h2 id="closing-history-heading" className="text-sm font-semibold text-slate-900">What has happened so far?</h2>
            <TransactionTimelinePanel timeline={timeline} basePath={timelineBasePath} />
          </section>
        ) : null}
      </div>
    </div>
  );
}
