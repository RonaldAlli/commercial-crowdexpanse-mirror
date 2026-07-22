// E2 · Slice B — Predicate Engine public surface.
// The single side-effect-free evaluator over the immutable FactGraph (Law 6/13). Evaluates predicates only —
// no projection (E4) / authorization (E3) / fact mutation (E1) / automation (E8).
export * from "./types";
export * from "./evaluator";
export { predicateRegistry, registeredPredicateIds } from "./registry";
