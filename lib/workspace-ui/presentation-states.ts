// CRE Operating Workspace — UI Milestone 1, Increment 1 (presentational primitives).
//
// Loading / empty / unavailable / error presentation states. Pure, deterministic, no data access.
// "Unavailable" (a capability does not exist yet) is deliberately distinct from "empty" (a real, empty
// result) — they must not be collapsed.

import type { IconName } from "@/components/icons";

export type PresentationState = "loading" | "empty" | "unavailable" | "error";

export const PRESENTATION_STATES: readonly PresentationState[] = [
  "loading",
  "empty",
  "unavailable",
  "error",
] as const;

export type PresentationStateDescriptor = {
  state: PresentationState;
  label: string;
  description: string;
  srLabel: string;
  iconName: IconName;
  /** ARIA live semantics for the container: status for loading/empty/unavailable, alert for error. */
  ariaRole: "status" | "alert";
  toneClass: string;
};

const DESCRIPTORS: Record<PresentationState, PresentationStateDescriptor> = {
  loading: {
    state: "loading",
    label: "Loading…",
    description: "Content is loading.",
    srLabel: "Loading content.",
    iconName: "activity",
    ariaRole: "status",
    toneClass: "text-slate-500",
  },
  empty: {
    state: "empty",
    label: "Nothing here yet",
    description: "There are no items to show.",
    srLabel: "Empty: there are no items to show.",
    iconName: "files",
    ariaRole: "status",
    toneClass: "text-slate-500",
  },
  unavailable: {
    state: "unavailable",
    label: "Not yet available",
    description: "This capability is not available yet.",
    srLabel: "Unavailable: this capability is not available yet.",
    iconName: "bell",
    ariaRole: "status",
    toneClass: "text-slate-400",
  },
  error: {
    state: "error",
    label: "Something went wrong",
    description: "The content could not be loaded.",
    srLabel: "Error: the content could not be loaded.",
    iconName: "close",
    ariaRole: "alert",
    toneClass: "text-rose-700",
  },
};

/** Deterministic descriptor for a presentation state. Pure. */
export function describePresentationState(state: PresentationState): PresentationStateDescriptor {
  return DESCRIPTORS[state];
}
