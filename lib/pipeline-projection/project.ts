// E4 · Projection: project() — derive presentation state by OBSERVING active Decision Facts (PR-INV-10).
// Observational, deterministic, disposable (Law 4/8). Stage = furthest active Decision Fact along the spine
// (PR-INV-8: never from indicators/artifacts). Artifacts are optional supporting explanation, embedded byte-identical.

import { createHash } from "node:crypto";

import type { EvaluationArtifact } from "@/lib/pipeline-predicates";
import type { FrontierEntry, Inconsistency, Labeled, ProjectInput, ProjectionResult } from "./types";

export function project(input: ProjectInput): ProjectionResult {
  const { spine, graph, evaluationArtifacts = {}, projectionPolicy } = input;

  // Observe each spine entry's Decision Fact (decision-visible active — retractions suppress, FactGraph §4.3).
  const frontier: FrontierEntry[] = spine.entries.map((e) => ({
    stage: e.stage,
    decisionFactType: e.decisionFactType,
    present: e.decisionFactType == null ? true : graph.activeByType(e.decisionFactType) != null,
    supportingArtifact: e.decisionFactType ? evaluationArtifacts[e.decisionFactType] ?? null : null,
  }));

  // Stage = furthest active (PR-INV-8/10). LEAD (index 0) is the base and always present.
  let decidingIdx = 0;
  for (let i = 0; i < frontier.length; i++) if (frontier[i].present) decidingIdx = i;
  const stage = frontier[decidingIdx].stage;
  const decidingDecisionFactType = frontier[decidingIdx].decisionFactType;
  const decidingArtifact = frontier[decidingIdx].supportingArtifact;

  // Completeness: every ACTIVE non-base entry has its supporting artifact (PR-INV-9); stage stands regardless.
  const activeNonBase = frontier.filter((f) => f.present && f.decisionFactType != null);
  const completeness: "COMPLETE" | "PARTIAL" = activeNonBase.every((f) => f.supportingArtifact != null) ? "COMPLETE" : "PARTIAL";

  // Inconsistencies (core taxonomy of 4). Helpers observe the graph only.
  const existed = (t: string | null): boolean => (t == null ? true : graph.byFactType(t).length > 0);
  const retracted = (t: string | null): boolean => t != null && existed(t) && graph.activeByType(t) == null;
  const inconsistencies: Inconsistency[] = [];
  let neverDeclaredHole = false;
  for (let i = 1; i <= decidingIdx; i++) {
    if (frontier[i].present) continue;
    const t = spine.entries[i].decisionFactType;
    if (retracted(t)) inconsistencies.push({ code: "RETRACTED_PREDECESSOR_SURVIVING_SUCCESSOR", detail: `${spine.entries[i].stage} retracted; ${stage} survives` });
    else { inconsistencies.push({ code: "MISSING_PREDECESSOR", detail: spine.entries[i].stage }); neverDeclaredHole = true; }
  }
  if (neverDeclaredHole) inconsistencies.push({ code: "CONFLICTING_SUCCESSOR", detail: stage });
  for (const [a, b] of projectionPolicy.mutuallyExclusive ?? []) {
    if (graph.activeByType(a) != null && graph.activeByType(b) != null) inconsistencies.push({ code: "MUTUALLY_EXCLUSIVE_ACTIVE", detail: `${a} & ${b}` });
  }

  // Indicators / derivedFacts from the SUPPORTING result (not the trace, §2a) — attention only, never stage.
  const indicators: Labeled[] = [];
  const derivedFacts: Labeled[] = [];
  for (const f of activeNonBase) {
    if (f.supportingArtifact && !f.supportingArtifact.result.satisfied) {
      indicators.push({ code: "NEEDS_REVIEW", detail: `${f.stage}: declared decision no longer meets current policy` });
    }
  }
  if (inconsistencies.length) indicators.push({ code: "HAS_INCONSISTENCY", detail: String(inconsistencies.length) });

  const evaluationArtifactsList = frontier.map((f) => f.supportingArtifact).filter(Boolean) as EvaluationArtifact[];
  const activeFactIds = frontier
    .filter((f) => f.present && f.decisionFactType != null)
    .map((f) => graph.activeByType(f.decisionFactType as string)!.id);
  const supportEvalIds = evaluationArtifactsList.map((a) => a.result.evaluationId).sort();
  const projectionId = createHash("sha256")
    .update(JSON.stringify({ s: spine.spineId, sv: spine.spineVersion, pv: projectionPolicy.projectionVersion, af: activeFactIds, se: supportEvalIds }))
    .digest("hex")
    .slice(0, 32);

  return {
    projectionId,
    projectionVersion: projectionPolicy.projectionVersion,
    spineVersion: spine.spineVersion,
    stage,
    completeness,
    labels: [],
    indicators,
    frontier,
    decidingStage: stage,
    decidingArtifact,
    evaluationArtifacts: evaluationArtifactsList,
    derivedFacts,
    explanation: { reasoning: [`stage=${stage} (furthest active decision fact); completeness=${completeness}`], decidingDecisionFactType, inconsistencies },
  };
}
