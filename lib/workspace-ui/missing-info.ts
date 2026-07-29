// CRE Operating Workspace — UI Milestone 1, Increment 1 (presentational primitives).
//
// Missing-information model: FOUR distinct states, never collapsed into one generic warning.
// PRESENTATION LOGIC ONLY — pure, deterministic, no data access. It does not infer state from domain
// records (later-increment synthesis); it only describes how each state is presented. A known NEGATIVE
// (e.g., do-not-call) is NOT a missing-information state and is intentionally absent here.

import type { IconName } from "@/components/icons";

export type MissingInfoState = "missing" | "incomplete" | "conflicting" | "unavailable";

export const MISSING_INFO_STATES: readonly MissingInfoState[] = [
  "missing",
  "incomplete",
  "conflicting",
  "unavailable",
] as const;

export type MissingInfoDescriptor = {
  state: MissingInfoState;
  label: string;
  /** Distinct definition — the four states must remain distinguishable. */
  description: string;
  /** Screen-reader sentence; meaning never depends on color/icon alone. */
  srLabel: string;
  iconName: IconName;
  toneClass: string;
};

const DESCRIPTORS: Record<MissingInfoState, MissingInfoDescriptor> = {
  missing: {
    state: "missing",
    label: "Missing",
    description: "Expected evidence is absent.",
    srLabel: "Missing: the expected information has not been provided.",
    iconName: "search",
    toneClass: "bg-slate-100 text-slate-700 ring-slate-200",
  },
  incomplete: {
    state: "incomplete",
    label: "Incomplete",
    description: "Some evidence exists but is insufficient.",
    srLabel: "Incomplete: some information is present but not enough to be sufficient.",
    iconName: "files",
    toneClass: "bg-amber-50 text-amber-800 ring-amber-200",
  },
  conflicting: {
    state: "conflicting",
    label: "Conflicting",
    description: "Available evidence disagrees.",
    srLabel: "Conflicting: the available information disagrees with itself.",
    iconName: "close",
    toneClass: "bg-rose-50 text-rose-800 ring-rose-200",
  },
  unavailable: {
    state: "unavailable",
    label: "Unavailable",
    description: "The system cannot currently obtain or evaluate the evidence.",
    srLabel: "Unavailable: the system cannot currently obtain or evaluate this information.",
    iconName: "bell",
    toneClass: "bg-slate-50 text-slate-500 ring-slate-200",
  },
};

/** Deterministic descriptor for a missing-information state. Pure. */
export function describeMissingInfo(state: MissingInfoState): MissingInfoDescriptor {
  return DESCRIPTORS[state];
}
