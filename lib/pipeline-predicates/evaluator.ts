// E2 · Slice B — Predicate Engine: the SINGLE side-effect-free evaluator (Law 6).
// Determinism surface = FactGraph + ruleSetVersion (+ carried policyVersion). Nothing else: no time, DB, HTTP,
// randomness, cache, or env (GI-2 / PE-INV-2). v1.1 adds a deterministic EvaluationTrace, assembled around the
// same composition boundary (context.evaluate). The same evaluator serves authorization, projection, what-if, and
// tests. docs/architecture/PREDICATE_ENGINE_DESIGN.md · EVALUATION_RESULT_CONTRACT.md.

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

/** A stable digest of the graph's decision-relevant content — deterministic (no clock/random). */
function graphFingerprint(graph: FactGraph): string {
  const facts = graph.activeFacts
    .map((f) => ({ id: f.id, t: f.factType, k: f.subjectKey, s: f.state, op: f.operation, av: f.artifactVersion, p: f.payload }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return createHash("sha256").update(JSON.stringify({ vc: graph.versionContext, facts })).digest("hex").slice(0, 32);
}

function computeEvaluationId(predicateId: string, ctx: EvaluationContext): string {
  const input = { predicateId, rs: ctx.ruleSetVersion, pv: ctx.policyVersion, fp: graphFingerprint(ctx.graph) };
  return createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 32);
}

/** Resolve + run one predicate against a context, wrapping into an EvaluationResult. Fail-closed (never throws). */
function runPredicate(predicateId: string, context: EvaluationContext): EvaluationResult {
  const determinismStamp: DeterminismStamp = {
    graphVersionContext: context.graph.versionContext,
    predicateVersion: context.ruleSetVersion,
  };
  const base = {
    evaluationId: computeEvaluationId(predicateId, context),
    predicateId,
    policyVersion: context.policyVersion,
    ruleSetVersion: context.ruleSetVersion,
    determinismStamp,
  };
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

export type EngineInput = {
  graph: FactGraph;
  ruleSetVersion: string;
  policyVersion: string;
  registry?: PredicateRegistry;
};

// ── v1.0 API (unchanged): result-only, given-a-context ───────────────────────────────────────────

/** Build an EvaluationContext whose `evaluate` routes sub-evaluations through THIS evaluator (PE-INV-1). */
export function makeContext(input: EngineInput): EvaluationContext {
  const context: EvaluationContext = {
    graph: input.graph,
    ruleSetVersion: input.ruleSetVersion,
    policyVersion: input.policyVersion,
    registry: input.registry ?? defaultRegistry,
    evaluate: (predicateId: string) => runPredicate(predicateId, context),
  };
  return context;
}

/** The one entry point (result only). Fail-closed. */
export function evaluate(predicateId: string, context: EvaluationContext): EvaluationResult {
  return runPredicate(predicateId, context);
}

/** Convenience: build a context (default registry) and evaluate to a result. */
export function evaluatePredicate(predicateId: string, input: EngineInput): EvaluationResult {
  return runPredicate(predicateId, makeContext(input));
}

// ── v1.1 API: the single output object — result + deterministic reasoning trace ───────────────────

type ContextBase = { graph: FactGraph; ruleSetVersion: string; policyVersion: string; registry: PredicateRegistry };

/** Recursively evaluate, assembling the trace tree around the composition boundary (context.evaluate). */
function evaluateArtifactRec(predicateId: string, cbase: ContextBase): EvaluationArtifact {
  const children: TraceNode[] = [];
  const context: EvaluationContext = {
    graph: cbase.graph,
    ruleSetVersion: cbase.ruleSetVersion,
    policyVersion: cbase.policyVersion,
    registry: cbase.registry,
    // Sub-evaluation records the child's trace node (in call order) and returns the child's result (PE-INV-1).
    evaluate: (childId: string) => {
      const child = evaluateArtifactRec(childId, cbase);
      children.push(child.trace.root);
      return child.result;
    },
  };
  const result = runPredicate(predicateId, context);
  const node: TraceNode = Object.freeze({
    predicateId,
    satisfied: result.satisfied,
    reasons: result.reasons,
    factsRelied: result.factsRelied,
    missing: result.missing,
    children: Object.freeze(children) as TraceNode[],
  });
  return Object.freeze({ result, trace: Object.freeze({ root: node }) }) as EvaluationArtifact;
}

/**
 * The canonical evaluator output (v1.1): `{ result, trace }`. The trace is deterministic (PE-INV-6) and complete
 * (every result reason appears in the trace — PE-INV-7); it EXPLAINS the authoritative result.
 */
export function evaluateArtifact(predicateId: string, input: EngineInput): EvaluationArtifact {
  return evaluateArtifactRec(predicateId, {
    graph: input.graph,
    ruleSetVersion: input.ruleSetVersion,
    policyVersion: input.policyVersion,
    registry: input.registry ?? defaultRegistry,
  });
}
