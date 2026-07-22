// E2 · Slice B — Predicate Engine: the SINGLE side-effect-free evaluator (Law 6).
// Determinism surface = FactGraph + ruleSetVersion (+ carried policyVersion). Nothing else: no time, DB, HTTP,
// randomness, cache, or env (GI-2 / PE-INV-2). The canonical output is one object — EvaluationArtifact
// { result, trace }; the result-only entries are a projection of it. Recursion is path-aware and acyclic
// (PE-INV-9): a predicate already on the evaluation path fails closed (CYCLE_DETECTED) instead of re-entering.
// docs/architecture/PREDICATE_ENGINE_DESIGN.md · EVALUATION_RESULT_CONTRACT.md.

import { createHash } from "node:crypto";

import type { FactGraph } from "@/lib/pipeline-facts";
import type {
  DeterminismStamp,
  EvaluationArtifact,
  EvaluationContext,
  EvaluationResult,
  PredicateRegistry,
  TraceNode,
} from "./types";
import { predicateRegistry as defaultRegistry } from "./registry";

export type EngineInput = {
  graph: FactGraph;
  ruleSetVersion: string;
  policyVersion: string;
  registry?: PredicateRegistry;
};

type ContextBase = { graph: FactGraph; ruleSetVersion: string; policyVersion: string; registry: PredicateRegistry };

const baseOf = (input: EngineInput): ContextBase => ({
  graph: input.graph,
  ruleSetVersion: input.ruleSetVersion,
  policyVersion: input.policyVersion,
  registry: input.registry ?? defaultRegistry,
});

/** A stable digest of the graph's decision-relevant content — deterministic (no clock/random). */
function graphFingerprint(graph: FactGraph): string {
  const facts = graph.activeFacts
    .map((f) => ({ id: f.id, t: f.factType, k: f.subjectKey, s: f.state, op: f.operation, av: f.artifactVersion, p: f.payload }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return createHash("sha256").update(JSON.stringify({ vc: graph.versionContext, facts })).digest("hex").slice(0, 32);
}

function baseFields(predicateId: string, cbase: ContextBase) {
  const determinismStamp: DeterminismStamp = {
    graphVersionContext: cbase.graph.versionContext,
    predicateVersion: cbase.ruleSetVersion,
  };
  const evaluationId = createHash("sha256")
    .update(JSON.stringify({ predicateId, rs: cbase.ruleSetVersion, pv: cbase.policyVersion, fp: graphFingerprint(cbase.graph) }))
    .digest("hex")
    .slice(0, 32);
  return { evaluationId, predicateId, policyVersion: cbase.policyVersion, ruleSetVersion: cbase.ruleSetVersion, determinismStamp };
}

/** Resolve + run one predicate against a context, wrapping into an EvaluationResult. Fail-closed (never throws). */
function runPredicate(predicateId: string, context: EvaluationContext): EvaluationResult {
  const base = baseFields(predicateId, context);
  const predicate = context.registry.get(predicateId, context.ruleSetVersion);
  if (!predicate) {
    return { ...base, satisfied: false, reasons: [{ code: "UNKNOWN_PREDICATE", detail: predicateId }], factsRelied: [], missing: [predicateId] };
  }
  try {
    const outcome = predicate(context);
    return { ...base, satisfied: outcome.satisfied, reasons: outcome.reasons, factsRelied: outcome.factsRelied, missing: outcome.missing };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { ...base, satisfied: false, reasons: [{ code: "PREDICATE_ERROR", detail }], factsRelied: [], missing: [] };
  }
}

const freezeNode = (result: EvaluationResult, children: TraceNode[]): TraceNode =>
  Object.freeze({
    predicateId: result.predicateId,
    satisfied: result.satisfied,
    reasons: result.reasons,
    factsRelied: result.factsRelied,
    missing: result.missing,
    children: Object.freeze(children) as TraceNode[],
  });

/**
 * The single recursion. `path` is the predicate stack; a predicate already on it fails closed (PE-INV-9) so the
 * trace is always a finite, acyclic tree. Sub-evaluations record child trace nodes in call order (PE-INV-1/8).
 */
function evaluateInternal(predicateId: string, cbase: ContextBase, path: string[]): EvaluationArtifact {
  if (path.includes(predicateId)) {
    const result: EvaluationResult = {
      ...baseFields(predicateId, cbase),
      satisfied: false,
      reasons: [{ code: "CYCLE_DETECTED", detail: [...path, predicateId].join(" -> ") }],
      factsRelied: [],
      missing: [predicateId],
    };
    return Object.freeze({ result, trace: Object.freeze({ root: freezeNode(result, []) }) }) as EvaluationArtifact;
  }
  const nextPath = [...path, predicateId];
  const children: TraceNode[] = [];
  const context: EvaluationContext = {
    graph: cbase.graph,
    ruleSetVersion: cbase.ruleSetVersion,
    policyVersion: cbase.policyVersion,
    registry: cbase.registry,
    evaluate: (childId: string) => {
      const child = evaluateInternal(childId, cbase, nextPath);
      children.push(child.trace.root);
      return child.result;
    },
  };
  const result = runPredicate(predicateId, context);
  return Object.freeze({ result, trace: Object.freeze({ root: freezeNode(result, children) }) }) as EvaluationArtifact;
}

// ── Public API ────────────────────────────────────────────────────────────────────────────────────

/** The canonical evaluator output (v1.1): `{ result, trace }`. Deterministic (PE-INV-6), complete (PE-INV-7). */
export function evaluateArtifact(predicateId: string, input: EngineInput): EvaluationArtifact {
  return evaluateInternal(predicateId, baseOf(input), []);
}

/** Convenience: the authoritative result only (= `evaluateArtifact(...).result`). */
export function evaluatePredicate(predicateId: string, input: EngineInput): EvaluationResult {
  return evaluateInternal(predicateId, baseOf(input), []).result;
}

/** Lower-level: evaluate to a result using an existing context's inputs (starts a fresh evaluation path). */
export function evaluate(predicateId: string, context: EvaluationContext): EvaluationResult {
  return evaluateInternal(
    predicateId,
    { graph: context.graph, ruleSetVersion: context.ruleSetVersion, policyVersion: context.policyVersion, registry: context.registry },
    [],
  ).result;
}

/** Build a top-level EvaluationContext (path-aware sub-evaluation, default registry). */
export function makeContext(input: EngineInput): EvaluationContext {
  const cbase = baseOf(input);
  return {
    graph: cbase.graph,
    ruleSetVersion: cbase.ruleSetVersion,
    policyVersion: cbase.policyVersion,
    registry: cbase.registry,
    evaluate: (predicateId: string) => evaluateInternal(predicateId, cbase, []).result,
  };
}
