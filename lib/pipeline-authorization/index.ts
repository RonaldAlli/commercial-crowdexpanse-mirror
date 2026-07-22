// E3 · Authorization public surface. A pure decision function (authorize) + a commit-time guard
// (revalidateForCommit) over an already-computed EvaluationArtifact. Applies capability + policy only —
// no predicate evaluation / fact reconstruction / ledger read / stage projection (Law 8/13, AUTH-INV-10/12).
export * from "./types";
export { authorize } from "./authorize";
export { getPolicy, policyIds } from "./policy";
export { revalidateForCommit } from "./commit-guard";
export type { CommitRevalidationInput, CommitRevalidation } from "./commit-guard";
