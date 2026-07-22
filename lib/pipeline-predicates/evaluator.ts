// E2 · Slice B — Predicate Engine: the SINGLE side-effect-free evaluator (Law 6).
// Determinism surface = FactGraph + ruleSetVersion (+ carried policyVersion). Nothing else: no time, DB, HTTP,
// randomness, cache, or env (GI-2 / PE-INV-2). The same evaluator serves authorization, projection, what-if, and
// tests, so they agree by construction. docs/architecture/PREDICATE_ENGINE_DESIGN.md.

import { createHash } from "node:crypto";

import type { FactGraph } from "@/lib/pipeline-facts";
import type { DeterminismStamp, EvaluationContext, EvaluationResult, PredicateRegistry } from "./types";
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

export type EngineInput = {
  graph: FactGraph;
  ruleSetVersion: string;
  policyVersion: string;
  registry?: PredicateRegistry;
};

/** Build an EvaluationContext whose `evaluate` routes sub-evaluations through THIS evaluator (PE-INV-1). */
export function makeContext(input: EngineInput): EvaluationContext {
  const context: EvaluationContext = {
    graph: input.graph,
    ruleSetVersion: input.ruleSetVersion,
    policyVersion: input.policyVersion,
    registry: input.registry ?? defaultRegistry,
    evaluate: (predicateId: string) => evaluate(predicateId, context),
  };
  return context;
}

/** The one entry point. Fail-closed: unknown/throwing predicate ⇒ satisfied:false with a reason (never throws). */
export function evaluate(predicateId: string, context: EvaluationContext): EvaluationResult {
  const determinismStamp: DeterminismStamp = {
    graphVersionContext: context.graph.versionContext,
    predicateVersion: context.ruleSetVersion,
  };
  const evaluationId = computeEvaluationId(predicateId, context);
  const base = { evaluationId, predicateId, policyVersion: context.policyVersion, ruleSetVersion: context.ruleSetVersion, determinismStamp };

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

/** Convenience: build a context (default registry) and evaluate. */
export function evaluatePredicate(predicateId: string, input: EngineInput): EvaluationResult {
  return evaluate(predicateId, makeContext(input));
}
