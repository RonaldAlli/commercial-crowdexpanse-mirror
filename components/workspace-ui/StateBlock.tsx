// CRE Operating Workspace — UI Milestone 1, Increment 1.
//
// Contract:
//   guarantees — a consistent, accessible presentation for loading / empty / unavailable / error states,
//     with the correct ARIA live role (status vs alert) and meaning carried by text (not color/icon
//     alone). "Unavailable" is kept distinct from "empty".
//   does NOT — decide which state applies or fetch anything.
//   later increments supply — the real data flows that choose a state.

import { Icon } from "@/components/icons";
import { describePresentationState, type PresentationState } from "@/lib/workspace-ui/presentation-states";

export function StateBlock({
  state,
  message,
  className = "",
}: {
  state: PresentationState;
  /** Optional override of the default label text. */
  message?: string;
  className?: string;
}) {
  const d = describePresentationState(state);
  return (
    <div
      role={d.ariaRole}
      aria-live={d.ariaRole === "alert" ? "assertive" : "polite"}
      className={`flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 px-6 py-10 text-center ${className}`}
    >
      <span aria-hidden="true" className={`inline-flex ${d.toneClass}`}>
        <Icon name={d.iconName} className="h-6 w-6" />
      </span>
      <p className={`text-sm font-medium ${d.toneClass}`}>{message ?? d.label}</p>
      <p className="text-xs text-slate-400">{d.description}</p>
      <span className="sr-only">{d.srLabel}</span>
    </div>
  );
}
