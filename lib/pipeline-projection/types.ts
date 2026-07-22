// E4 · Projection: types. docs/architecture/E4_PROJECTION_DESIGN.md + PROJECTION_RESULT_CONTRACT.md.
// Projection OBSERVES active Decision Facts in the FactGraph to derive stage (PR-INV-10). EvaluationArtifacts are
// optional SUPPORTING explanation. Observational, disposable, never authoritative (Law 4/8, PR-INV-1..10).

import type { FactGraph } from "@/lib/pipeline-facts";
import type { EvaluationArtifact } from "@/lib/pipeline-predicates";

/** A stage bound to the ONE Decision Fact type whose presence projects it (OWN4-INV-1). LEAD binds to null. */
export type StageEntry = { stage: string; decisionFactType: string | null };
export type StageSpine = { spineId: string; spineVersion: string; entries: StageEntry[] };

export type Labeled = { code: string; detail?: string };
export type Inconsistency = Labeled;

/** The frontier is about OBSERVED TRUTH; the optional artifact only explains why that truth exists. */
export type FrontierEntry = {
  stage: string;
  decisionFactType: string | null;
  present: boolean; // the Decision Fact is active (decision-visible) in the graph
  supportingArtifact: EvaluationArtifact | null;
};

export type ProjectionResult = {
  projectionId: string;
  projectionVersion: string;
  spineVersion: string;
  stage: string;
  completeness: "COMPLETE" | "PARTIAL";
  labels: Labeled[];
  indicators: Labeled[];
  frontier: FrontierEntry[];
  decidingStage: string;
  decidingArtifact: EvaluationArtifact | null;
  evaluationArtifacts: EvaluationArtifact[];
  derivedFacts: Labeled[];
  explanation: { reasoning: string[]; decidingDecisionFactType: string | null; inconsistencies: Inconsistency[] };
};

export type ProjectionPolicy = {
  projectionVersion: string;
  /** Decision Fact type pairs that must not both be active (mutual-exclusivity inconsistency). */
  mutuallyExclusive?: [string, string][];
};

export type ProjectInput = {
  spine: StageSpine;
  graph: FactGraph;
  /** Optional SUPPORTING artifacts keyed by Decision Fact type (explanation only; never the stage driver). */
  evaluationArtifacts?: Record<string, EvaluationArtifact>;
  projectionPolicy: ProjectionPolicy;
};
