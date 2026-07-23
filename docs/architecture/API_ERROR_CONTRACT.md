# Opportunity Pipeline API — Error Contract **v1.0** (FROZEN, pre-E6)

> **What this freezes:** the API's error taxonomy, separate from the [DTOs](./API_CONTRACT.md). The API **translates
> subsystem outcomes** into a small, stable set of categories — it never invents new business semantics (API-INV-1).
> The underlying frozen subsystem codes (Authorization §11a DENY codes, migration outcomes, etc.) are **preserved**
> in the error detail, never renamed. 2026-07-23.

---

## 1. Shape

```
ApiError = {
  category: ErrorCategory,     // one of the six below
  httpStatus: number,          // the transport status (preserved alongside the code — no lossy translation)
  subsystemCode?: string,      // the ORIGINAL frozen code, preserved (e.g. INSUFFICIENT_CAPABILITY, STALE_FACT_GRAPH)
  subsystemOutcome?: unknown,  // the original subsystem outcome object (e.g. the fresh AuthorizationDecision) AS-IS
  detail?: string,
  decision?: AuthorizationDecision,   // when the error originates from authorization (embedded AS-IS)
  contractVersions: ContractVersions,
}
```

**No lossy translation:** an `ApiError` always preserves `category` · `httpStatus` · `subsystemCode` ·
`subsystemOutcome` together (e.g. `CONCURRENCY` / `409` / `STALE_FACT_GRAPH` / fresh `AuthorizationDecision`).

## 2. The six categories (stable)

| Category | Meaning | Translates from | HTTP |
|---|---|---|---|
| **validation** | malformed request, unknown fact/operation, unsupported version | `UNKNOWN_FACT` / `UNKNOWN_OPERATION`; version-pin unsupported | 400 |
| **concurrency** | the caller's optimistic version is stale | commit guard `STALE_FACT_GRAPH`; `expected*Id`/`expectedGlobalSequence` mismatch | 409 |
| **authorization** | actor/capability/exception-scope denial | `INSUFFICIENT_CAPABILITY` · `INVALID_EXCEPTION_SCOPE` · `MIGRATION_NOT_PERMITTED` | 403 |
| **business-precondition** | a business rule is unmet | `POLICY_PRECONDITION_FAILED` · `MISSING_REQUIRED_EVIDENCE` · `VERSION_MISMATCH` · `EXCLUSIVITY_CONFLICT` | 422 |
| **migration** | a migration mapping/plan issue | `EVIDENCE_MIGRATION_ORIGIN_FORBIDDEN` / `REVIEW` outcomes | 422 |
| **infrastructure** | unexpected/transient (DB, IO) | any uncaught operational failure | 500/503 |

## 3. Translation rule (never invent semantics)

The API maps a subsystem outcome to exactly one category and **carries the original code** in `subsystemCode`. A
`DENIED` `AuthorizationDecision` is split by its frozen deny codes: **authorization** codes → `authorization`;
**business** codes → `business-precondition`; `STALE_FACT_GRAPH` → `concurrency`. The full `AuthorizationDecision`
(decision + explanation, incl. the embedded `EvaluationArtifact`) is attached AS-IS so the client has the complete
deterministic explanation — the API adds no new reason of its own (mirrors AUTH-INV-13 / PR-INV-7).

## 4. Boundaries

The API never creates a business deny code, never reclassifies a subsystem code's meaning, and never strips the
deterministic explanation. Categories are for *transport/HTTP shaping*; authority remains in the subsystem codes.
`ApiError → this contract → Authorization §11a + Migration + subsystem outcomes → Decision Log`.
