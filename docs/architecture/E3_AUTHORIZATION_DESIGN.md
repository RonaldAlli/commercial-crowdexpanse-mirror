# E3 · Authorization — Technical Design (ratified decisions; freeze before implementation)

> Authorization applies **capability + policy** to an **already-computed** `EvaluationArtifact`, producing an
> `AuthorizationDecision`. It adds *only* permission — it never evaluates predicates, reconstructs facts, reads the
> ledger, or projects stages (Law 8/13, AUTH-INV-12). Derives from the frozen Phase-3
> [Authorization Model](./OPPORTUNITY_PIPELINE_AUTHORIZATION_MODEL.md) (AUTH-INV-1..11, DENY taxonomy §11a) and the
> frozen [AuthorizationDecision Contract](./AUTHORIZATION_DECISION_CONTRACT.md). Founder-ratified 2026-07-22.

---

## 1. The function

```
authorize({ actor, capability, operation, policy, evaluationArtifact }) → AuthorizationDecision
```

**Pure and deterministic** (mirrors PE-INV-2): identical inputs ⇒ identical decision. Consumes **only** the five
inputs below (AUTH-INV-12). Fail-closed: default DENY; never throws to the caller.

- `actor` = `{ id, actorClass, capabilities: string[] }` — the actor's class **and** its granted capability set.
  **Capabilities are orthogonal to actor classes**: a HUMAN is not automatically authorized; a
  DETERMINISTIC_EVALUATOR is not automatically privileged. Authorization always requires *actor class + capability +
  policy + evaluation* together.
- `capability` — the capability being exercised (OPP-3 fact-lifecycle: `DRAFT_*` / `RECORD_*_EVIDENCE` /
  `DECLARE_*` / `RETRACT_*` / `CORRECT_HISTORY` / `ACCEPT_*_EXCEPTION`).
- `operation` — the fact operation: `{ factType, factClass, op, targetChainId?, version }`.
- `policy` — the `AuthorizationPolicy` (§2), selected by `(capability, operation)` at `policyVersion`.
- `evaluationArtifact` — the `EvaluationArtifact` for the policy's `requiredPredicate`, **computed by the caller via
  the one evaluator** and passed in. Authorization does not evaluate it itself (AUTH-INV-12); it *verifies* the
  artifact matches the policy and reads its `satisfied`.

## 2. `AuthorizationPolicy` — a first-class, versioned object

```
AuthorizationPolicy = {
  policyId:             string,     // stable identity for audit / evolution
  policyVersion:        string,
  capability:           string,
  operation:            OperationSelector,   // factType/class/op this policy governs
  allowedActorClasses:  ActorClass[],
  requiredPredicate?:   string,     // business precondition (a predicateId) the EvaluationArtifact must satisfy
  requiredFactClass?:   FactClass,  // GI-3 class the operation must target
  requiredVersionScope?: string,    // version the evaluation/artifact must match
  allowExceptions?:     boolean,    // whether an ACCEPT_*_EXCEPTION path may override PRECONDITION_UNSATISFIED
}
```

Policy is **data, versioned** (like rule-sets) — no business logic in code. Each entry is independently
identifiable (`policyId`) and traceable.

## 3. Decision procedure (fail-closed; deny codes accumulate)

Collect every applicable deny code; **`allow` iff `denyCodes` is empty**. Two groups (frozen taxonomy §11a):

**Authorization failures** (permission):
- `CAPABILITY_NOT_HELD` — `capability ∉ actor.capabilities`.
- `INVALID_ACTOR_CLASS` — `actor.actorClass ∉ policy.allowedActorClasses`.
- `MIGRATION_NOT_PERMITTED` — a migration-origin operation by a non-`MIGRATION_PRINCIPAL` (or policy disallows).

**Business failures** (evaluation):
- `VERSION_MISMATCH` — `evaluationArtifact.result.predicateId ≠ policy.requiredPredicate`, or versions ≠
  `requiredVersionScope`. (The artifact must be the *right* evaluation.)
- `PRECONDITION_UNSATISFIED` — `requiredPredicate` set and `!evaluationArtifact.result.satisfied` (and no accepted
  exception when `allowExceptions`).
- `EVIDENCE_INCOMPLETE` / `EXCLUSIVITY_CONFLICT` — finer business codes mapped from the artifact's `missing`/reasons
  where present (else `PRECONDITION_UNSATISFIED`).

## 4. `AuthorizationDecision` (frozen contract §1, refined split)

```
AuthorizationDecision = {
  decision: {          // AUTHORITATIVE
    allow, denyCodes, actor, capability, operation, decisionId, policyVersion,
  },
  explanation: {       // DERIVED — never rewrites the evaluator's reasoning (AUTH-INV-13)
    evaluationArtifact,        // embedded AS-IS
    policyReasons,             // which policy checks passed/failed (permission-level)
    authorizationReasoning,    // human-facing summary appended by authz — additive only
  },
}
```

`decisionId = H(actor identity+class, capability, operation, evaluationArtifact.result.evaluationId, policyVersion)`
— deterministic identity. `authorizationEventId` (execution/audit) is **never** here; the operational layer attaches
it. The embedded `evaluationArtifact` is byte-identical to what the evaluator produced (AUTH-INV-13).

## 5. New invariants (extend the Authorization Model)

- **AUTH-INV-12 · Authorization purity.** `authorize` consumes only `{ AuthorizationPolicy, EvaluationArtifact,
  Actor, Capability, Operation }`. It never queries the ledger, rebuilds the FactGraph, evaluates predicates
  independently, or projects stages. (Complements Laws 12/13.)
- **AUTH-INV-13 · Explanation preservation.** Authorization never rewrites or reinterprets the evaluator's
  explanation. The `EvaluationArtifact` is embedded unchanged; authz may only *append* permission-specific
  reasoning.

## 6. Initial capability set (acceptance anchors)

Authorize `DECLARE` of `DILIGENCE_COMPLETE`, `CLEAR_TO_CLOSE`, `TRANSACTION_CLOSED.{CASH,THIRD_PARTY_FINANCED,
ASSIGNMENT}` — each policy names its `requiredPredicate` (the same-named predicate) + `allowedActorClasses`. Exercises
evaluation, actor class, capability mapping, versioning, migration, regression — without expanding the semantic
surface.

## 7. Acceptance (AC-AUTH-*)

Per capability: **Allow · Wrong actor(class) · Missing capability · Failed business predicate · Wrong version ·
Migration · Regression.** Every scenario asserts **decision** (allow + exact denyCodes), **deny grouping**
(authorization vs business), and **explanation preservation** (the embedded `evaluationArtifact` is unchanged) —
not merely the final ALLOW/DENY.

## 8. Boundaries

No predicate evaluation (E2·B) · no fact reconstruction / ledger read (Law 13, AUTH-INV-12) · no stage projection
(E4) · no fact mutation (E1) · no execution/timing/`authorizationEventId` in the decision. Traceability:
`authorize → this design → Authorization Model + AuthorizationDecision Contract + EvaluationResult/Artifact
Contract → Decision Log`.
