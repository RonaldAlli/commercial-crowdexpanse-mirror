// E6 · API: DTOs + error taxonomy. docs/architecture/API_CONTRACT.md + API_ERROR_CONTRACT.md.
// The API is a TRANSPORT layer (API-INV-1): it orchestrates canonical subsystems and translates their outputs;
// it owns no business semantics. These are transport representations of the frozen internal contracts.

import type { ActorSnapshot, AuthorizationDecision, AuthorizationPolicy, OperationRef } from "@/lib/pipeline-authorization";
import type { VersionContext } from "@/lib/pipeline-facts";
import type { ProjectionPolicy, ProjectionResult, StageSpine } from "@/lib/pipeline-projection";

/** Optimistic concurrency via DETERMINISTIC identities — never opaque runtime tokens (§4). */
export type OptimisticVersion = {
  expectedDecisionId?: string;
  expectedEvaluationId?: string;
  expectedProjectionId?: string;
  expectedGlobalSequence?: string; // BigInt as string
};

export type ContractVersions = {
  api: string;
  ruleSetVersion: string;
  policyVersion: string;
  authPolicyVersion: string;
  spineVersion: string;
  projectionVersion: string;
};

export type FactOperationRequest = {
  requestId: string; // client-generated TRANSPORT idempotency key (§4a) — not a reasoning identity
  organizationId: string;
  opportunityId: string;
  actor: ActorSnapshot;
  capability: string;
  operation: OperationRef;
  policy: AuthorizationPolicy;
  versionContext: VersionContext;
  expectedVersion?: OptimisticVersion;
  subjectKey?: string | null;
  state?: string | null;
  payload?: Record<string, unknown> | null;
  artifactVersion?: string | null;
  spine: StageSpine;
  projectionPolicy: ProjectionPolicy;
};

export type ErrorCategory = "validation" | "concurrency" | "authorization" | "business-precondition" | "migration" | "infrastructure";

export type ApiError = {
  category: ErrorCategory;
  httpStatus: number;
  subsystemCode?: string; // ORIGINAL frozen code, preserved
  subsystemOutcome?: unknown; // original subsystem outcome AS-IS (e.g. the fresh AuthorizationDecision)
  detail?: string;
  decision?: AuthorizationDecision;
  contractVersions: ContractVersions;
};

export type FactOperationResponse = {
  requestId: string;
  outcome: "COMMITTED" | "DENIED" | "STALE";
  decision: AuthorizationDecision; // AS-IS from E3
  committedFact?: { id: string; factChainId: string; globalSequence: string; provenance: string };
  committedGlobalSequence?: string;
  projectedThroughGlobalSequence?: string;
  projection?: ProjectionResult; // AS-IS from E4 (post-commit)
  contractVersions: ContractVersions;
  error?: ApiError;
};
