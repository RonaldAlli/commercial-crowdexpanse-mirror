// E3 · Authorization public surface.
// - authorize(): a PURE decision function over an already-computed EvaluationArtifact. It performs NO predicate
//   evaluation, fact reconstruction, ledger read, or stage projection (Law 8/13, AUTH-INV-10/12).
// - revalidateForCommit(): the commit-time guard. It ORCHESTRATES the canonical Fact Graph Builder (E2·A) and the
//   one Evaluator (E2·B) to obtain a fresh decision, then compares deterministic identities (AUTH-INV-11/14). It
//   implements NO independent reconstruction or evaluation algorithm — it reuses the single canonical components.
export * from "./types";
export { authorize } from "./authorize";
export { getPolicy, policyIds } from "./policy";
export { revalidateForCommit } from "./commit-guard";
export type { CommitRevalidationInput, CommitRevalidation } from "./commit-guard";
