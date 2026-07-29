// CRE Operating Workspace — UI Milestone 1, Increment 1.
//
// Contract:
//   guarantees — presentation of an evidence chain (Recommendation -> Supporting -> Missing ->
//     Confidence -> Next action) with honest empty/partial states shown as accessible text: absent
//     confidence -> "Not yet scored", absent recommendation -> "No recommendation available", uncertain
//     next action -> a neutral review state. Missing supporting facts are visibly marked.
//   does NOT — infer, compute, or fabricate any evidence, confidence, or recommendation; the caller
//     supplies a fully-assembled chain.
//   later increments supply — the Next Best Action synthesis (Increment 5) that assembles the chain from
//     real facts.

import { Icon } from "@/components/icons";
import { deriveEvidenceView, type EvidenceChainInput } from "@/lib/workspace-ui/evidence";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-3 py-1.5 text-sm">
      <dt className="font-medium text-slate-500">{label}</dt>
      <dd className="text-slate-800">{children}</dd>
    </div>
  );
}

export function EvidenceChain({
  chain,
  headingId,
  className = "",
}: {
  chain: EvidenceChainInput;
  /** Id of the visible heading that labels this region (for aria-labelledby). */
  headingId: string;
  className?: string;
}) {
  const v = deriveEvidenceView(chain);
  return (
    <dl role="group" aria-labelledby={headingId} className={`divide-y divide-slate-100 ${className}`}>
      <Row label="Recommendation">
        {v.recommendation.state === "present" ? (
          <span className="font-medium text-slate-900">{v.recommendation.text}</span>
        ) : (
          <span className="italic text-slate-400">{v.recommendation.text}</span>
        )}
      </Row>

      <Row label="Supporting evidence">
        {v.supporting.length === 0 ? (
          <span className="italic text-slate-400">None provided</span>
        ) : (
          <ul className="space-y-1">
            {v.supporting.map((item, i) => (
              <li key={i} className="flex items-center gap-1.5">
                <span aria-hidden="true" className="inline-flex">
                  <Icon
                    name={item.state === "present" ? "check" : "close"}
                    className={`h-3.5 w-3.5 ${item.state === "present" ? "text-emerald-600" : "text-slate-400"}`}
                  />
                </span>
                <span className={item.state === "missing" ? "text-slate-500 line-through" : ""}>{item.label}</span>
                <span className="sr-only">{item.state === "present" ? "(present)" : "(missing)"}</span>
              </li>
            ))}
          </ul>
        )}
      </Row>

      <Row label="Missing evidence">
        {v.missing.length === 0 ? (
          <span className="italic text-slate-400">None</span>
        ) : (
          <ul className="list-inside list-disc space-y-1 text-slate-700">
            {v.missing.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        )}
      </Row>

      <Row label="Confidence">
        {v.confidence.state === "scored" ? (
          <span className="font-medium text-slate-900">{v.confidence.label}</span>
        ) : (
          <span className="italic text-slate-400">{v.confidence.label}</span>
        )}
      </Row>

      <Row label="Next action">
        {v.nextAction.state === "actionable" ? (
          <span className="font-medium text-brand-700">{v.nextAction.label}</span>
        ) : v.nextAction.state === "review" ? (
          <span className="font-medium text-amber-800">{v.nextAction.label}</span>
        ) : (
          <span className="italic text-slate-400">{v.nextAction.label}</span>
        )}
      </Row>
    </dl>
  );
}
