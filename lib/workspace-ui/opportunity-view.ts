// CRE Operating Workspace — UI M1 Increment 3 (Opportunity Workspace).
//
// PURE presentation view-models over EXISTING opportunity/diligence/stage-policy/closing-gate outputs.
// No data access, no clock/random, no mutation. It DISPLAYS existing governed outputs (it does not
// synthesize Missing Information — that is Increment 5 — and it introduces no new recommendation logic;
// `suggestedAction` is passed through verbatim from stage policy and classified as Recommended).

import { STAGE_ORDER, stageLabel } from "@/lib/opportunity-options";

// Mirror of the existing StageMoveEvaluation shape (kept local so this module stays presentation-pure).
export type StageEval = {
  outcome: "ALLOW" | "REQUIRES_ATTESTATION" | "DENY";
  stageLabel: string;
  missingTruth: string[];
  missingArtifacts: string[];
  message: string;
  suggestedAction: string;
  canOverride: boolean;
};

export function usd(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `$${value.toLocaleString("en-US")}`;
}

// Stage position (Computed) over the authoritative native OpportunityStage order.
export function stagePositionView(stage: string): { label: string; index: number; total: number; positionLabel: string } {
  const total = STAGE_ORDER.length;
  const index = (STAGE_ORDER as string[]).indexOf(stage);
  const human = index >= 0 ? index + 1 : 0;
  return { label: stageLabel(stage), index, total, positionLabel: index >= 0 ? `Stage ${human} of ${total}` : "Unknown stage" };
}

export function nextStageOf(stage: string): string | null {
  const order = STAGE_ORDER as string[];
  const i = order.indexOf(stage);
  return i >= 0 && i < order.length - 1 ? order[i + 1] : null;
}

// Diligence summary (Computed) — passes through the existing summarizeDiligence output.
export type DiligenceSummary = { total: number; requested: number; received: number; reviewed: number; missing: number; readyForUnderwriting: boolean };
export function diligenceView(s: DiligenceSummary): DiligenceSummary & { ratioLabel: string } {
  return { ...s, ratioLabel: `${s.reviewed} reviewed · ${s.received} received · ${s.missing} missing of ${s.total}` };
}

// Closing gate (Computed) — passes through getClosingGateStatus.
export type ClosingGate = { ready: boolean; blockingLabels: string[]; message: string | null };
export function closingGateView(g: ClosingGate): { ready: boolean; blockerCount: number; blockerLabels: string[]; statusLabel: string; message: string | null } {
  return {
    ready: g.ready,
    blockerCount: g.blockingLabels.length,
    blockerLabels: g.blockingLabels.slice(),
    statusLabel: g.ready ? "Ready to close" : g.blockingLabels.length ? `${g.blockingLabels.length} blocker${g.blockingLabels.length === 1 ? "" : "s"}` : "Closing not started",
    message: g.message,
  };
}

// Stage readiness for the NEXT stage (display-only of the existing evaluation).
export type StageReadinessView =
  | { state: "terminal" }
  | { state: "error"; reason: string }
  | { state: "available"; targetLabel: string; outcome: StageEval["outcome"]; missingTruth: string[]; missingArtifacts: string[]; suggestedAction: string; message: string };

export function stageReadinessView(next: StageEval | { error: string } | null): StageReadinessView {
  if (next === null) return { state: "terminal" };
  if ("error" in next) return { state: "error", reason: next.error };
  return {
    state: "available",
    targetLabel: next.stageLabel,
    outcome: next.outcome,
    missingTruth: next.missingTruth.slice(),
    missingArtifacts: next.missingArtifacts.slice(),
    suggestedAction: next.suggestedAction,
    message: next.message,
  };
}

// Cross-links — only where the destination record already exists (never imply unavailable ones).
export type CrossLink = { label: string; href: string; detail: string; available: boolean };
export function crossLink(label: string, href: string | null, detail: string): CrossLink {
  return { label, href: href ?? "#", detail, available: Boolean(href) };
}
