// CRE Operating Workspace — UI Milestone 1, Increment 1 (presentational primitives).
//
// Element taxonomy: every displayed data element is exactly ONE of Observed / Computed / Recommended.
// This is PRESENTATION LOGIC ONLY — pure, deterministic, no data access, no clock/random. It never
// classifies domain records (that is later-increment synthesis); it only describes how each category is
// presented so a recommendation can never be styled as an observed fact.

import type { IconName } from "@/components/icons";

export type ElementKind = "observed" | "computed" | "recommended";

export const ELEMENT_KINDS: readonly ElementKind[] = ["observed", "computed", "recommended"] as const;

export type ElementKindDescriptor = {
  kind: ElementKind;
  /** Short visible label. */
  label: string;
  /** Screen-reader sentence — meaning must not depend on color/icon alone. */
  srLabel: string;
  /** One-line purpose, for tooltips/help. */
  description: string;
  /** Decorative icon (aria-hidden in the component). */
  iconName: IconName;
  /** Visual tone token; meaning is ALSO carried by label + srLabel (never color-only). */
  toneClass: string;
};

const DESCRIPTORS: Record<ElementKind, ElementKindDescriptor> = {
  observed: {
    kind: "observed",
    label: "Observed",
    srLabel: "Observed fact: a value stored or returned directly by the system.",
    description: "A directly stored or returned fact (e.g., owner name, seller status, property address).",
    iconName: "check",
    toneClass: "bg-slate-100 text-slate-700 ring-slate-200",
  },
  computed: {
    kind: "computed",
    label: "Computed",
    srLabel: "Computed value: a deterministic calculation derived from stored facts.",
    description: "A deterministic calculation (e.g., checklist completion, days since contact, an aggregate metric).",
    iconName: "analyzer",
    toneClass: "bg-brand-50 text-brand-700 ring-brand-100",
  },
  recommended: {
    kind: "recommended",
    label: "Recommended",
    srLabel: "Recommendation: system guidance, not an observed fact.",
    description: "System guidance or a suggested action (e.g., contact seller, review missing diligence).",
    iconName: "spark",
    toneClass: "bg-amber-50 text-amber-800 ring-amber-200",
  },
};

/** Deterministic descriptor for a taxonomy category. Pure. */
export function describeElementKind(kind: ElementKind): ElementKindDescriptor {
  return DESCRIPTORS[kind];
}
