// E2 · Slice B — Predicate Engine: the versioned predicate registry.
// (predicateId, ruleSetVersion) → Predicate. Each rule-set version has its own implementations; a predicate's
// policy constants are embedded in its versioned implementation (no config store, no DSL).

import type { Predicate, PredicateRegistry } from "./types";
import { RS1_PREDICATES } from "./predicates/rs-1";

const REGISTRY: Record<string, Record<string, Predicate>> = {
  "rs-1": RS1_PREDICATES,
};

export const predicateRegistry: PredicateRegistry = {
  get(predicateId, ruleSetVersion) {
    return REGISTRY[ruleSetVersion]?.[predicateId];
  },
  has(predicateId, ruleSetVersion) {
    return Boolean(REGISTRY[ruleSetVersion]?.[predicateId]);
  },
};

/** The predicate ids registered for a rule-set version (introspection/tests). */
export function registeredPredicateIds(ruleSetVersion: string): string[] {
  return Object.keys(REGISTRY[ruleSetVersion] ?? {});
}
