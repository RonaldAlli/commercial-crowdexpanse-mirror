// Pipeline facts — public surface.
// E1 Core Fact Infrastructure: record + reconstruct facts; the ontology registry.
// E2 Slice A Fact Graph Builder: the single authoritative ledger interpretation (Law 12).
// No predicate evaluation / stage projection / authorization / inconsistency logic here (E2 Slice B / E3 / E4).
export * from "./registry";
export * from "./service";
export * from "./fact-graph";
