// E2 · Slice B — Predicate Engine: types. docs/architecture/PREDICATE_ENGINE_DESIGN.md.
// A predicate is a pure, versioned function over an immutable FactGraph (Law 6/13). It reasons ONLY over
// its EvaluationContext (PE-INV-1) and is referentially transparent (PE-INV-2). No projection/authz/mutation.

import type { FactGraph, VersionContext } from "@/lib/pipeline-facts";

/** A structured, explainable reason for a verdict. */
export type Reason = { code: string; detail?: string };

/** What a predicate returns — wrapped by the evaluator into an EvaluationResult. */
export type PredicateOutcome = {
  satisfied: boolean;
  reasons: Reason[];
  factsRelied: string[]; // fact ids consulted (traceability)
  missing: string[]; // unmet requirements (fail-closed detail)
};

/** Reproducibility coordinates: the graph's version context + the predicate version (= ruleSetVersion). */
export type DeterminismStamp = {
  graphVersionContext: VersionContext;
  predicateVersion: string;
};

export type EvaluationResult = {
  evaluationId: string; // DETERMINISTIC content hash of the inputs (never random) — preserves PE-INV-2
  predicateId: string;
  satisfied: boolean;
  policyVersion: string;
  ruleSetVersion: string;
  determinismStamp: DeterminismStamp;
  reasons: Reason[];
  factsRelied: string[];
  missing: string[];
};

/**
 * A single node in the reasoning tree — LOGICAL data only (no timestamps/durations/host/process/random ids).
 * `children` are the sub-predicates invoked via `context.evaluate`, in evaluation order.
 */
export type TraceNode = {
  predicateId: string;
  satisfied: boolean;
  reasons: Reason[];
  factsRelied: string[];
  missing: string[];
  children: TraceNode[];
};

/** The deterministic reasoning trace — it EXPLAINS the result (never the other way around). */
export type EvaluationTrace = {
  root: TraceNode;
};

/**
 * The evaluator's single output object: the authoritative `result` plus the explanatory `trace`. Consumers may
 * ignore `trace` if they don't need it. (Unrelated to the GI-3 ARTIFACT fact class — this is evaluator output.)
 */
export type EvaluationArtifact = {
  result: EvaluationResult;
  trace: EvaluationTrace;
};

/** A predicate evaluates ONLY against its supplied context (PE-INV-1). */
export type Predicate = (context: EvaluationContext) => PredicateOutcome;

/** (predicateId, ruleSetVersion) → Predicate. Versioned: each rule-set has its own implementations. */
export type PredicateRegistry = {
  get(predicateId: string, ruleSetVersion: string): Predicate | undefined;
  has(predicateId: string, ruleSetVersion: string): boolean;
};

/** The predicate's entire world. Sub-evaluation happens ONLY via `evaluate` (through the evaluator — PE-INV-1). */
export type EvaluationContext = {
  graph: FactGraph;
  ruleSetVersion: string;
  policyVersion: string;
  registry: PredicateRegistry;
  evaluate(predicateId: string): EvaluationResult;
};
