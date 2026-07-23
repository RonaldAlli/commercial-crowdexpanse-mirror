# Opportunity Pipeline API — Public Contract **v1.0** (FROZEN, pre-E6)

> **What this freezes:** the external interface of the pipeline. The API is a **transport / orchestration layer** —
> it wires the already-complete canonical subsystems and introduces **no** business semantics. Frozen before E6
> implementation, like every internal contract. Consumes the frozen internal contracts (E1 API, Fact Graph API,
> EvaluationResult/Artifact, AuthorizationDecision, ProjectionResult) and the [API Error Contract](./API_ERROR_CONTRACT.md).
> 2026-07-23.
>
> **Change discipline:** `Code → Architecture → Specification → Business Decision`. Breaking change ⇒ major bump +
> decision process; additive ⇒ minor.

---

## 1. API-INV-1 · The API is a transport layer

The API **never** evaluates, authorizes, projects, migrates, or reconstructs. It **orchestrates** the canonical
components:

```
API → Coordinator → { Fact Graph Builder · Evaluator · Authorization · Projection · Ledger }
```

Never `API → business logic`. Every business outcome is produced by a canonical subsystem and **translated** (not
reinterpreted) by the API. A DTO is a transport representation of a frozen internal contract — consumers consume it,
never re-derive it (mirrors PR-INV-4 / FG-INV-12 / consumer discipline).

## 2. The write path — perform an authorized fact operation

`POST /opportunities/{opportunityId}/fact-operations`

The Coordinator orchestrates: **build FactGraph → evaluate required predicate → authorize → (ALLOW) commit under the
guard → project**. All in one canonical pipeline; the API adds only transport.

```
FactOperationRequest = {
  requestId,                            // client-generated TRANSPORT idempotency key (§4a) — NOT a reasoning identity
  organizationId, opportunityId,
  actor: ActorSnapshot,                 // supplied by identity layer (immutable snapshot)
  capability, operation: OperationRef,
  policyId, policyVersion,              // selects the AuthorizationPolicy
  versionContext: { policyVersion, ruleSetVersion, artifactVersion? },
  expectedVersion: OptimisticVersion,   // §4
  payload?, subjectKey?, state?,        // fact content for the operation
}

FactOperationResponse = {
  requestId,
  outcome: "COMMITTED" | "DENIED" | "STALE",
  decision: AuthorizationDecision,      // AS-IS from E3 (decision + explanation) — never rewritten
  committedFact?: { id, factChainId, globalSequence, provenance },  // when COMMITTED
  committedGlobalSequence?,             // the appended fact's sequence (COMMITTED)
  projectedThroughGlobalSequence?,      // max sequence the post-commit projection observed (≥ committedGlobalSequence)
  projection: ProjectionResult,         // AS-IS from E4 (post-commit state)
  contractVersions: ContractVersions,   // §5
}
```

Commit is **transaction-scoped and race-safe (API-INV-2)** and **side-effect-free before commit (API-INV-3)** — see
[E6 API Design](./E6_API_DESIGN.md) §2–§5.

`DENIED` ⇒ the `AuthorizationDecision.decision.denyCodes` (frozen §11a) are surfaced through the
[Error Contract](./API_ERROR_CONTRACT.md); `STALE` ⇒ `STALE_FACT_GRAPH` from the commit guard (§4).

## 3. The read path — observe pipeline state

`GET /opportunities/{opportunityId}/pipeline` → `{ projection: ProjectionResult, contractVersions }`. Pure
observation (build FactGraph → project). Optionally `?frontier=true` includes the full `ProjectionResult.frontier`.

## 4. Optimistic concurrency — deterministic identities, not opaque tokens

`expectedVersion` participates via the platform's **deterministic identities**, never a replaced runtime token:

```
OptimisticVersion = {
  expectedDecisionId?: string,   // the AuthorizationDecision the caller acted on (E3)
  expectedEvaluationId?: string, // the evaluation the caller observed (E2·B)
  expectedProjectionId?: string, // the projection the caller displayed (E4)
  expectedGlobalSequence?: string, // the ledger position the caller last saw (E1)
}
```

At commit the Coordinator runs `revalidateForCommit` (AUTH-INV-14): it re-derives the decision against the **current**
FactGraph and compares identities; any drift ⇒ `STALE` (`STALE_FACT_GRAPH`). **`evaluationId` / `decisionId` /
`projectionId` remain the identities** — the API may attach an operational `authorizationEventId` alongside, but
never *replaces* the deterministic identities with an opaque one.

### 4a. Transport idempotency (`requestId`) — a different concern

`requestId` is a **client-generated transport idempotency key**. It does **not** replace `decisionId` /
`evaluationId` / `projectionId` / `globalSequence` (which identify *reasoning*) — it solves *transport retry
duplication* (a lost response causing a re-send, which could otherwise append the same fact twice). An idempotency
record `{ requestId → { factId, decisionId, responseDigest } }` is written **atomically with the fact**; a retried
`requestId` returns the **stored** response instead of appending again (E6 Design §6).

## 5. Version negotiation

Every response stamps the contract versions in force, so a consumer always knows the semantics it received:

```
ContractVersions = {
  api: "v1.0", ruleSetVersion, policyVersion, authPolicyVersion, spineVersion, projectionVersion,
  factGraphApi: "v1.1", evaluationArtifact: "v1.1", authorizationDecision: "v1.0", projectionResult: "v1.2",
}
```

A request may pin versions (`versionContext`, `policyId/policyVersion`); the API rejects an unsupported version via
the Error Contract (`validation`) rather than silently coercing.

## 6. Boundaries / traceability

No business logic in the API (API-INV-1). No reinterpretation of any embedded contract object (they pass through
AS-IS). No new identity scheme. `API → this contract → E1/FactGraph/Evaluation/Authorization/Projection contracts →
Decision Log`. Errors: [API_ERROR_CONTRACT.md](./API_ERROR_CONTRACT.md).
