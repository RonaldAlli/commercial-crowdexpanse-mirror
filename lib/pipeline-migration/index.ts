// E5 · Migration public surface. Classify (never infer) legacy data into the append-only ledger: an immutable
// deterministic Plan + an operational Execution. Never manufactures evidence (MIG-INV-2); observational w.r.t. the
// source (MIG-INV-3); versioned mappings (MIG-INV-4); immutable plans (MIG-INV-5).
export * from "./types";
export { getMapping } from "./mapping";
export { buildPlan } from "./plan";
export { executePlan } from "./execute";
export type { ExecutionContext } from "./execute";
