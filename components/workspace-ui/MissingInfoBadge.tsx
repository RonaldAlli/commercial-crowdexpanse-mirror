// CRE Operating Workspace — UI Milestone 1, Increment 1.
//
// Contract:
//   guarantees — visualizes ONE of the four distinct states (missing / incomplete / conflicting /
//     unavailable) with icon AND text AND a screen-reader sentence; never collapses them into one
//     generic warning.
//   does NOT — determine which state applies, and does NOT represent known negatives (e.g., do-not-call);
//     those are facts, not missing information.
//   later increments supply — the deterministic derivation of the state from domain records.

import { Icon } from "@/components/icons";
import { describeMissingInfo, type MissingInfoState } from "@/lib/workspace-ui/missing-info";

export function MissingInfoBadge({
  state,
  detail,
  className = "",
}: {
  state: MissingInfoState;
  /** Optional specifics, e.g. "rent roll". */
  detail?: string;
  className?: string;
}) {
  const d = describeMissingInfo(state);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${d.toneClass} ${className}`}
      title={d.description}
    >
      <span aria-hidden="true" className="inline-flex">
        <Icon name={d.iconName} className="h-3.5 w-3.5" />
      </span>
      <span>
        {d.label}
        {detail ? `: ${detail}` : ""}
      </span>
      <span className="sr-only">
        {d.srLabel}
        {detail ? ` (${detail})` : ""}
      </span>
    </span>
  );
}
