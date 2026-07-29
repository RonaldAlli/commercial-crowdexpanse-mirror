// CRE Operating Workspace — UI M1 Increment 3: Opportunity Workspace (presentational).
//
// Contract:
//   guarantees — one operating record for an opportunity: Observed identity/seller/property/financials,
//     Computed stage position / diligence / closing-gate / buyer-match counts, Recommended stage
//     suggestedAction, honest display of stage-policy missingTruth/missingArtifacts, the REUSED stage
//     control (existing moveOpportunityStage + evaluateStageMove) and the REUSED transaction timeline,
//     and cross-links only to destinations that already exist.
//   does NOT — fetch data, move stages itself, synthesize Missing Information, add recommendation logic,
//     duplicate the Underwriting/Matching/Deal-Room/Closing workspaces, or wire global navigation.
//   later increments supply — Command Center (4), Next Best Action + Missing Information synthesis (5).

import Link from "next/link";

import { Icon } from "@/components/icons";
import { StageSelect } from "@/components/stage-select";
import { TransactionTimelinePanel } from "@/components/transaction-timeline-panel";
import { PageHeader } from "@/components/workspace-ui/PageHeader";
import { WorkspaceSection } from "@/components/workspace-ui/WorkspaceSection";
import { TaxonomyBadge } from "@/components/workspace-ui/TaxonomyBadge";
import { StateBlock } from "@/components/workspace-ui/StateBlock";
import {
  usd, stagePositionView, diligenceView, closingGateView, type StageReadinessView,
  type DiligenceSummary, type ClosingGate, type StageEval, type CrossLink,
} from "@/lib/workspace-ui/opportunity-view";

type Opp = {
  id: string; title: string; stage: string; source: string | null; priority: string | null;
  targetCloseDate: Date | null; contractValueUsd: number | null; assignmentFeeUsd: number | null;
};

export type OpportunityWorkspaceProps = {
  opportunity: Opp;
  seller: { id: string; name: string; company: string | null; phone: string | null; email: string | null } | null;
  property: { id: string; name: string; addressLine1: string; city: string; state: string } | null;
  diligence: DiligenceSummary;
  gate: ClosingGate;
  stageReadiness: StageReadinessView;
  crossLinks: CrossLink[];
  timeline: import("@/lib/transaction-timeline-service").OpportunityTimeline;
  timelineBasePath: string;
  stageOptions: { value: string; label: string }[];
  stageAction: (formData: FormData) => Promise<{ error?: string } | void>;
  stageEvaluate: (stage: string) => Promise<StageEval | { error: string }>;
};

const OUTCOME_TONE: Record<StageEval["outcome"], string> = {
  ALLOW: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  REQUIRES_ATTESTATION: "bg-amber-50 text-amber-800 ring-amber-200",
  DENY: "bg-rose-50 text-rose-800 ring-rose-200",
};

function fmtDate(d: Date | null): string {
  return d ? new Date(d).toISOString().slice(0, 10) : "—";
}

export function OpportunityWorkspace(p: OpportunityWorkspaceProps) {
  const pos = stagePositionView(p.opportunity.stage);
  const dil = diligenceView(p.diligence);
  const gate = closingGateView(p.gate);
  const r = p.stageReadiness;

  const observed: { label: string; value: string | null }[] = [
    { label: "Source", value: p.opportunity.source },
    { label: "Priority", value: p.opportunity.priority },
    { label: "Target close", value: p.opportunity.targetCloseDate ? fmtDate(p.opportunity.targetCloseDate) : null },
    { label: "Contract value", value: usd(p.opportunity.contractValueUsd) },
    { label: "Assignment fee", value: usd(p.opportunity.assignmentFeeUsd) },
  ];

  return (
    <div className="space-y-5">
      <Link href="/opportunities" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
        <span aria-hidden="true" className="inline-flex rotate-180"><Icon name="chevronRight" className="h-4 w-4" /></span>
        All opportunities
      </Link>

      <PageHeader
        title={p.opportunity.title}
        description={pos.positionLabel}
        actions={<span className="rounded-md bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 ring-1 ring-inset ring-brand-100">{pos.label}</span>}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-5">
          <WorkspaceSection title="Overview" id="opp-overview" actions={<TaxonomyBadge kind="observed" />}>
            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2 py-1 text-sm">
                <dt className="font-medium text-slate-500">Seller</dt>
                <dd className="text-slate-800">
                  {p.seller ? (
                    <Link href={`/seller-queue/${encodeURIComponent(p.seller.id)}`} className="text-brand-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">{p.seller.name}</Link>
                  ) : <span className="italic text-slate-400">No seller linked</span>}
                  {p.seller?.company ? <span className="text-slate-400"> · {p.seller.company}</span> : null}
                </dd>
              </div>
              <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2 py-1 text-sm">
                <dt className="font-medium text-slate-500">Property</dt>
                <dd className="text-slate-800">
                  {p.property ? (
                    <Link href={`/properties/${encodeURIComponent(p.property.id)}`} className="text-brand-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                      {p.property.addressLine1}, {p.property.city} {p.property.state}
                    </Link>
                  ) : <span className="italic text-slate-400">No property</span>}
                </dd>
              </div>
              <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2 py-1 text-sm">
                <dt className="font-medium text-slate-500">Contact</dt>
                <dd className="text-slate-800">{p.seller?.phone || p.seller?.email || <span className="italic text-slate-400">Not provided</span>}</dd>
              </div>
              {observed.map((d) => (
                <div key={d.label} className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2 py-1 text-sm">
                  <dt className="font-medium text-slate-500">{d.label}</dt>
                  <dd className="text-slate-800">{d.value ?? <span className="italic text-slate-400">Not provided</span>}</dd>
                </div>
              ))}
            </dl>
          </WorkspaceSection>

          <WorkspaceSection title="Stage" id="opp-stage" actions={<TaxonomyBadge kind="computed" />}>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-slate-500">{pos.positionLabel}. Change stage:</span>
              <StageSelect action={p.stageAction} evaluate={p.stageEvaluate} current={p.opportunity.stage} stages={p.stageOptions} />
            </div>
            <p className="mt-1 text-xs text-slate-400">Native pipeline stage is authoritative. Moves run through the existing governed stage policy.</p>

            {r.state === "terminal" ? (
              <p className="mt-3 text-sm text-slate-500">This is the final stage — no further stage to advance to.</p>
            ) : r.state === "error" ? (
              <p className="mt-3 text-sm text-rose-700">{r.reason}</p>
            ) : (
              <div className="mt-3 space-y-2 rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                <p className="flex items-center gap-2 text-sm">
                  <span className="font-medium text-slate-600">To advance to {r.targetLabel}:</span>
                  <span className={`rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${OUTCOME_TONE[r.outcome]}`}>{r.outcome === "ALLOW" ? "Ready" : r.outcome === "REQUIRES_ATTESTATION" ? "Attestation required" : "Blocked"}</span>
                </p>
                {r.outcome === "DENY" && r.message ? <p className="text-sm text-rose-700">{r.message}</p> : null}
                {r.missingTruth.length > 0 ? (
                  <div className="text-sm"><p className="font-medium text-slate-600">Missing truth</p><ul className="list-inside list-disc text-slate-600">{r.missingTruth.map((m, i) => <li key={i}>{m}</li>)}</ul></div>
                ) : null}
                {r.missingArtifacts.length > 0 ? (
                  <div className="text-sm"><p className="font-medium text-slate-600">Missing artifacts</p><ul className="list-inside list-disc text-slate-600">{r.missingArtifacts.map((m, i) => <li key={i}>{m}</li>)}</ul></div>
                ) : null}
                {r.suggestedAction ? (
                  <p className="flex items-center gap-2 text-sm text-slate-700"><TaxonomyBadge kind="recommended" /> {r.suggestedAction}</p>
                ) : null}
              </div>
            )}
          </WorkspaceSection>

          <TransactionTimelinePanel timeline={p.timeline} basePath={p.timelineBasePath} />
        </div>

        <aside className="space-y-5">
          <WorkspaceSection title="Diligence" id="opp-diligence" actions={<TaxonomyBadge kind="computed" />}>
            <p className="text-sm text-slate-800">{dil.ratioLabel}</p>
            <p className="mt-1 text-xs text-slate-500">{dil.readyForUnderwriting ? "Ready for underwriting" : "Not yet ready for underwriting"}</p>
          </WorkspaceSection>

          <WorkspaceSection title="Closing gate" id="opp-closing" actions={<TaxonomyBadge kind="computed" />}>
            <p className="flex items-center gap-2 text-sm">
              <span aria-hidden="true" className="inline-flex"><Icon name={gate.ready ? "check" : "close"} className={`h-4 w-4 ${gate.ready ? "text-emerald-600" : "text-slate-400"}`} /></span>
              <span className={gate.ready ? "text-emerald-700" : "text-slate-700"}>{gate.statusLabel}</span>
            </p>
            {gate.blockerLabels.length > 0 ? (
              <ul className="mt-1 list-inside list-disc text-xs text-slate-500">{gate.blockerLabels.slice(0, 5).map((b, i) => <li key={i}>{b}</li>)}</ul>
            ) : null}
            <Link href="/closing" className="mt-2 inline-block text-xs font-medium text-brand-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">Open closing dashboard →</Link>
          </WorkspaceSection>

          <WorkspaceSection title="Related records" id="opp-links">
            {p.crossLinks.length === 0 ? (
              <StateBlock state="empty" message="No related records yet" />
            ) : (
              <ul className="space-y-1">
                {p.crossLinks.map((c) => (
                  <li key={c.label}>
                    {c.available ? (
                      <Link href={c.href} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                        <span>{c.label}</span>
                        <span className="text-xs text-slate-400">{c.detail} <span aria-hidden="true">→</span></span>
                      </Link>
                    ) : (
                      <span className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm text-slate-400" aria-disabled="true">
                        <span>{c.label}</span>
                        <span className="text-xs">{c.detail}<span className="sr-only"> — none available</span></span>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </WorkspaceSection>
        </aside>
      </div>
    </div>
  );
}
