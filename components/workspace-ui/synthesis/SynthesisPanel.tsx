// CRE Operating Workspace — UI M1 Increment 5: Next Best Action + Missing Information panel.
//
// Contract:
//   guarantees — renders a deterministic Synthesis (from lib/workspace-ui/synthesis) through the accepted
//     Increment-1 primitives: the Next Best Action as an Evidence Chain (recommendation → supporting →
//     missing → confidence → next action), a categorical confidence chip, an explicit "why competing
//     recommendations were not selected" list, and the four-state Missing Information list (each item with
//     why / source / resolution). A recommendation never appears without its evidence; uncertainty is
//     visible ("Review Required" / "Not Yet Scored").
//   does NOT — compute the synthesis (that is the pure engine), fetch data, mutate anything, override any
//     governed workflow, or fabricate a numeric confidence.
//   later increments supply — nothing further for Milestone 1; browser-level a11y verification is Inc 6.

import { WorkspaceSection } from "@/components/workspace-ui/WorkspaceSection";
import { TaxonomyBadge } from "@/components/workspace-ui/TaxonomyBadge";
import { EvidenceChain } from "@/components/workspace-ui/EvidenceChain";
import { MissingInfoBadge } from "@/components/workspace-ui/MissingInfoBadge";
import { StateBlock } from "@/components/workspace-ui/StateBlock";
import type { Synthesis, ConfidenceCategory } from "@/lib/workspace-ui/synthesis";

const CONFIDENCE_TONE: Record<ConfidenceCategory, string> = {
  High: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  Medium: "bg-brand-50 text-brand-700 ring-brand-100",
  Low: "bg-amber-50 text-amber-800 ring-amber-200",
  "Review Required": "bg-amber-50 text-amber-900 ring-amber-300",
  "Not Yet Scored": "bg-slate-100 text-slate-600 ring-slate-200",
};

export function SynthesisPanel({ synthesis, idPrefix }: { synthesis: Synthesis; idPrefix: string }) {
  const nba = synthesis.nextBestAction;
  const chainHeadingId = `${idPrefix}-nba-heading`;

  return (
    <div className="space-y-4">
      <WorkspaceSection
        title="Next best action"
        id={`${idPrefix}-nba`}
        actions={
          <span className={`rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${CONFIDENCE_TONE[nba.confidence]}`}>
            Confidence: {nba.confidence}
            <span className="sr-only"> (categorical — never a numeric score)</span>
          </span>
        }
      >
        <div className="mb-2 flex items-center gap-2">
          <TaxonomyBadge kind="recommended" />
          <span id={chainHeadingId} className="text-sm font-medium text-slate-900">
            {nba.recommendation ?? "No recommendation available"}
          </span>
        </div>

        <EvidenceChain chain={nba.chain} headingId={chainHeadingId} />

        {nba.competingRejected.length > 0 ? (
          <div className="mt-3 border-t border-slate-100 pt-2">
            <p className="text-xs font-medium text-slate-500">Why not the alternatives</p>
            <ul className="mt-1 space-y-0.5 text-xs text-slate-500">
              {nba.competingRejected.map((c, i) => (
                <li key={i}>
                  <span className="text-slate-700">{c.candidate}</span> — {c.reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </WorkspaceSection>

      <WorkspaceSection title="Missing information" id={`${idPrefix}-missing`}>
        {synthesis.missingInformation.length === 0 ? (
          <StateBlock state="empty" message="No missing information" />
        ) : (
          <ul className="space-y-2">
            {synthesis.missingInformation.map((m, i) => (
              <li key={i} className="flex flex-col gap-1 border-b border-slate-100 pb-2 last:border-0 last:pb-0 sm:flex-row sm:items-start sm:gap-3">
                <MissingInfoBadge state={m.state} className="shrink-0" />
                <div className="min-w-0 text-sm">
                  <p className="font-medium text-slate-800">{m.label}</p>
                  <p className="text-xs text-slate-500">{m.why} · <span className="text-slate-400">source: {m.source}</span></p>
                  <p className="text-xs text-slate-600">Resolve: {m.resolution}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </WorkspaceSection>
    </div>
  );
}
