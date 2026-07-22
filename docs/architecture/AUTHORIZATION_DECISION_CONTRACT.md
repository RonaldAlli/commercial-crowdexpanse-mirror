# AuthorizationDecision — Public Contract **v1.0** (FROZEN, pre-E3)

> **What this freezes:** the *output* of E3 Authorization — the permission outcome for a **fact operation**. Frozen
> before any authorization code is written, exactly as the E1 ledger API, Fact Graph API, and EvaluationResult/
> Artifact contracts were. Derived from the Phase-3 [Authorization Model](./OPPORTUNITY_PIPELINE_AUTHORIZATION_MODEL.md)
> (AUTH-INV-1..11, frozen DENY taxonomy §11a). Consumes the finalized [EvaluationResult/Artifact](./EVALUATION_RESULT_CONTRACT.md).
> Governed by Constitution Law 8 (authorization is on fact operations, never stages; observational). 2026-07-22.
>
> **Change discipline:** identical to the other frozen contracts — `Code → Architecture → Specification → Business
> Decision`. Breaking change ⇒ major bump + decision process; additive ⇒ minor.

---

## 1. Shape — `{ decision, explanation }` (mirrors `EvaluationArtifact { result, trace }`)

Authorization has **one output object** with the same authoritative/derived split as the evaluator:

```
AuthorizationDecision = {
  decision: {                    // AUTHORITATIVE — the permission outcome
    decisionId:     string,      // deterministic identity (see §3)
    allow:          boolean,
    denyCodes:      string[],    // stable DENY taxonomy (Authorization Model §11a); empty ⇔ allow
    actor:          ActorRef,    // WHO (actor class + id) — a class, not a privilege level
    capability:     string,      // WHICH capability is being exercised
    operation:      FactOpRef,   // the fact operation authorized (factType/class + op + target+version)
    policyVersion:  string,      // the authorization policy version applied
  },
  explanation: {                 // DERIVED — why the decision is what it is
    evaluationArtifact: EvaluationArtifact,   // the { result, trace } consumed (the business-truth justification)
    policyReasons:      { code: string, detail?: string }[],  // how capability+policy mapped to allow/denyCodes
  },
}
```

- **`decision` is authoritative** (the permission result); **`explanation` is derived** from the
  `EvaluationArtifact` (and the policy application). The explanation never determines the decision — same authority
  chain as `result` over `trace`.
- **Deterministic** (mirrors PE-INV-2): identical inputs ⇒ identical `AuthorizationDecision`, `decisionId` included.
- **Fail-closed**: absent a satisfied capability grant, the decision is `allow:false` with a `denyCode` — never an
  implicit allow, never a thrown exception to the caller.

## 2. What Authorization is — and is NOT

Authorization **applies capability + policy to an already-computed evaluation.** The layering:

```
EvaluationArtifact  →  AuthorizationPolicy  →  AuthorizationDecision
```

It **never**: evaluates predicates (that's E2·B — it *consumes* the `EvaluationArtifact`), reconstructs facts,
inspects the ledger (Law 13), or projects stages (E4). It owns **only** capability, actor, operation, and
permission. Business truth lives below it in the evaluator; permission is the one thing it adds.

## 3. `decisionId` vs `authorizationEventId` — identity vs execution

Mirrors `evaluationId` vs execution exactly:

- **`decisionId`** — a **deterministic identity**, `H(actor, capability, operation, evaluation inputs, policyVersion)`.
  The same inputs always produce the same `decisionId`. It answers *"is this the same authorization decision?"* — a
  content address, reproducible, part of the deterministic reasoning layer.
- **`authorizationEventId`** — an **operational** id, created **only when an authorization is actually executed or
  audited**. It lives **outside** the `AuthorizationDecision` (attached by the operational/audit system), so the
  decision itself stays deterministic while runtime systems can still attach a per-occurrence identity.

## 4. Relationship to the evaluator

The `evaluationArtifact` inside `explanation` carries the full deterministic reasoning (`result` + `trace`) that
justified the decision. Authorization does not re-explain business logic — it references the evaluator's explanation
and adds only *policy-level* reasons (which capability/policy rule produced allow or a specific denyCode). This is
the Law-6 payoff: one evaluator, one explanation, reused rather than duplicated.

## 5. Out of scope

No stage, no projection, no fact mutation, no ledger read, no execution/timing metadata inside the decision. Those
belong to E4, E1, or the operational/audit layer — never the deterministic `AuthorizationDecision`.
