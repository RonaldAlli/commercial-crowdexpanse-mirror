// E7 · UI: PURE view-model assembly (the AC-VM acceptance boundary). Deterministic (UI-INV-4): same input ⇒ same
// output; no clock/storage/cache. Embeds frozen contract objects unchanged (UI-INV-2/5) — only selects/labels/orders.

import type { AuthorizationDecision } from "@/lib/pipeline-authorization";
import type { ApiError } from "@/lib/pipeline-api";
import type { ProjectionResult } from "@/lib/pipeline-projection";
import type { PipelineFact } from "@prisma/client";
import type {
  ActivityViewModel, AuthorizationPanelViewModel, OpportunityViewModel, PipelineRenderProps, PipelineViewModel,
  ProjectionPanelViewModel, TimelineViewModel, ValidationPresentation,
} from "./types";

const TABS = ["Projection", "Activity", "Timeline", "Authorization", "Validation", "Fact Operations"];

export function assembleOpportunity(opportunityId: string, projection: ProjectionResult): OpportunityViewModel {
  return {
    opportunityId,
    stage: projection.stage,
    completeness: projection.completeness,
    versions: { spineVersion: projection.spineVersion, projectionVersion: projection.projectionVersion },
    projection, // AS-IS
  };
}

export function assembleActivity(projection: ProjectionResult): ActivityViewModel {
  return { indicators: [...projection.indicators], labels: [...projection.labels] };
}

export function assembleProjectionPanel(projection: ProjectionResult): ProjectionPanelViewModel {
  return { frontier: projection.frontier, inconsistencies: projection.explanation.inconsistencies, projection };
}

/** From the API read (ordered facts + the active-id set from the FactGraph) — the UI never reconstructs. */
export function assembleTimeline(orderedFacts: PipelineFact[], activeIds: ReadonlySet<string>): TimelineViewModel {
  return {
    entries: orderedFacts.map((f) => ({ factId: f.id, factType: f.factType, factClass: f.factClass, operation: f.operation, sequence: String(f.globalSequence), active: activeIds.has(f.id) })),
  };
}

export function assembleAuthorizationPanel(decision?: AuthorizationDecision): AuthorizationPanelViewModel {
  if (!decision) return { present: false };
  return { present: true, allow: decision.decision.allow, denyCodes: decision.decision.denyCodes, decision };
}

export function assembleValidation(error?: ApiError): ValidationPresentation {
  if (!error) return { present: false };
  return { present: true, category: error.category, httpStatus: error.httpStatus, subsystemCode: error.subsystemCode, message: `${error.category}${error.subsystemCode ? ` · ${error.subsystemCode}` : ""}${error.detail ? ` — ${error.detail}` : ""}` };
}

export function assemblePipeline(input: {
  opportunityId: string;
  projection: ProjectionResult;
  orderedFacts: PipelineFact[];
  activeIds: ReadonlySet<string>;
  decision?: AuthorizationDecision;
  error?: ApiError;
  activeTab?: string;
}): PipelineViewModel {
  return {
    opportunity: assembleOpportunity(input.opportunityId, input.projection),
    projectionPanel: assembleProjectionPanel(input.projection),
    activity: assembleActivity(input.projection),
    timeline: assembleTimeline(input.orderedFacts, input.activeIds),
    authorization: assembleAuthorizationPanel(input.decision),
    validation: assembleValidation(input.error),
    navigation: { tabs: [...TABS], activeTab: input.activeTab && TABS.includes(input.activeTab) ? input.activeTab : TABS[0] },
  };
}

/**
 * Map a PipelineViewModel → the React component's props. The SHAPE is STABLE — it does not change when business
 * semantics change (only the values do), so the renderer is independent of business meaning (AC-VM).
 */
export function toRenderProps(pvm: PipelineViewModel): PipelineRenderProps {
  const kv = (label: string, value: string) => ({ label, value });
  return {
    opportunityId: pvm.opportunity.opportunityId,
    headline: { stage: pvm.opportunity.stage, completeness: pvm.opportunity.completeness },
    panels: [
      { key: "projection", title: "Projection", items: pvm.projectionPanel.frontier.map((e) => kv(e.stage, e.present ? "reached" : "—")) },
      { key: "activity", title: "Activity", items: pvm.activity.indicators.map((i) => kv(i.code, i.detail ?? "")) },
      { key: "timeline", title: "Decision Timeline", items: pvm.timeline.entries.map((e) => kv(`${e.factType} (${e.operation})`, e.active ? "active" : "superseded")) },
      { key: "authorization", title: "Authorization", items: pvm.authorization.present ? [kv("allow", String(pvm.authorization.allow)), ...(pvm.authorization.denyCodes ?? []).map((c) => kv("deny", c))] : [] },
      { key: "validation", title: "Validation", items: pvm.validation.present ? [kv(pvm.validation.category ?? "", pvm.validation.message ?? "")] : [] },
      { key: "fact-operations", title: "Fact Operations", items: [kv("stage", pvm.opportunity.stage)] },
    ],
    navigation: pvm.navigation,
  };
}
