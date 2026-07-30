// CRE Operating Workspace — UI Milestone 2, Increment 3: Decision Contrast + Approval History panel.
//
// Presentational + READ-ONLY. Answers "Why does the engine recommend this, and what decision history already
// exists?" beneath the (unchanged) Executive Structurability Summary and the missing-information section. It
// renders ONLY persisted records — the engine recommendation, the findings behind it (in persisted order),
// and the human decision history with a factual Agreement / Override / Awaiting-decision status. There are NO
// approval controls, NO write actions, and findings are not reinterpreted. Editing lives in /analyzer.

import { WorkspaceSection } from "@/components/workspace-ui/WorkspaceSection";
import { TaxonomyBadge } from "@/components/workspace-ui/TaxonomyBadge";
import type { GuidedDecisionView } from "@/lib/workspace-ui/guided-underwriting-decision";

export function DecisionContrastPanel({ decision }: { decision: GuidedDecisionView }) {
  if (decision.state === "no-underwriting") return null;
  const { engineRecommendation, contrast, findings, decisions } = decision;

  return (
    <>
      {/* Why is this recommended? — engine recommendation + the persisted findings behind it. */}
      <WorkspaceSection title="Why is this recommended?" id="why-recommended" actions={<TaxonomyBadge kind="recommended" />}>
        <p className="text-sm text-slate-700">
          Engine recommendation:{" "}
          {engineRecommendation.label ? (
            <span className="font-medium text-slate-900">{engineRecommendation.label}</span>
          ) : (
            <span className="italic text-slate-400">None recorded yet</span>
          )}
        </p>
        {findings.length === 0 ? (
          <p className="mt-3 text-sm italic text-slate-400">No findings recorded.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {findings.map((f, i) => (
              <li key={i} className="flex flex-col gap-0.5 py-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{f.severityLabel}</span>
                <span className="text-sm font-medium text-slate-900">{f.title}</span>
                <span className="text-sm text-slate-600 break-words">{f.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </WorkspaceSection>

      {/* Decision history — the append-only human decision record + the factual contrast status. */}
      <WorkspaceSection title="Decision history" id="decision-history" actions={<TaxonomyBadge kind="observed" />}>
        <div className="mb-3 flex items-center gap-3">
          <span className={`inline-flex items-center rounded-lg px-3 py-1 text-sm font-semibold ring-1 ${contrast.toneClass}`}>
            {contrast.label}
          </span>
          <span className="sr-only">{contrast.srLabel}</span>
          <span className="text-xs text-slate-500">Engine recommendation vs recorded human decision.</span>
        </div>

        {decisions.length === 0 ? (
          <p className="text-sm italic text-slate-400">No human decision has been recorded on this scenario yet.</p>
        ) : (
          <ol className="space-y-3">
            {decisions.map((d, i) => (
              <li key={i} className="rounded-lg border border-slate-200 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900">{d.decisionLabel}</span>
                  <span className="text-xs text-slate-400">· {d.at}</span>
                  {d.actor ? <span className="text-xs text-slate-500">· {d.actor}</span> : null}
                  {d.engineSuggested ? (
                    <span className="text-xs text-slate-500">· engine suggested {d.engineSuggested}</span>
                  ) : null}
                </div>
                {d.rationale ? <p className="mt-1 text-sm text-slate-700 break-words">{d.rationale}</p> : null}
              </li>
            ))}
          </ol>
        )}
        <p className="mt-4 text-xs text-slate-400">
          Decisions are recorded in Advanced analysis — this workspace is read-only.
        </p>
      </WorkspaceSection>
    </>
  );
}
