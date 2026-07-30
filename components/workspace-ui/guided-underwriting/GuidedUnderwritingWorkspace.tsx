// CRE Operating Workspace — UI Milestone 2, Increment 1: Guided Underwriting workspace view.
//
// Presentational + READ-ONLY. Answers "Can we structure this deal?" by LEADING with an Executive
// Structurability Summary, then supporting metrics, then the observed scenario context. Reuses the M1
// presentation primitives. It renders ONLY already-persisted underwriting outputs (via the pure
// buildGuidedUnderwritingView view-model); it never edits, recomputes, synthesizes, or exposes decision
// history. A prominent "Advanced analysis" deep-link hands off to /analyzer/[opportunityId], which remains
// the authoritative advanced underwriting workspace — this view never duplicates its editing capabilities.

import Link from "next/link";

import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/workspace-ui/PageHeader";
import { WorkspaceSection } from "@/components/workspace-ui/WorkspaceSection";
import { StateBlock } from "@/components/workspace-ui/StateBlock";
import { TaxonomyBadge } from "@/components/workspace-ui/TaxonomyBadge";
import type { GuidedUnderwritingView } from "@/lib/workspace-ui/guided-underwriting";

function AdvancedAnalysisLink({ opportunityId }: { opportunityId: string }) {
  return (
    <Link
      href={`/analyzer/${opportunityId}`}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    >
      <Icon name="analyzer" className="h-4 w-4 text-slate-400" aria-hidden="true" />
      <span>Advanced analysis</span>
    </Link>
  );
}

export function GuidedUnderwritingWorkspace({
  view,
  opportunityId,
  opportunityName,
}: {
  view: GuidedUnderwritingView;
  opportunityId: string;
  opportunityName: string;
}) {
  return (
    <div>
      <PageHeader
        title="Guided Underwriting"
        description={`${opportunityName} — can we structure this deal?`}
        actions={<AdvancedAnalysisLink opportunityId={opportunityId} />}
      />

      {view.state === "no-underwriting" ? (
        <WorkspaceSection title="Structurability" id="structurability">
          <StateBlock
            state="empty"
            message="Underwriting has not yet been started for this opportunity."
          />
          <p className="mt-3 text-sm text-slate-500">
            No active underwriting scenario exists yet. Start advanced analysis to build one.
          </p>
        </WorkspaceSection>
      ) : (
        <div className="space-y-4">
          {/* Executive Structurability Summary — the operator's answer FIRST. */}
          <WorkspaceSection title="Structurability summary" id="structurability" actions={<TaxonomyBadge kind="recommended" />}>
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <span
                  className={`inline-flex items-center rounded-lg px-3 py-1.5 text-base font-semibold ring-1 ${view.structurability.toneClass}`}
                >
                  Structurable: {view.structurability.label}
                </span>
                <span className="sr-only">{view.structurability.srLabel}</span>
                {view.structurability.recommendation ? (
                  <span className="text-sm text-slate-600">
                    Engine recommendation: <span className="font-medium text-slate-900">{view.structurability.recommendation}</span>
                  </span>
                ) : (
                  <span className="text-sm italic text-slate-400">No engine recommendation available</span>
                )}
              </div>

              {view.primaryConstraint ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                    Primary constraint · {view.primaryConstraint.severityLabel}
                  </p>
                  <p className="mt-0.5 text-sm font-medium text-slate-900">{view.primaryConstraint.title}</p>
                  <p className="text-sm text-slate-600">{view.primaryConstraint.detail}</p>
                </div>
              ) : (
                <p className="text-sm text-slate-500">No decisive constraint identified.</p>
              )}
            </div>
          </WorkspaceSection>

          {/* Supporting metrics — beneath the summary. */}
          <WorkspaceSection title="Supporting metrics" id="metrics" actions={<TaxonomyBadge kind="computed" />}>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              {view.metrics.map((m) => (
                <div key={m.label} className="flex flex-col">
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{m.label}</dt>
                  <dd className={m.available ? "text-sm font-semibold text-slate-900" : "text-sm italic text-slate-400"}>
                    {m.value}
                  </dd>
                </div>
              ))}
            </dl>
          </WorkspaceSection>

          {/* Observed scenario context. */}
          <WorkspaceSection title="Scenario" id="scenario" actions={<TaxonomyBadge kind="observed" />}>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="flex flex-col">
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Property</dt>
                <dd className="text-sm text-slate-900">{view.observed.property}</dd>
              </div>
              <div className="flex flex-col">
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Scenario</dt>
                <dd className="text-sm text-slate-900">{view.observed.scenarioLabel} · {view.observed.version}</dd>
              </div>
              <div className="flex flex-col">
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Status</dt>
                <dd className="text-sm text-slate-900">{view.observed.status}</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-slate-400">
              For assumptions, financing detail, scenario editing, and comparison, use{" "}
              <Link href={`/analyzer/${opportunityId}`} className="font-medium text-brand-600 underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                Advanced analysis
              </Link>
              .
            </p>
          </WorkspaceSection>
        </div>
      )}
    </div>
  );
}
