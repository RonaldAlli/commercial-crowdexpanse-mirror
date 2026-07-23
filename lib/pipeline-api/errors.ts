// E6 · API: error translation. Maps a subsystem outcome to ONE of the six stable categories and PRESERVES the
// original frozen code (subsystemCode) + outcome (subsystemOutcome) — no lossy translation, no invented semantics
// (API-INV-1 / API_ERROR_CONTRACT.md).

import type { AuthorizationDecision } from "@/lib/pipeline-authorization";
import type { ApiError, ContractVersions, ErrorCategory } from "./types";

const CATEGORY_OF: Record<string, { category: ErrorCategory; httpStatus: number }> = {
  UNKNOWN_FACT: { category: "validation", httpStatus: 400 },
  UNKNOWN_OPERATION: { category: "validation", httpStatus: 400 },
  INSUFFICIENT_CAPABILITY: { category: "authorization", httpStatus: 403 },
  INVALID_EXCEPTION_SCOPE: { category: "authorization", httpStatus: 403 },
  MIGRATION_NOT_PERMITTED: { category: "authorization", httpStatus: 403 },
  VERSION_MISMATCH: { category: "business-precondition", httpStatus: 422 },
  POLICY_PRECONDITION_FAILED: { category: "business-precondition", httpStatus: 422 },
  MISSING_REQUIRED_EVIDENCE: { category: "business-precondition", httpStatus: 422 },
  EXCLUSIVITY_CONFLICT: { category: "business-precondition", httpStatus: 422 },
  STALE_FACT_GRAPH: { category: "concurrency", httpStatus: 409 },
};

/** Translate a DENIED AuthorizationDecision → ApiError using the FIRST (canonical-precedence) deny code. */
export function translateDenied(decision: AuthorizationDecision, contractVersions: ContractVersions): ApiError {
  const code = decision.decision.denyCodes[0];
  const mapped = CATEGORY_OF[code] ?? { category: "business-precondition" as ErrorCategory, httpStatus: 422 };
  return { ...mapped, subsystemCode: code, subsystemOutcome: decision, decision, contractVersions };
}

/** The commit-guard staleness error (concurrency), carrying the fresh decision AS-IS. */
export function staleError(decision: AuthorizationDecision, contractVersions: ContractVersions): ApiError {
  return { category: "concurrency", httpStatus: 409, subsystemCode: "STALE_FACT_GRAPH", subsystemOutcome: decision, decision, contractVersions };
}
