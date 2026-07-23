// E7 · UI view models. docs/architecture/UI_VIEW_MODEL_CONTRACT.md + E7_UI_DESIGN.md.
// Derived, disposable presentation shapes assembled from the frozen contracts. UI-INV-1 (observational),
// UI-INV-2 (view models not raw subsystem objects), UI-INV-5 (no contract mutation — organize/format only).

import type { AuthorizationDecision } from "@/lib/pipeline-authorization";
import type { Inconsistency, Labeled, ProjectionResult } from "@/lib/pipeline-projection";

// ── Domain view models (one per frozen contract; embed it unchanged) ──────────────────────────────
export type OpportunityViewModel = {
  opportunityId: string;
  stage: string;
  completeness: "COMPLETE" | "PARTIAL";
  versions: { spineVersion: string; projectionVersion: string };
  projection: ProjectionResult; // AS-IS (UI-INV-2/5)
};

export type ActivityViewModel = { indicators: Labeled[]; labels: Labeled[] };

export type ProjectionPanelViewModel = { frontier: ProjectionResult["frontier"]; inconsistencies: Inconsistency[]; projection: ProjectionResult };

export type TimelineEntry = { factId: string; factType: string; factClass: string; operation: string; sequence: string; active: boolean };
export type TimelineViewModel = { entries: TimelineEntry[] };

export type AuthorizationPanelViewModel = { present: boolean; allow?: boolean; denyCodes?: string[]; decision?: AuthorizationDecision };

export type ValidationPresentation = { present: boolean; category?: string; httpStatus?: number; subsystemCode?: string; message?: string };

export type NavigationViewModel = { tabs: string[]; activeTab: string }; // presentation state only (UI-INV-3)

// ── Presentation view model (a screen's worth of panels) ──────────────────────────────────────────
export type PipelineViewModel = {
  opportunity: OpportunityViewModel;
  projectionPanel: ProjectionPanelViewModel;
  activity: ActivityViewModel;
  timeline: TimelineViewModel;
  authorization: AuthorizationPanelViewModel;
  validation: ValidationPresentation;
  navigation: NavigationViewModel;
};

// ── Stable React-props shape (does NOT change when business semantics change) ──────────────────────
export type PipelineRenderProps = {
  opportunityId: string;
  headline: { stage: string; completeness: string };
  panels: { key: string; title: string; items: { label: string; value: string }[] }[];
  navigation: NavigationViewModel;
};
