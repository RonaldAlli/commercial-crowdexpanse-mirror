// CRE Operating Workspace — UI Milestone 2, Increment 2: Missing Assumptions panel.
//
// Presentational + READ-ONLY. Answers "What information is preventing this deal from being fully
// underwritten?" beneath the (unchanged) Executive Structurability Summary. Groups assumptions by the
// engine's own operational key-sets, shows each one's four-state status (reusing the accepted MissingInfoBadge)
// and its EXISTING provenance (source / field / as-of) — never inferred. It edits nothing and deep-links to
// /analyzer for changes. Existing findings are not reinterpreted here.

import { WorkspaceSection } from "@/components/workspace-ui/WorkspaceSection";
import { MissingInfoBadge } from "@/components/workspace-ui/MissingInfoBadge";
import { TaxonomyBadge } from "@/components/workspace-ui/TaxonomyBadge";
import type { GuidedAssumptionsView, AssumptionItemView } from "@/lib/workspace-ui/guided-underwriting-assumptions";

function Provenance({ item }: { item: AssumptionItemView }) {
  if (!item.provenance) {
    return <span className="text-xs italic text-slate-400">No value on file — provenance not available.</span>;
  }
  const { source, sourceField, sourceAsOf } = item.provenance;
  return (
    <span className="text-xs text-slate-500 break-words">
      Source: <span className="font-medium text-slate-700">{source}</span>
      {sourceField ? <> · field: {sourceField}</> : <> · field: <span className="italic text-slate-400">not recorded</span></>}
      {sourceAsOf ? <> · as-of {sourceAsOf.slice(0, 10)}</> : <> · as-of <span className="italic text-slate-400">not recorded</span></>}
    </span>
  );
}

function Item({ item }: { item: AssumptionItemView }) {
  return (
    <li className={`flex flex-col gap-1 py-2 ${item.blocking ? "rounded-lg bg-rose-50/60 px-2 ring-1 ring-rose-200" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-slate-900">{item.label}</span>
        {item.status === "complete" ? (
          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
            Complete
          </span>
        ) : (
          <MissingInfoBadge state={item.status} />
        )}
        {item.blocking ? (
          <span className="text-xs font-semibold uppercase tracking-wide text-rose-700">Blocks underwriting</span>
        ) : null}
      </div>
      {item.affects ? <span className="text-xs text-slate-500">{item.affects}</span> : null}
      <Provenance item={item} />
    </li>
  );
}

export function MissingAssumptionsPanel({ assumptions }: { assumptions: GuidedAssumptionsView }) {
  if (assumptions.state === "no-underwriting") return null;

  const { groups, summary } = assumptions;
  const summaryLine =
    summary.missing === 0 && summary.incomplete === 0
      ? "All expected inputs are present with traceable provenance."
      : `${summary.missing} missing · ${summary.incomplete} incomplete provenance${
          summary.unavailable ? ` · ${summary.unavailable} unavailable` : ""
        }`;

  return (
    <WorkspaceSection
      title="What information is preventing a complete answer?"
      id="missing-assumptions"
      actions={<TaxonomyBadge kind="observed" />}
    >
      <p className="mb-3 text-sm text-slate-600">{summaryLine}</p>
      {summary.blockingMissingKey ? (
        <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800 ring-1 ring-rose-200">
          Purchase price is missing — no underwriting result can be derived until it is provided.
        </p>
      ) : null}
      <div className="space-y-5">
        {groups.map((g) => (
          <div key={g.title}>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">{g.title}</h3>
            <ul className="divide-y divide-slate-100">
              {g.items.map((item) => (
                <Item key={item.key} item={item} />
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-slate-400">
        Assumptions are edited in Advanced analysis — this workspace is read-only.
      </p>
    </WorkspaceSection>
  );
}
