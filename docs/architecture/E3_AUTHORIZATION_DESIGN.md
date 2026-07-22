# E3 · Authorization — Technical Design (corrections applied; ready to freeze)

> Authorization applies **capability + policy** to an **already-computed** `EvaluationArtifact`, producing an
> `AuthorizationDecision`. It adds *only* permission — never evaluates predicates, reconstructs facts, reads the
> ledger, or projects stages (Law 8/13, AUTH-INV-10/12). Two components: a **pure decision function** and a
> **commit-time guard** (AUTH-INV-11/14). Derives from the frozen Phase-3
> [Authorization Model](./OPPORTUNITY_PIPELINE_AUTHORIZATION_MODEL.md) (AUTH-INV-1..14, **frozen DENY taxonomy
> §11a**) + the [AuthorizationDecision Contract](./AUTHORIZATION_DECISION_CONTRACT.md). Ratified w/ corrections
> 2026-07-22.

---

## 1. Two components (correction 2 — decision vs commit validity)

- **Pure decision** — `authorize(inputs) → AuthorizationDecision`. Deterministic, observational (AUTH-INV-10/12).
  Consumes a **caller-precomputed** `EvaluationArtifact`; it never invokes the evaluator itself.
- **Commit-time guard** — `revalidateForCommit(expected, freshInputs) → { valid, decision }`. At the transaction
  boundary it **reruns the same canonical components** (rebuild the current FactGraph → re-evaluate the required
  predicate through the *one* evaluator → refresh the actor snapshot → recompute `authorize`) and compares
  deterministic identities. A stale authorization is rejected with `STALE_FACT_GRAPH`. **A prior ALLOW is never a
  reservation, lock, or durable permission** (AUTH-INV-14). The DB transaction wiring itself is E6; E3 owns the
  revalidation logic.

## 2. The pure decision function

```
authorize({ actor, capability, operation, policy, evaluationArtifact }) → AuthorizationDecision
```

- `actor` = **immutable `ActorSnapshot`** `{ actorId, actorClass, capabilities: string[], identityVersion? }`.
  Capabilities are **orthogonal to actor classes** (a HUMAN/DETERMINISTIC_EVALUATOR is not automatically
  authorized). The snapshot's provenance/currency belong to the identity layer; the commit guard revalidates it.
- `capability` — OPP-3 fact-lifecycle capability (`DRAFT_*` / `RECORD_*_EVIDENCE` / `DECLARE_*` / `RETRACT_*` /
  `CORRECT_HISTORY` / `ACCEPT_*_EXCEPTION`).
- `operation` — `{ factType, factClass, op, targetChainId?, version }` (the intended fact operation — part of
  identity, §5).
- `policy` — the `AuthorizationPolicy` (§3).
- `evaluationArtifact` — the `EvaluationArtifact` for `policy.requiredPredicate`, precomputed by the caller. `authorize`
  **verifies** it matches the policy's bindings and reads `result.satisfied`; it never evaluates.

## 3. `AuthorizationPolicy` — first-class, versioned, structured

```
AuthorizationPolicy = {
  policyId:             string,   // stable identity (distinct policies may share a version label)
  policyVersion:        string,
  capability:           string,
  operation:            OperationSelector,
  allowedActorClasses:  ActorClass[],
  predicateRequirement: "REQUIRED" | "INFORMATIONAL" | "NOT_APPLICABLE",   // explicit; E3 v1 uses REQUIRED / NOT_APPLICABLE
  requiredPredicate?:   string,
  requiredFactClass?:   FactClass,
  requiredVersionScope?: { policyVersion?: string, ruleSetVersion?: string, artifactVersion?: string },
  requiredRuleSetVersion?: string,
  allowExceptions?:     boolean,
  preconditionFailureCode?: "MISSING_REQUIRED_EVIDENCE" | "POLICY_PRECONDITION_FAILED",  // frozen code an unsatisfied precondition maps to (default POLICY_PRECONDITION_FAILED)
}
```

Policy is **data, versioned** — no business logic in code; each entry independently identifiable (`policyId`) and
traceable.

## 4. Decision procedure — FROZEN DENY codes + canonical order (correction 1)

**Reuses the frozen §11a taxonomy exactly — no renamed codes.** Every failing check appends its stable code; **`allow`
iff `denyCodes` is empty.** Finer detail lives in **structured `policyReasons`** under a stable code. Codes and
reasons are emitted in a **frozen canonical precedence** (independent of evaluation/insertion order, so `decisionId`
is stable):

| # | Group | Frozen DENY code | Structured `policyReason` (detail) |
|---|---|---|---|
| 1 | Request validity | `UNKNOWN_FACT` / `UNKNOWN_OPERATION` | unregistered factType / operation |
| 2 | Actor & capability | `INSUFFICIENT_CAPABILITY` | `CAPABILITY_NOT_HELD` (capability ∉ actor.capabilities) · `ACTOR_CLASS_NOT_ALLOWED` (class ∉ allowedActorClasses) |
| 3 | Migration / exception scope | `MIGRATION_NOT_PERMITTED` · `INVALID_EXCEPTION_SCOPE` | migration op by non-MIGRATION_PRINCIPAL · exception outside allowed scope |
| 4 | Version binding | `VERSION_MISMATCH` | `REQUIRED_PREDICATE_MISMATCH` · `POLICY_VERSION_MISMATCH` · `RULE_SET_MISMATCH` · `ARTIFACT_VERSION_SCOPE_MISMATCH` |
| 5 | Business precondition | `POLICY_PRECONDITION_FAILED` · `MISSING_REQUIRED_EVIDENCE` | code is **declared by policy** (`preconditionFailureCode`) — Authorization never infers the category from the missing item's name |
| 6 | Exclusivity / commit-state | `EXCLUSIVITY_CONFLICT` · `STALE_FACT_GRAPH` | conflicting active fact · stale vs current graph (commit guard only) |

`ACTOR_CLASS_NOT_ALLOWED` maps to the frozen `INSUFFICIENT_CAPABILITY` (per your preferred path — no silent new
public code). Version-binding detail (predicate/policy/rule-set/artifact mismatch) is preserved in `policyReasons`
under the stable `VERSION_MISMATCH` code.

## 5. `AuthorizationDecision` + `decisionId`

```
AuthorizationDecision = {
  decision:    { allow, denyCodes, actor, capability, operation, decisionId, policyVersion },  // AUTHORITATIVE
  explanation: { evaluationArtifact, policyReasons, authorizationReasoning },                   // DERIVED (AUTH-INV-13)
}
```

`decisionId = H(actorId, actorClass, identityVersion, capability, operation{factType,version,targetChainId,op},
evaluationArtifact.result.evaluationId, policyId, policyVersion, canonicalDenyCodes)`. **Includes `policyId` (not just
`policyVersion`)** and the **target/operation identity** — so authorizing `DECLARE CLEAR_TO_CLOSE` never collides
with another declaration that happens to share actor + artifact. The embedded `evaluationArtifact` is byte-identical
to the evaluator's output (AUTH-INV-13). `authorizationEventId` (execution/audit) is **never** inside the decision.

## 6. New invariant

- **AUTH-INV-14 · Decision vs commit guard.** `authorize()` is a pure decision function. A separate transactional
  guard revalidates its inputs against current authoritative state (fresh FactGraph + re-evaluation + refreshed
  actor snapshot) before an authorized fact operation commits, comparing deterministic identities and rejecting
  stale authorization (`STALE_FACT_GRAPH`). **A previously returned ALLOW is never a reservation or durable
  permission** — it is a decision about a specific observed state, valid only while that state holds (AUTH-INV-11).

## 7. Initial capability set + acceptance (AC-AUTH-*)

Authorize `DECLARE` of `DILIGENCE_COMPLETE`, `CLEAR_TO_CLOSE`, `TRANSACTION_CLOSED.{CASH,THIRD_PARTY_FINANCED,
ASSIGNMENT}`. Per capability: **Allow · Wrong actor-class · Missing capability · Failed business predicate · Wrong
version · Migration · Regression** + **commit-guard staleness**. Every scenario asserts the **decision** (allow +
exact frozen deny codes), the **deny grouping** (authorization vs business), and **explanation preservation** (the
embedded `evaluationArtifact` is unchanged) — not merely ALLOW/DENY.

## 8. Boundaries / traceability

No predicate evaluation (E2·B) · no fact reconstruction / ledger read (Law 13, AUTH-INV-12) · no stage projection
(E4) · no fact mutation (E1) · no `authorizationEventId`/timing in the decision. `authorize → this design →
Authorization Model (AUTH-INV-1..14, §11a) + AuthorizationDecision Contract + EvaluationResult/Artifact Contract →
Decision Log`.
